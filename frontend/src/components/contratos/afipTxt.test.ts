/**
 * Tests del registro de alta masiva de ARCA (diseño de 130 posiciones).
 *
 * Run with:
 *   npx tsx --test src/components/contratos/afipTxt.test.ts
 *   – o –
 *   npm run test:afip
 *
 * Usa el runner de Node (node:test + node:assert), igual que los tests del server.
 *
 * Por qué existen: el layout no tiene otra red. Un campo que se corre una posición, un importe que
 * pierde los centavos o una fecha de fin que aparece donde no va producen un archivo que ARCA acepta
 * y que da de alta mal — no falla, miente. Estos tests fijan las invariantes que no se pueden violar
 * aunque cambie de dónde salen los datos (que es justo lo que está cambiando con la migración de
 * categorías: la escala salarial se mudó de la categoría al grupo).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildAltaRecord, buildAltaTxt, describirRegistro, fechaAfip, LAYOUT_ALTA } from "./afipTxt";
import { resolveAfip, resolveAfipValues, resumenArca } from "./afipCompleteness";
import type { AfipCatalogs } from "./afipCompleteness";
import type { ContractOverviewRow } from "../../api/users";

// ---------------------------------------------------------------------------
// Fixtures — datos reales de producción, para que los números del test sean los
// que efectivamente salen en un archivo.
// ---------------------------------------------------------------------------

const EMPRESA_ID = "6a7f000000000000000000e1";
const SUCURSAL_ID = "6a7f000000000000000000s1";

/** Grupo 1 del CCT 0634/11: es el sueldo bruto que tiene hoy "Director de Programas". */
const SUELDO_BRUTO_CAT_1 = 2122135.35;
/** Grupo 12 del mismo convenio — el caso que motivó la duda de los centavos. */
const SUELDO_BRUTO_CAT_12 = 785955.27;

const catalogos = (over: Partial<AfipCatalogs> = {}): AfipCatalogs =>
  ({
    categorias: [
      { _id: "c1", externalId: "035283", name: "Director de Programas", data: { id: 1, numeroCategoria: 1, nombre: "Director de Programas", codigoAfip: 35283, convenio: "0634/11", sueldoBruto: SUELDO_BRUTO_CAT_1 } },
      { _id: "c12", externalId: "035294", name: "Cadete", data: { id: 12, numeroCategoria: 12, nombre: "Cadete", codigoAfip: 35294, convenio: "0634/11", sueldoBruto: SUELDO_BRUTO_CAT_12 } },
      { _id: "c0", externalId: "035300", name: "Sin escala", data: { id: 99, numeroCategoria: 13, nombre: "Sin escala", codigoAfip: 35300, convenio: "0634/11", sueldoBruto: 0 } },
    ],
    tipos: [
      { _id: "t1", name: "Plazo fijo 6x6 2030 SRL", data: { afipModalidadContrato: "021", afipTipoServicio: "001", afipModalidadLiquidacion: "1" } },
      { _id: "t2", name: "Tiempo Indeterminado - 2030 SRL", data: { afipModalidadContrato: "008", afipTipoServicio: "001", afipModalidadLiquidacion: "1" } },
    ],
    obrasSociales: [{ _id: "os1", externalId: "126205", name: "OSPIA", data: { id: 7 } }],
    sedes: [],
    empresas: [{ _id: EMPRESA_ID, obraSocialId: 7, sucursalIds: [SUCURSAL_ID], convenioIds: ["cv1"] }],
    sucursales: [{ _id: SUCURSAL_ID, codigo: "00001", domicilio: "ZAPIOLA 392", actividades: [{ codigo: "921430", descripcion: "SERVICIOS CONEXOS" }] }],
    // El convenio trae SU obra social: es de donde sale el RNOS en el caso normal. Antes el fixture
    // no la tenía y el registro se completaba igual, porque existía una obra social global que
    // rellenaba el hueco. Al eliminarse ese nivel, un convenio sin obra social deja el alta incompleta
    // —que es justamente lo que se quiere— y el contrato "completo" de base tiene que tenerla.
    convenios: [{ _id: "cv1", externalId: "0634/11", name: "TELEVISIÓN", obraSocialDefaultId: 7 }],
    ...over,
  }) as unknown as AfipCatalogs;

/** Contrato completo: con esto `buildAltaRecord` tiene que devolver un registro válido. */
const fila = (over: Partial<ContractOverviewRow> = {}): ContractOverviewRow =>
  ({
    _id: "r1",
    userId: "u1",
    userName: "MARTINEZ LISANDRO JAVIER",
    // CUIT real, pasa el dígito verificador.
    cuit: "23276025759",
    categoria_sat_id: 1,
    nombre_contrato: "Plazo fijo 6x6 2030 SRL",
    fecha_alta_contrato: "2026-08-01",
    fecha_baja_contrato: "2027-01-31",
    empresaContratoId: EMPRESA_ID,
    sucursalArcaId: SUCURSAL_ID,
    osId: null,
    /*
     * La fila base va VALIDADA contra ARCA, sin obra social propia — el caso más común.
     *
     * Hace falta explicitarlo desde que la obra social solo tiene valor una vez validada: sin esto,
     * el RNOS queda vacío, `buildAltaRecord` devuelve null y TODOS los tests del layout fallan por un
     * motivo que no es el que están probando. Los tests que necesitan el estado "sin validar" lo
     * piden al revés, con `obraSocialNoFigura: false`.
     */
    obraSocialNoFigura: true,
    obraSocialConstatadaEn: "arca",
    obraSocialConstatadaEl: "2026-08-18T00:00:00.000Z",
    ...over,
  }) as unknown as ContractOverviewRow;

/** Toma un tramo del registro por posiciones 1-based, como las nombra el diseño de ARCA. */
const tramo = (record: string, desde: number, hasta: number) => record.slice(desde - 1, hasta);

describe("fechaAfip", () => {
  it("convierte los dos formatos de entrada a AAAA/MM/DD", () => {
    assert.equal(fechaAfip("2026-08-01"), "2026/08/01");
    assert.equal(fechaAfip("01/08/2026"), "2026/08/01");
  });

  it("devuelve vacío cuando no reconoce el formato", () => {
    assert.equal(fechaAfip("agosto 2026"), "");
    assert.equal(fechaAfip(""), "");
  });
});

describe("buildAltaRecord — invariantes del registro", () => {
  it("un contrato completo produce exactamente 130 caracteres", () => {
    const record = buildAltaRecord(fila(), catalogos());
    assert.ok(record, "el contrato de prueba debería estar completo");
    assert.equal(record!.length, 130);
  });

  it("las constantes del formato van en su posición", () => {
    const record = buildAltaRecord(fila(), catalogos())!;
    assert.equal(tramo(record, 1, 2), "01", "tipo de registro");
    assert.equal(tramo(record, 3, 4), "AT", "código de movimiento (alta)");
    assert.equal(tramo(record, 16, 16), "N", "marca trabajador agropecuario");
    assert.equal(tramo(record, 89, 90), "00", "rectificación");
  });

  it("ubica CUIL, fechas, obra social y códigos del tipo de contrato", () => {
    const record = buildAltaRecord(fila(), catalogos())!;
    assert.equal(tramo(record, 5, 15), "23276025759");
    assert.equal(tramo(record, 17, 19), "021");
    assert.equal(tramo(record, 20, 29), "2026/08/01");
    assert.equal(tramo(record, 30, 39), "2027/01/31");
    assert.equal(tramo(record, 40, 45), "126205");
    assert.equal(tramo(record, 73, 73), "1");
    assert.equal(tramo(record, 74, 78), "00001");
    assert.equal(tramo(record, 79, 84), "921430");
    assert.equal(tramo(record, 101, 106), "035283");
    assert.equal(tramo(record, 107, 109), "001");
  });

  it("los campos que no aplican a un alta van en blanco, no en cero", () => {
    const record = buildAltaRecord(fila(), catalogos())!;
    // Rellenarlos con ceros afirmaría algo falso: 00 es un código de situación de baja válido y
    // 0000000000 se lee como un número de formulario. Ver el PENDIENTE de afipTxt.ts.
    assert.equal(tramo(record, 46, 47), "  ", "situación de baja");
    assert.equal(tramo(record, 48, 57), " ".repeat(10), "fecha telegrama renuncia");
    assert.equal(tramo(record, 85, 88), "    ", "puesto desempeñado");
    assert.equal(tramo(record, 91, 100), " ".repeat(10), "convenio colectivo");
    assert.equal(tramo(record, 110, 119), " ".repeat(10), "fecha suspensión");
    assert.equal(tramo(record, 120, 129), " ".repeat(10), "formulario agropecuario");
  });
});

describe("retribución (58-72)", () => {
  // Si algún día el golden record mostrara pesos enteros, ESTOS son los tests que hay que dar
  // vuelta — y el × 100 de describirRegistro. Hoy el criterio es centavos implícitos.
  it("va en centavos implícitos, con ceros a la izquierda", () => {
    const record = buildAltaRecord(fila({ categoria_sat_id: 12 }), catalogos())!;
    assert.equal(tramo(record, 58, 72), "000000078595527");
  });

  it("no pierde los centavos de una categoría de sueldo alto", () => {
    const record = buildAltaRecord(fila(), catalogos())!;
    assert.equal(tramo(record, 58, 72), "000000212213535");
  });

  it("una categoría sin escala cargada no genera registro", () => {
    // Es el caso que aparecería si la escala se dejara de resolver desde el grupo: mejor que no
    // salga el contrato a que salga con sueldo 0.
    assert.equal(buildAltaRecord(fila({ categoria_sat_id: 99 }), catalogos()), null);
  });
});

describe("fecha de fin según la modalidad", () => {
  it("plazo determinado (021) sin fecha de fin no genera registro", () => {
    assert.equal(buildAltaRecord(fila({ fecha_baja_contrato: "" }), catalogos()), null);
  });

  it("tiempo indeterminado (008) deja la fecha de fin en blanco", () => {
    const record = buildAltaRecord(fila({ nombre_contrato: "Tiempo Indeterminado - 2030 SRL", fecha_baja_contrato: "" }), catalogos())!;
    assert.equal(record.length, 130);
    assert.equal(tramo(record, 30, 39), " ".repeat(10));
    assert.equal(tramo(record, 17, 19), "008");
  });

  it("tiempo indeterminado CON fecha de fin no genera registro", () => {
    // La otra dirección del guard: es un dato mal cargado, no un campo opcional.
    assert.equal(buildAltaRecord(fila({ nombre_contrato: "Tiempo Indeterminado - 2030 SRL", fecha_baja_contrato: "2027-01-31" }), catalogos()), null);
  });

  it("una fecha con formato ilegible no genera registro", () => {
    assert.equal(buildAltaRecord(fila({ fecha_alta_contrato: "agosto 2026" }), catalogos()), null);
  });
});

describe("datos faltantes o mal cargados devuelven null (nunca un registro corto)", () => {
  const casos: Array<[string, Partial<ContractOverviewRow>]> = [
    ["sin empresa empleadora", { empresaContratoId: "" }],
    ["CUIT que no pasa el dígito verificador", { cuit: "23276025758" }],
    ["CUIT de relleno", { cuit: "00000000000" }],
    ["sin CUIT", { cuit: "" }],
    ["sin categoría", { categoria_sat_id: null as any }],
    ["tipo de contrato sin códigos ARCA", { nombre_contrato: "Tipo inexistente" }],
    ["sin sucursal elegida", { sucursalArcaId: null as any }],
  ];

  for (const [nombre, patch] of casos) {
    it(nombre, () => {
      assert.equal(buildAltaRecord(fila(patch), catalogos()), null);
    });
  }

  it("la sucursal de otra empresa no se acepta", () => {
    assert.equal(buildAltaRecord(fila({ sucursalArcaId: "6a7f00000000000000000zzz" }), catalogos()), null);
  });
});

describe("actividad del domicilio", () => {
  it("con una sola actividad, el contrato la hereda sin elegirla", () => {
    const record = buildAltaRecord(fila({ actividadArca: null as any }), catalogos())!;
    assert.equal(tramo(record, 79, 84), "921430");
  });

  it("con varias actividades y ninguna elegida no genera registro", () => {
    const cat = catalogos({
      sucursales: [{ _id: SUCURSAL_ID, codigo: "00001", domicilio: "ZAPIOLA 392", actividades: [{ codigo: "921430" }, { codigo: "900030" }] }] as any,
    });
    assert.equal(buildAltaRecord(fila({ actividadArca: null as any }), cat), null);
  });

  it("con varias actividades y una elegida, sale la elegida", () => {
    const cat = catalogos({
      sucursales: [{ _id: SUCURSAL_ID, codigo: "00001", domicilio: "ZAPIOLA 392", actividades: [{ codigo: "921430" }, { codigo: "900030" }] }] as any,
    });
    const record = buildAltaRecord(fila({ actividadArca: "900030" }), cat)!;
    assert.equal(tramo(record, 79, 84), "900030");
  });
});

/**
 * El RNOS (pos. 40-45) sale de una cascada, y el orden importa: en la Argentina la obra social la
 * define el SINDICATO, y al sindicato lo define el convenio. Si el nivel del convenio se cae o se
 * ordena mal, el alta entra con la obra social equivocada — ARCA la acepta y el aporte va a parar a
 * otro lado, que es exactamente el tipo de error que no se ve hasta que es tarde.
 */
describe("obra social — cascada persona → convenio → excluidos", () => {
  /** Catálogo con tres obras sociales y el convenio 0634/11 apuntando a la del sindicato de TV. */
  const conCascada = (over: Partial<AfipCatalogs> = {}) =>
    catalogos({
      obrasSociales: [
        { _id: "os1", externalId: "126205", name: "OSPIA", data: { id: 7 } },
        { _id: "os2", externalId: "010902", name: "OS PERSONAL DE TELEVISIÓN", data: { id: 22 } },
        { _id: "os3", externalId: "999999", name: "OS DE LA PERSONA", data: { id: 33 } },
      ],
      convenios: [{ _id: "cv1", externalId: "0634/11", name: "TELEVISIÓN", obraSocialDefaultId: 22 }],
      ...over,
    } as any);

  const rnosDe = (record: string) => tramo(record, 40, 45);

  it("sin obra social propia, manda la del convenio de la categoría", () => {
    const record = buildAltaRecord(fila(), conCascada())!;
    assert.equal(rnosDe(record), "010902");
  });

  it("la obra social de la persona le gana al convenio", () => {
    const record = buildAltaRecord(fila({ osId: 33 } as any), conCascada())!;
    assert.equal(rnosDe(record), "999999");
  });

  it("el convenio le gana a la default de la empresa", () => {
    // La empleadora tiene la 7 por defecto y el convenio la 22: tiene que salir la del convenio.
    const cat = conCascada({ empresas: [{ _id: EMPRESA_ID, obraSocialDefaultId: 7, sucursalIds: [SUCURSAL_ID], convenioIds: ["cv1"] }] } as any);
    assert.equal(rnosDe(buildAltaRecord(fila(), cat)!), "010902");
  });

  it("la excepción de la empresa para ese convenio le gana a la sindical del CCT", () => {
    const cat = conCascada({
      empresas: [{ _id: EMPRESA_ID, sucursalIds: [SUCURSAL_ID], convenioIds: ["cv1"], convenioObraSocialOverrides: [{ convenioId: "cv1", obraSocialId: 33 }] }],
    } as any);
    assert.equal(rnosDe(buildAltaRecord(fila(), cat)!), "999999");
  });

  it("la excepción de OTRO convenio no aplica a este contrato", () => {
    const cat = conCascada({
      empresas: [{ _id: EMPRESA_ID, sucursalIds: [SUCURSAL_ID], convenioIds: ["cv1"], convenioObraSocialOverrides: [{ convenioId: "cv-otro", obraSocialId: 33 }] }],
    } as any);
    assert.equal(rnosDe(buildAltaRecord(fila(), cat)!), "010902");
  });

  /**
   * El caso que motivó separar los niveles: un convenio SIN obra social cargada no puede caer al
   * default de la empresa —ese es de los EXCLUIDOS DE CONVENIO— ni a una global. Cualquiera de las
   * dos cosas haría que el alta salga con una obra social plausible pero equivocada, que es el error
   * más caro de todos porque ARCA lo acepta sin chistar.
   */
  it("un convenio sin obra social NO usa la de la empresa ni ninguna otra: el alta no se genera", () => {
    const cat = conCascada({
      convenios: [{ _id: "cv1", externalId: "0634/11", name: "TELEVISIÓN" }],
      empresas: [{ _id: EMPRESA_ID, obraSocialDefaultId: 33, sucursalIds: [SUCURSAL_ID], convenioIds: ["cv1"] }],
    } as any);
    assert.equal(buildAltaRecord(fila(), cat), null, "sin obra social resuelta no puede haber registro");

    const { checks } = resolveAfip(fila(), cat);
    const rnos = checks.find((c) => c.key === "rnos")!;
    assert.equal(rnos.estado, "falta");
    assert.ok((rnos.detalle || "").includes("0634/11"), "el detalle tiene que nombrar el convenio que hay que configurar");
  });

  it("los EXCLUIDOS de convenio (9999/99) sí usan la default de la empresa", () => {
    const cat = conCascada({
      categorias: [{ _id: "cx", externalId: "999999", name: "SIN CATEGORIAS", data: { id: 1, numeroCategoria: 15, nombre: "SIN CATEGORIAS", codigoAfip: 999999, convenio: "9999/99", sueldoBruto: SUELDO_BRUTO_CAT_1 } }],
      convenios: [{ _id: "cv9", externalId: "9999/99", name: "EXCLUIDO DE CONVENIO" }],
      empresas: [{ _id: EMPRESA_ID, obraSocialDefaultId: 33, sucursalIds: [SUCURSAL_ID], convenioIds: ["cv9"] }],
    } as any);
    assert.equal(rnosDe(buildAltaRecord(fila(), cat)!), "999999");
  });
});

describe("describirRegistro — la vista previa no puede mentir", () => {
  it("los campos cubren las 130 posiciones sin huecos ni solapamientos", () => {
    const { campos } = describirRegistro(fila(), catalogos());
    let esperado = 1;
    for (const c of campos) {
      assert.equal(c.desde, esperado, `hueco o solapamiento antes de "${c.nombre}"`);
      assert.ok(c.hasta >= c.desde, `"${c.nombre}" termina antes de empezar`);
      esperado = c.hasta + 1;
    }
    assert.equal(esperado - 1, 130, "los campos no suman 130 posiciones");
  });

  it("cada campo ocupa exactamente el ancho que declara", () => {
    const { campos } = describirRegistro(fila(), catalogos());
    for (const c of campos) {
      const ancho = c.hasta - c.desde + 1;
      if (c.contenido !== null) assert.equal(c.contenido.length, ancho, `"${c.nombre}" mide ${c.contenido.length} y declara ${ancho}`);
      assert.equal(c.placeholder.length, ancho, `el placeholder de "${c.nombre}" no mide ${ancho}`);
    }
  });

  it("es la misma fuente que el archivo: concatenar los campos da el registro", () => {
    const { campos } = describirRegistro(fila(), catalogos());
    assert.equal(campos.map((c) => c.contenido).join(""), buildAltaRecord(fila(), catalogos()));
  });

  it("un contrato incompleto marca el campo que falta en su posición", () => {
    const { campos } = describirRegistro(fila({ cuit: "" }), catalogos());
    const cuil = campos.find((c) => c.checkKey === "cuil")!;
    assert.equal(cuil.contenido, null);
    assert.equal(cuil.desde, 5);
    assert.equal(cuil.hasta, 15);
  });
});

describe("buildAltaTxt", () => {
  it("separa los registros con CRLF", () => {
    const cat = catalogos();
    const registros = [buildAltaRecord(fila(), cat)!, buildAltaRecord(fila({ categoria_sat_id: 12 }), cat)!];
    const lineas = buildAltaTxt(registros).split("\r\n");
    assert.equal(lineas.length, 2);
    lineas.forEach((l) => assert.equal(l.length, 130));
  });

  it("el lote completo, armado como lo arma la pantalla, omite los contratos incompletos", () => {
    // OJO: `buildAltaTxt` recibe registros YA construidos y no filtra nada. Descartar los `null` es
    // responsabilidad de quien llama (hoy `generarTxt` en ContractBulkTabs). Si un caller nuevo se
    // olvida, se cuela una línea vacía en el archivo — este test fija el pipeline correcto.
    const cat = catalogos();
    const filas = [fila(), fila({ cuit: "" }), fila({ categoria_sat_id: 12 })];
    const registros = filas.map((f) => buildAltaRecord(f, cat)).filter((r): r is string => r !== null);

    assert.equal(registros.length, 2, "el contrato sin CUIT no debería estar");
    const lineas = buildAltaTxt(registros).split("\r\n");
    assert.equal(lineas.length, 2);
    lineas.forEach((l) => assert.equal(l.length, 130));
  });
});

describe("LAYOUT_ALTA (la tabla de la pantalla «Cómo funciona»)", () => {
  // La pantalla explicativa lee LAYOUT_ALTA en vez de una tabla escrita a mano. Si el generador
  // cambia una posición y la doc no, la pantalla miente con total confianza: esto lo impide.
  it("describe exactamente el mismo registro que arma el generador", () => {
    const { campos } = describirRegistro(fila(), catalogos());

    assert.equal(LAYOUT_ALTA.length, campos.length, "sobra o falta un campo en la documentación");
    LAYOUT_ALTA.forEach((doc, i) => {
      assert.equal(doc.desde, campos[i].desde, `campo ${i + 1} (${doc.nombre}): posición inicial distinta`);
      assert.equal(doc.hasta, campos[i].hasta, `campo ${i + 1} (${doc.nombre}): posición final distinta`);
      assert.equal(doc.nombre, campos[i].nombre, `campo ${i + 1}: el nombre no coincide con el del generador`);
    });
  });

  it("cubre las 130 posiciones sin huecos ni superposiciones", () => {
    let esperado = 1;
    for (const c of LAYOUT_ALTA) {
      assert.equal(c.desde, esperado, `${c.nombre} debería empezar en ${esperado}`);
      assert.ok(c.hasta >= c.desde, `${c.nombre} termina antes de empezar`);
      esperado = c.hasta + 1;
    }
    assert.equal(esperado - 1, 130);
  });

  it("marca como constante o en blanco todo lo que no se pide al operador", () => {
    // Es la respuesta a "¿hay que cargar el agropecuario?" y "¿y la situación de revista?".
    const porNombre = (n: string) => LAYOUT_ALTA.find((c) => c.nombre.includes(n))!;
    assert.equal(porNombre("agropecuario").tipo, "constante");
    assert.equal(porNombre("COVID").tipo, "constante");
    assert.equal(porNombre("Puesto desempeñado").tipo, "en_blanco");
    assert.equal(porNombre("Convenio Colectivo").tipo, "en_blanco");
    assert.equal(porNombre("Fecha fin").tipo, "condicional");
  });
});

describe("obra social — vive en el CONTRATO, no en la persona", () => {
  const conCascada = () =>
    catalogos({
      obrasSociales: [
        { _id: "os1", externalId: "126205", name: "OSPIA", data: { id: 7 } },
        { _id: "os2", externalId: "901402", name: "OS CONSTATADA EN ARCA", data: { id: 44 } },
      ],
      convenios: [{ _id: "cv1", externalId: "0634/11", name: "TELEVISIÓN", obraSocialDefaultId: 7 }],
    } as any);

  it("la obra social del contrato le gana a la del convenio", () => {
    // Es la regla central: si ARCA dice que esa persona está en 901402, no importa qué diga el CCT.
    const record = buildAltaRecord(fila({ osId: 44, obraSocialOrigen: "constatada" } as any), conCascada())!;
    assert.equal(tramo(record, 40, 45), "901402");
  });

  it("sin obra social en el contrato, resuelve el convenio", () => {
    // Vacío NO es un faltante: es el caso normal de quien no tiene ninguna declarada en ARCA.
    const record = buildAltaRecord(fila(), conCascada())!;
    assert.equal(tramo(record, 40, 45), "126205");
  });

  it("la heredada de la ficha vieja ya NO alcanza: sin validar no hay obra social", () => {
    /*
     * Este test decía lo contrario hasta que cambió la regla. Antes, un `osId` heredado del campo
     * viejo de la persona servía para el alta y solo se avisaba que nadie lo había verificado; ahora
     * el valor tiene que salir de ARCA, así que un dato de origen desconocido no llena el campo.
     * Es el caso que motivó el cambio: ese código venía de una migración, podía estar vencido por
     * desregulación, y viajaba al organismo como si estuviera confirmado.
     */
    const cat = conCascada();
    const row = fila({ osId: 44, obraSocialOrigen: "heredada-usuario", obraSocialNoFigura: false } as any);

    assert.equal(resolveAfipValues(row, cat).rnos, "", "sin validar, el campo va vacío");
    assert.equal(buildAltaRecord(row, cat), null, "y sin RNOS no se arma el registro");

    const res = resolveAfip(row, cat);
    assert.equal(res.completo, false, "validar en ARCA es ahora un paso del alta, no una mejora");
    assert.equal(res.checks.find((c) => c.key === "rnos")?.estado, "falta");
  });

  it("el RNOS nunca sale en 000000: sin obra social no hay registro", () => {
    // ARCA rechaza un alta con ceros en 40-45, así que la línea no se arma.
    const cat = catalogos({ convenios: [{ _id: "cv1", externalId: "0634/11", name: "TELEVISIÓN" }] } as any);
    assert.equal(buildAltaRecord(fila(), cat), null);
  });
});

/**
 * Los tres estados de la obra social. Son TRES, no dos, y el del medio es el que se perdía.
 *
 * La regla: **antes de validar contra ARCA, el contrato no tiene obra social**. La cascada del
 * convenio se sigue calculando, pero como REFERENCIA (`rnosSugerido`) — "esto es lo que va a quedar
 * si el organismo no devuelve una propia"—, no como valor. Mostrarla como valor hacía creer que
 * estaba confirmada, y el número que terminaba en el archivo salía de una suposición nuestra.
 *
 * El estado que hay que blindar es `no_figura`: se consultó, ARCA no devolvió nada, y por eso la del
 * convenio queda CONFIRMADA. Es el caso más común —la mayoría no tiene obra social propia— y si
 * colapsa contra cualquiera de los otros dos, la UI miente sobre trabajo hecho o pendiente.
 */
describe("obra social — los tres estados de validación", () => {
  const cat = () =>
    catalogos({
      obrasSociales: [
        { _id: "os1", externalId: "120900", name: "O.S. PERSONAL DE TELEVISION", data: { id: 7 } },
        { _id: "os2", externalId: "901402", name: "O.S. DE DIRECCION", data: { id: 44 } },
      ],
      convenios: [{ _id: "cv1", externalId: "0634/11", name: "TELEVISIÓN", obraSocialDefaultId: 7 }],
    } as any);

  /** Sin validar. El fixture base viene validado, así que hay que pedirlo explícitamente. */
  const sinValidar = () => fila({ obraSocialNoFigura: false, obraSocialConstatadaEn: "", obraSocialConstatadaEl: "" } as any);

  it("sin validar: NO hay obra social, pero sí una referencia de lo que va a quedar", () => {
    const v = resolveAfipValues(sinValidar(), cat());
    assert.equal(v.constatacion, "sin_constatar");
    assert.equal(v.rnos, "", "el campo va vacío: mostrar la del convenio diría que está confirmada");
    assert.equal(v.rnosSugerido, "120900", "pero se sabe cuál va a quedar, para poder anticiparlo");
    assert.equal(v.nombreObraSocialSugerida, "O.S. PERSONAL DE TELEVISION");
  });

  it("sin validar, el TXT de esa persona NO se genera", () => {
    // La consecuencia asumida al cambiar la regla: validar pasó a ser un paso del alta.
    assert.equal(buildAltaRecord(sinValidar(), cat()), null);
    assert.equal(resolveAfip(sinValidar(), cat()).completo, false);
  });

  it("ARCA no devolvió ninguna: queda la del convenio, y queda VALIDADA", () => {
    const row = fila({ obraSocialNoFigura: true, obraSocialConstatadaEn: "arca", obraSocialConstatadaEl: "2026-08-18T00:00:00.000Z" } as any);
    const v = resolveAfipValues(row, cat());
    assert.equal(v.constatacion, "no_figura", "no es `sin_constatar`: el trabajo se hizo");
    assert.equal(v.rnos, "120900", "y ahora sí es el VALOR, no una referencia");
    assert.equal(tramo(buildAltaRecord(row, cat())!, 40, 45), "120900");
    assert.equal(resolveAfip(row, cat()).completo, true, "una validación completa no deja el contrato incompleto");
  });

  it("ARCA devolvió una: esa reemplaza a la del convenio", () => {
    const row = fila({ osId: 44, obraSocialOrigen: "constatada", obraSocialConstatadaEn: "arca", obraSocialNoFigura: false } as any);
    const v = resolveAfipValues(row, cat());
    assert.equal(v.constatacion, "afiliada");
    assert.equal(v.rnos, "901402", "gana la de ARCA, no la del convenio");
    assert.equal(tramo(buildAltaRecord(row, cat())!, 40, 45), "901402");
  });

  it("los tres estados son distinguibles entre sí", () => {
    const estados = [
      resolveAfipValues(sinValidar(), cat()).constatacion,
      resolveAfipValues(fila({ obraSocialNoFigura: true, obraSocialConstatadaEn: "arca" } as any), cat()).constatacion,
      resolveAfipValues(fila({ osId: 44, obraSocialOrigen: "constatada", obraSocialConstatadaEn: "arca", obraSocialNoFigura: false } as any), cat()).constatacion,
    ];
    assert.equal(new Set(estados).size, 3, "si dos colapsan, la UI miente sobre trabajo hecho o pendiente");
  });

  it("lo validado con la fuente vieja (SSS) sigue valiendo", () => {
    // Cuando la constatación se mudó de la SSS a ARCA, lo ya constatado no se reescribió: decía la
    // verdad cuando se guardó, y convertirlo en pendiente mandaría a rehacer trabajo hecho.
    const row = fila({ osId: 44, obraSocialOrigen: "constatada", obraSocialConstatadaEn: "sss", obraSocialNoFigura: false } as any);
    assert.equal(resolveAfipValues(row, cat()).constatacion, "afiliada");
    assert.equal(resolveAfip(row, cat()).completo, true);
  });
});

/**
 * Sin empleadora no puede haber obra social validada.
 *
 * Validar significa "ARCA, consultado con el CUIT de ESTA empleadora, dice esto". Sin empleadora la
 * afirmación no tiene sujeto: el contrato quedaba mostrando un código en verde, fijo y con fecha,
 * justo debajo del cartel "Falta elegir la empleadora" — y nadie lo iba a revisar precisamente porque
 * estaba en verde. El borrado lo hace el PATCH de empresa-contrato; acá se fija la invariante que ese
 * borrado tiene que dejar cierta.
 */
describe("obra social — la validación depende de la empleadora", () => {
  const cat = () =>
    catalogos({
      obrasSociales: [{ _id: "os1", externalId: "120900", name: "O.S. PERSONAL DE TELEVISION", data: { id: 7 } }],
      convenios: [{ _id: "cv1", externalId: "0634/11", name: "TELEVISIÓN", obraSocialDefaultId: 7 }],
    } as any);

  it("un contrato sin empleadora no puede quedar validado", () => {
    // Lo que el server deja tras quitar la empleadora: todo el bloque de obra social en cero.
    const row = fila({
      empresaContratoId: null,
      osId: null,
      obraSocialOrigen: undefined,
      obraSocialConstatadaEn: undefined,
      obraSocialConstatadaEl: null,
      obraSocialNoFigura: false,
      obraSocialBloqueada: false,
    } as any);

    const v = resolveAfipValues(row, cat());
    assert.equal(v.constatacion, "sin_constatar", "sin empleadora la validación no puede sobrevivir");
    assert.equal(v.rnos, "", "y por lo tanto tampoco el valor");
    assert.equal(buildAltaRecord(row, cat()), null, "ese contrato no entra al archivo");
  });

  it("la referencia del convenio SÍ sobrevive: es lo que va a quedar cuando se valide", () => {
    const row = fila({ empresaContratoId: null, obraSocialNoFigura: false, obraSocialConstatadaEn: "", obraSocialConstatadaEl: "" } as any);
    assert.equal(resolveAfipValues(row, cat()).rnosSugerido, "120900");
  });
});
