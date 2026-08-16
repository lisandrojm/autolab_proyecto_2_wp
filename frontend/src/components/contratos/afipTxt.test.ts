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

import { buildAltaRecord, buildAltaTxt, describirRegistro, fechaAfip } from "./afipTxt";
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
    obrasSociales: [{ _id: "os1", externalId: "126205", name: "OSPIA", data: { id: 7, porDefecto: true } }],
    sedes: [],
    empresas: [{ _id: EMPRESA_ID, obraSocialId: 7, sucursalIds: [SUCURSAL_ID], convenioIds: ["cv1"] }],
    sucursales: [{ _id: SUCURSAL_ID, codigo: "00001", domicilio: "ZAPIOLA 392", actividades: [{ codigo: "921430", descripcion: "SERVICIOS CONEXOS" }] }],
    convenios: [{ _id: "cv1", externalId: "0634/11", name: "TELEVISIÓN" }],
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
