/**
 * Tests del registro de 85 posiciones de «Altas Masivas» (el que se pega en ARCA, máximo 9).
 *
 * Run with:
 *   npx tsx --test src/components/contratos/afipTxt85.test.ts
 *   – o –
 *   npm run test:afip85
 *
 * Mismo motivo que los del de 130: un campo corrido una posición produce un alta que ARCA acepta y
 * que declara mal. Acá además se fija lo que DIFERENCIA a los dos formatos (orden, fechas ddmmyyyy,
 * remuneración partida, puesto/convenio/revista informados), que es lo fácil de confundir.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildAltaRecord85, buildAltasMasivasTexto, describirRegistro85 } from "./afipTxt85";
import { buildAltaRecord, describirRegistro } from "./afipTxt";
import { resolveAfip, resolveAfip85, problemasDeSucursalParaTxt, mensajeDeSucursalParaTxt } from "./afipCompleteness";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AfipCatalogs } from "./afipCompleteness";
import type { ContractOverviewRow } from "../../api/users";
import { LAYOUT_85, POSICIONES_130, partirRegistro85, partirRegistro130, remuneracion85, fecha85 } from "@compartido/layoutAltaArca";

const EMPRESA_ID = "6a7f000000000000000000e1";
const SUCURSAL_ID = "6a7f000000000000000000s1";
const SUELDO_BRUTO_CAT_12 = 785955.27;

const catalogos = (over: Partial<AfipCatalogs> = {}): AfipCatalogs =>
  ({
    categorias: [
      { _id: "c1", externalId: "035283", name: "Director de Programas", data: { id: 1, numeroCategoria: 1, nombre: "Director de Programas", codigoAfip: 35283, convenio: "0634/11", sueldoBruto: 2122135.35, puestoDesempenado: "2455" } },
      { _id: "c12", externalId: "035294", name: "Cadete", data: { id: 12, numeroCategoria: 12, nombre: "Cadete", codigoAfip: 35294, convenio: "0634/11", sueldoBruto: SUELDO_BRUTO_CAT_12 } },
    ],
    tipos: [
      { _id: "t1", name: "Plazo fijo 6x6 2030 SRL", data: { afipModalidadContrato: "021", afipTipoServicio: "001", afipModalidadLiquidacion: "1" } },
      { _id: "t2", name: "Tiempo Indeterminado - 2030 SRL", data: { afipModalidadContrato: "008", afipTipoServicio: "001", afipModalidadLiquidacion: "1" } },
    ],
    obrasSociales: [{ _id: "os1", externalId: "126205", name: "OSPIA", data: { id: 7 } }],
    sedes: [],
    empresas: [{ _id: EMPRESA_ID, sucursalActividades: [{ sucursalId: SUCURSAL_ID, actividades: [{ codigo: "921430" }] }], sucursalIds: [SUCURSAL_ID], convenioIds: ["cv1"] }],
    sucursales: [{ _id: SUCURSAL_ID, codigo: "00001", domicilio: "ZAPIOLA 392", actividades: [] }],
    convenios: [{ _id: "cv1", externalId: "0634/11", name: "TELEVISIÓN", obraSocialDefaultId: 7 }],
    ...over,
  }) as unknown as AfipCatalogs;

const fila = (over: Partial<ContractOverviewRow> = {}): ContractOverviewRow =>
  ({
    _id: "r1",
    userId: "u1",
    userName: "MARTINEZ LISANDRO JAVIER",
    cuit: "23276025759",
    categoria_sat_id: 1,
    nombre_contrato: "Plazo fijo 6x6 2030 SRL",
    fecha_alta_contrato: "2026-08-01",
    fecha_baja_contrato: "2027-01-31",
    empresaContratoId: EMPRESA_ID,
    sucursalArcaId: SUCURSAL_ID,
    osId: null,
    obraSocialNoFigura: true,
    obraSocialConstatadaEn: "arca",
    obraSocialConstatadaEl: "2026-08-18T00:00:00.000Z",
    ...over,
  }) as unknown as ContractOverviewRow;

const tramo = (r: string, desde: number, hasta: number) => r.slice(desde - 1, hasta);

describe("LAYOUT_85 — el diseño publicado por ARCA", () => {
  it("cubre las 85 posiciones sin huecos ni solapamientos", () => {
    let siguiente = 1;
    for (const c of LAYOUT_85) {
      assert.equal(c.desde, siguiente, `${c.nombre} empieza donde termina el anterior`);
      assert.ok(c.hasta >= c.desde);
      siguiente = c.hasta + 1;
    }
    assert.equal(siguiente - 1, 85);
  });

  it("las posiciones del de 130 que coteja el servidor son las del generador", () => {
    const { campos } = describirRegistro(fila(), catalogos());
    const porCheck = new Map(campos.filter((c) => c.checkKey).map((c) => [c.checkKey!, c]));
    for (const [clave, p] of Object.entries(POSICIONES_130)) {
      const c = porCheck.get(clave);
      if (!c) continue; // constantes (tipo de registro, movimiento, agropecuario): no tienen check
      assert.deepEqual({ desde: c.desde, hasta: c.hasta }, p, `posición de ${clave}`);
    }
    const record = buildAltaRecord(fila(), catalogos())!;
    const partes = partirRegistro130(record);
    assert.equal(partes.tipoRegistro, "01");
    assert.equal(partes.movimiento, "AT");
    assert.equal(partes.cuil, "23276025759");
  });
});

describe("buildAltaRecord85 — posición por posición", () => {
  it("un contrato completo produce exactamente 85 caracteres", () => {
    const r = buildAltaRecord85(fila(), catalogos());
    assert.ok(r, "el contrato de prueba debería estar completo");
    assert.equal(r!.length, 85);
  });

  it("ubica cada campo donde lo pide ARCA", () => {
    const r = buildAltaRecord85(fila(), catalogos())!;
    assert.equal(tramo(r, 1, 11), "23276025759", "CUIL");
    assert.equal(tramo(r, 12, 17), "126205", "obra social");
    assert.equal(tramo(r, 18, 22), "00001", "sucursal");
    assert.equal(tramo(r, 23, 28), "921430", "actividad");
    assert.equal(tramo(r, 29, 32), "2455", "puesto (de la categoría)");
    assert.equal(tramo(r, 33, 35), "021", "modalidad de contratación");
    assert.equal(tramo(r, 36, 36), "1", "modalidad de liquidación");
    assert.equal(tramo(r, 37, 44), "02122135", "remuneración entera");
    assert.equal(tramo(r, 45, 46), "35", "remuneración decimal");
    assert.equal(tramo(r, 47, 47), "0", "no agropecuario");
    assert.equal(tramo(r, 48, 55), "01082026", "inicio ddmmyyyy");
    assert.equal(tramo(r, 56, 63), "31012027", "fin ddmmyyyy");
    assert.equal(tramo(r, 64, 73), "0634/11   ", "convenio con espacios a la derecha");
    assert.equal(tramo(r, 74, 79), "035283", "categoría");
    assert.equal(tramo(r, 80, 82), "001", "tipo de servicio");
    assert.equal(tramo(r, 83, 83), "0", "CCG no asociado");
    assert.equal(tramo(r, 84, 85), "01", "situación de revista: Activo");
  });

  it("partirRegistro85 devuelve lo mismo que escribió el generador", () => {
    const r = buildAltaRecord85(fila(), catalogos())!;
    const p = partirRegistro85(r);
    assert.equal(p.cuil, "23276025759");
    assert.equal(p.convenio, "0634/11   ");
    assert.equal(p.situacionRevista, "01");
    assert.equal(Object.values(p).join(""), r);
  });

  it("la remuneración se parte en pesos y centavos, sin depender de RETRIBUCION_EN_CENTAVOS", () => {
    const r = buildAltaRecord85(fila({ categoria_sat_id: 12 } as any), catalogos({ empresas: [{ _id: EMPRESA_ID, sucursalActividades: [{ sucursalId: SUCURSAL_ID, actividades: [{ codigo: "921430" }] }], sucursalIds: [SUCURSAL_ID], convenioIds: ["cv1"], defaultsArca: { puestoDesempenado: "5142" } }] } as any))!;
    assert.equal(tramo(r, 37, 44), "00785955");
    assert.equal(tramo(r, 45, 46), "27");
  });

  it("tiempo indeterminado: la fecha de fin va en 8 espacios", () => {
    const r = buildAltaRecord85(fila({ nombre_contrato: "Tiempo Indeterminado - 2030 SRL", fecha_baja_contrato: "" } as any), catalogos())!;
    assert.equal(tramo(r, 56, 63), " ".repeat(8));
  });

  it("sin empleadora no hay registro", () => {
    assert.equal(buildAltaRecord85(fila({ empresaContratoId: "" } as any), catalogos()), null);
  });
});

describe("puesto y situación de revista — la cascada", () => {
  const conDefaults = (defaultsArca: Record<string, string>) =>
    catalogos({ empresas: [{ _id: EMPRESA_ID, sucursalActividades: [{ sucursalId: SUCURSAL_ID, actividades: [{ codigo: "921430" }] }], sucursalIds: [SUCURSAL_ID], convenioIds: ["cv1"], defaultsArca }] } as any);

  it("la categoría gana sobre el default de la empleadora", () => {
    const { valores } = describirRegistro85(fila(), conDefaults({ puestoDesempenado: "9999" }));
    assert.equal(valores.puesto, "2455");
    assert.equal(valores.puestoOrigen, "categoria");
  });

  it("sin puesto en la categoría cae al de la empleadora y después al global", () => {
    let v = describirRegistro85(fila({ categoria_sat_id: 12 } as any), conDefaults({ puestoDesempenado: "5142" })).valores;
    assert.equal(v.puesto, "5142");
    assert.equal(v.puestoOrigen, "empresa");
    v = describirRegistro85(fila({ categoria_sat_id: 12 } as any), catalogos({ defaultsArcaGlobales: { puestoDesempenado: "2421" } } as any)).valores;
    assert.equal(v.puesto, "2421");
    assert.equal(v.puestoOrigen, "global");
  });

  it("sin puesto en ningún escalón el registro no se arma y el 85 queda incompleto, pero el 130 no", () => {
    const row = fila({ categoria_sat_id: 12 } as any);
    assert.equal(buildAltaRecord85(row, catalogos()), null);
    const base = resolveAfip(row, catalogos());
    assert.equal(base.completo, true, "el de 130 no informa el puesto");
    const r85 = resolveAfip85(row, catalogos(), base);
    assert.equal(r85.completo, false);
    assert.equal(r85.checks.find((c) => c.key === "puesto")?.estado, "falta");
  });

  it("la situación de revista es 01 si nadie dice otra cosa, y la empleadora la puede cambiar", () => {
    assert.equal(describirRegistro85(fila(), catalogos()).valores.situacionRevista, "01");
    assert.equal(describirRegistro85(fila(), conDefaults({ situacionRevista: "12" })).valores.situacionRevista, "12");
  });
});

describe("helpers del formato", () => {
  it("fecha85 acepta los formatos guardados", () => {
    assert.equal(fecha85("2026-08-01"), "01082026");
    assert.equal(fecha85("01/08/2026"), "01082026");
    assert.equal(fecha85("agosto"), "");
  });

  it("remuneracion85 redondea a centavos una sola vez y respeta el tope de 8 enteros", () => {
    assert.deepEqual(remuneracion85(785955.275), { entera: "00785955", decimal: "28" });
    assert.deepEqual(remuneracion85(0.5), { entera: "00000000", decimal: "50" });
    assert.equal(remuneracion85(0), null);
    assert.equal(remuneracion85(100_000_000), null);
  });

  it("el texto pegado separa con LF y no deja línea vacía al final", () => {
    assert.equal(buildAltasMasivasTexto(["a", "b"]), "a\nb");
    assert.equal(buildAltasMasivasTexto([]), "");
  });
});

describe("la categoría contra el espejo de ARCA (barrera del alta)", () => {
  const conEstado = (estadoArca: string | null, confirmada = false) =>
    catalogos({
      categorias: [{ _id: "c1", externalId: "035283", name: "Director de Programas", data: { id: 1, numeroCategoria: 1, nombre: "Director de Programas", codigoAfip: 35283, convenio: "0634/11", sueldoBruto: 2122135.35, puestoDesempenado: "2455", estadoArca, estadoArcaConfirmada: confirmada, descripcionArca: "PRODUCTOR DE PROGRAMAS - GRUPO 1" } }],
    } as any);
  it("un código cruzado deja el contrato incompleto, con el texto de ARCA", () => {
    const r = resolveAfip(fila(), conEstado("nombre_distinto"));
    assert.equal(r.completo, false);
    const c = r.checks.find((x) => x.key === "categoriaArca");
    assert.equal(c?.estado, "error");
    assert.match(c?.detalle || "", /PRODUCTOR DE PROGRAMAS/);
  });
  it("ok, confirmado, o espejo sin sembrar: no bloquea", () => {
    assert.equal(resolveAfip(fila(), conEstado("ok")).completo, true);
    assert.equal(resolveAfip(fila(), conEstado("nombre_distinto", true)).completo, true);
    assert.equal(resolveAfip(fila(), conEstado(null)).completo, true);
  });
});

describe("puesto desde el CONVENIO de la categoría", () => {
  /** El 0634/11 con su puesto por defecto; la empleadora, opcionalmente, con el suyo. */
  const conConvenio = (puestoConvenio: string, defaultsArca: Record<string, string> = {}, over: Record<string, unknown> = {}) =>
    catalogos({
      convenios: [{ _id: "cv1", externalId: "0634/11", name: "TELEVISIÓN", obraSocialDefaultId: 7, puestoDesempenadoDefault: puestoConvenio }],
      empresas: [{ _id: EMPRESA_ID, sucursalActividades: [{ sucursalId: SUCURSAL_ID, actividades: [{ codigo: "921430" }] }], sucursalIds: [SUCURSAL_ID], convenioIds: ["cv1"], defaultsArca }],
      ...over,
    } as any);
  // La categoría 12 (Cadete, 0634/11) no tiene puesto; el contrato no tiene Rol Empresa con puesto.
  const sinRolNiCategoria = fila({ categoria_sat_id: 12, rol_frame_id: 87 } as any);
  const rolSinPuesto = { roleFrames: [{ data: { rol: { id: 87, nombre: "Coordinador General" }, puestoDesempenado: "" } }] };

  it("0634/11 sin puesto en rol ni categoría: 4132 en las posiciones 29-32", () => {
    const cat = conConvenio("4132", {}, rolSinPuesto);
    const r = buildAltaRecord85(sinRolNiCategoria, cat)!;
    assert.ok(r, "con el default del convenio el registro se arma");
    assert.equal(r.length, 85);
    assert.equal(tramo(r, 29, 32), "4132");
    assert.equal(partirRegistro85(r).puesto, "4132");
    const v = describirRegistro85(sinRolNiCategoria, cat).valores;
    assert.equal(v.puesto, "4132");
    assert.equal(v.puestoOrigen, "convenio");
  });

  it("deja de estar incompleto para el 85, y el detalle dice que salió del convenio", () => {
    const cat = conConvenio("4132", {}, rolSinPuesto);
    const r85 = resolveAfip85(sinRolNiCategoria, cat);
    assert.equal(r85.completo, true);
    const check = r85.checks.find((c) => c.key === "puesto")!;
    assert.equal(check.estado, "ok");
    assert.equal(check.value, "4132");
    assert.match(String(check.detalle), /convenio/i);
  });

  it("el convenio gana sobre el default de la empleadora y el de la instalación", () => {
    const cat = conConvenio("4132", { puestoDesempenado: "5142" }, { ...rolSinPuesto, defaultsArcaGlobales: { puestoDesempenado: "2421" } });
    assert.equal(tramo(buildAltaRecord85(sinRolNiCategoria, cat)!, 29, 32), "4132");
  });

  it("un convenio SIN default deja pasar a la empleadora, como antes", () => {
    const v = describirRegistro85(sinRolNiCategoria, conConvenio("", { puestoDesempenado: "5142" }, rolSinPuesto)).valores;
    assert.equal(v.puesto, "5142");
    assert.equal(v.puestoOrigen, "empresa");
  });

  it("NO cambia lo que ya resolvían la categoría y el rol: el registro es idéntico con o sin default en el convenio", () => {
    // Categoría 1: tiene 2455.
    assert.equal(buildAltaRecord85(fila(), conConvenio("4132")), buildAltaRecord85(fila(), catalogos()));
    assert.equal(tramo(buildAltaRecord85(fila(), conConvenio("4132"))!, 29, 32), "2455");
    // Rol con puesto, categoría sin puesto.
    const conRolCargado = { roleFrames: [{ data: { rol: { id: 87 }, puestoDesempenado: "5142" } }] };
    assert.equal(buildAltaRecord85(sinRolNiCategoria, conConvenio("4132", {}, conRolCargado)), buildAltaRecord85(sinRolNiCategoria, catalogos(conRolCargado as any)));
    assert.equal(tramo(buildAltaRecord85(sinRolNiCategoria, conConvenio("4132", {}, conRolCargado))!, 29, 32), "5142");
  });

  it("sin nada en ningún escalón sigue faltando, y el mensaje nombra al convenio como lugar donde cargarlo", () => {
    const cat = conConvenio("", {}, rolSinPuesto);
    assert.equal(buildAltaRecord85(sinRolNiCategoria, cat), null);
    const check = resolveAfip85(sinRolNiCategoria, cat).checks.find((c) => c.key === "puesto")!;
    assert.equal(check.estado, "falta");
    assert.match(String(check.detalle), /convenio/i);
    // Y la Carga Masiva (130) no se entera: sigue completa.
    assert.equal(resolveAfip(sinRolNiCategoria, cat).completo, true);
  });
});

describe("puesto desde el Rol Empresa del contrato", () => {
  const conRol = (puesto: string) => catalogos({ roleFrames: [{ data: { rol: { id: 77 }, puestoDesempenado: puesto } }] } as any);
  it("el Rol Empresa manda sobre la categoría: posiciones 29-32", () => {
    // La categoría 1 del fixture tiene 2455; el rol trae 5142.
    const r = buildAltaRecord85(fila({ rol_frame_id: 77 } as any), conRol("5142"))!;
    assert.equal(r.slice(28, 32), "5142");
    assert.equal(describirRegistro85(fila({ rol_frame_id: 77 } as any), conRol("5142")).valores.puestoOrigen, "funcion");
  });
  it("sin puesto en el rol, sigue la categoría", () => {
    assert.equal(buildAltaRecord85(fila({ rol_frame_id: 77 } as any), conRol(""))!.slice(28, 32), "2455");
  });
  it("una categoría sin puesto se completa con el del rol (sin el error)", () => {
    const row = fila({ categoria_sat_id: 12, rol_frame_id: 77 } as any);
    const cat = conRol("2455");
    assert.equal(resolveAfip85(row, cat).completo, true);
    assert.equal(buildAltaRecord85(row, cat)!.slice(28, 32), "2455");
  });
});

describe("sucursal y actividad POR EMPRESA (el código de sucursal es de cada CUIT)", () => {
  /*
    El caso real: Ruiz Huidobro 4365 es UN domicilio en el catálogo (con el código 00003, el de FZERO),
    pero 2030 S.R.L. lo tiene declarado en ARCA como su sucursal 00001, con dos actividades. Un alta de
    2030 salía con 00003 y ARCA la cambiaba sola a 00001, dejando la actividad vacía.
  */
  const RUIZ = "6a7f000000000000000000s3";
  const de2030 = (over: Record<string, unknown> = {}) =>
    catalogos({
      sucursales: [{ _id: RUIZ, codigo: "00003", domicilio: "RUIZ HUIDOBRO 4365", actividades: [] }],
      empresas: [
        {
          _id: EMPRESA_ID,
          sucursalIds: [RUIZ],
          convenioIds: ["cv1"],
          sucursalActividades: [{ sucursalId: RUIZ, codigo: "00001", origen: "arca", actividades: [{ codigo: "602900", descripcion: "SERVICIOS DE TELEVISIÓN N.C.P." }, { codigo: "591110", descripcion: "PRODUCCIÓN DE FILMES Y VIDEOCINTAS" }] }],
          ...over,
        },
      ],
    } as any);
  const contrato = (actividadArca: string) => fila({ sucursalArcaId: RUIZ, actividadArca } as any);

  it("2030 S.R.L. en Ruiz Huidobro: 00001 en las posiciones 18-22 y 591110 en las 23-28", () => {
    const r = buildAltaRecord85(contrato("591110"), de2030())!;
    assert.ok(r, "el registro se arma");
    assert.equal(r.length, 85);
    assert.equal(tramo(r, 18, 22), "00001");
    assert.equal(tramo(r, 23, 28), "591110");
  });

  it("…o 602900, la otra actividad que 2030 tiene habilitada ahí", () => {
    const r = buildAltaRecord85(contrato("602900"), de2030())!;
    assert.equal(tramo(r, 18, 22), "00001");
    assert.equal(tramo(r, 23, 28), "602900");
  });

  it("el registro de 130 lleva el mismo código de sucursal de la empresa", () => {
    const partes = partirRegistro130(buildAltaRecord(contrato("591110"), de2030())!);
    assert.equal(partes.sucursal, "00001");
    assert.equal(partes.actividad, "591110");
  });

  it("con dos actividades habilitadas y ninguna elegida no hay registro: se elige, no se adivina", () => {
    assert.equal(buildAltaRecord85(contrato(""), de2030()), null);
    assert.equal(describirRegistro85(contrato(""), de2030()).valores.actividadOrigen, "ambigua");
  });

  it("una actividad que esa empresa no tiene habilitada en esa sucursal no entra", () => {
    // 620100 es la de GRINI en el mismo domicilio: para 2030 no vale.
    assert.equal(buildAltaRecord85(contrato("620100"), de2030()), null);
  });

  it("el domicilio habitual de la empleadora también resuelve con SU código", () => {
    const cat = de2030({ defaultsArca: { sucursalId: RUIZ } });
    const r = buildAltaRecord85(fila({ sucursalArcaId: null, actividadArca: "591110" } as any), cat)!;
    assert.equal(tramo(r, 18, 22), "00001");
  });

  it("sin código propio cargado rige el del catálogo: lo que ya salía bien sale IGUAL", () => {
    const sinCodigo = de2030({ sucursalActividades: [{ sucursalId: RUIZ, actividades: [{ codigo: "591110" }] }] });
    const r = buildAltaRecord85(fila({ sucursalArcaId: RUIZ } as any), sinCodigo)!;
    assert.equal(tramo(r, 18, 22), "00003");
    assert.equal(tramo(r, 23, 28), "591110");
    // Y el fixture de siempre (sin `codigo` en la asociación) da exactamente el mismo registro que antes.
    assert.equal(tramo(buildAltaRecord85(fila(), catalogos())!, 18, 22), "00001");
  });
});

describe("validación previa a generar los TXT: sucursal y actividad contra la empresa", () => {
  const RUIZ = "6a7f000000000000000000s3";
  const ZAPIOLA = "6a7f000000000000000000s9";
  const cat = (sucursalActividades: unknown[]) =>
    catalogos({
      sucursales: [
        { _id: RUIZ, codigo: "00003", domicilio: "RUIZ HUIDOBRO 4365", actividades: [] },
        { _id: ZAPIOLA, codigo: "00001", domicilio: "ZAPIOLA 392", actividades: [] },
      ],
      empresas: [{ _id: EMPRESA_ID, razonSocial: "2030 S.R.L.", sucursalIds: [RUIZ], convenioIds: ["cv1"], sucursalActividades }],
    } as any);
  const dosActividades = [{ sucursalId: RUIZ, codigo: "00001", actividades: [{ codigo: "602900" }, { codigo: "591110" }] }];

  it("frena si la sucursal del contrato no es de su empresa", () => {
    // Zapiola es de FZERO: 2030 no la tiene.
    const p = problemasDeSucursalParaTxt([fila({ sucursalArcaId: ZAPIOLA, actividadArca: "921430" } as any)], cat(dosActividades));
    assert.equal(p.length, 1);
    assert.equal(p[0].problema, "sucursal_ajena");
  });

  it("frena si la actividad escrita no está habilitada en esa sucursal para esa empresa", () => {
    // 620100 es la de GRINI en ese mismo domicilio.
    const p = problemasDeSucursalParaTxt([fila({ sucursalArcaId: RUIZ, actividadArca: "620100" } as any)], cat(dosActividades));
    assert.deepEqual(p.map((x) => x.problema), ["actividad_no_habilitada"]);
  });

  it("frena si la empresa no tiene ninguna actividad habilitada ahí", () => {
    const p = problemasDeSucursalParaTxt([fila({ sucursalArcaId: RUIZ } as any)], cat([{ sucursalId: RUIZ, codigo: "00001", actividades: [] }]));
    assert.deepEqual(p.map((x) => x.problema), ["sin_actividades"]);
  });

  it("no frena lo que está bien, ni lo que simplemente falta elegir (eso lo dice el checklist)", () => {
    const c = cat(dosActividades);
    assert.deepEqual(problemasDeSucursalParaTxt([fila({ sucursalArcaId: RUIZ, actividadArca: "591110" } as any)], c), []);
    assert.deepEqual(problemasDeSucursalParaTxt([fila({ sucursalArcaId: RUIZ, actividadArca: "602900" } as any)], c), []);
    // Varias habilitadas y ninguna elegida: incompleto, no «mal cargado».
    assert.deepEqual(problemasDeSucursalParaTxt([fila({ sucursalArcaId: RUIZ, actividadArca: "" } as any)], c), []);
    // Una sola habilitada: rige esa aunque el contrato tenga escrita otra.
    const unaSola = cat([{ sucursalId: RUIZ, codigo: "00001", actividades: [{ codigo: "591110" }] }]);
    assert.deepEqual(problemasDeSucursalParaTxt([fila({ sucursalArcaId: RUIZ, actividadArca: "999999" } as any)], unaSola), []);
    assert.equal(tramo(buildAltaRecord85(fila({ sucursalArcaId: RUIZ, actividadArca: "999999" } as any), unaSola)!, 23, 28), "591110");
  });

  it("el cartel dice quién, por qué y dónde se corrige", () => {
    const p = problemasDeSucursalParaTxt([fila({ sucursalArcaId: RUIZ, actividadArca: "620100" } as any)], cat(dosActividades));
    const m = mensajeDeSucursalParaTxt(p, "2030 S.R.L.");
    assert.match(m, /MARTINEZ LISANDRO JAVIER/);
    assert.match(m, /2030 S\.R\.L\./);
    assert.match(m, /no está habilitada/);
    assert.match(m, /ARCA → Domicilios/);
  });

  it("los dos botones pasan por el freno: el de 130 (generarTxt) y el URGENTE", () => {
    const fuente = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ContractBulkTabs.tsx"), "utf8");
    assert.match(fuente, /const generarTxt = [^\n]+\n\s+if \(frenaPorSucursal\(items\)\) return false;/);
    assert.match(fuente, /const presentarAltasMasivas = async \(\) => \{\s+if \(!empresaDeLaPestana\) return;[\s\S]{0,200}if \(frenaPorSucursal\(fuenteTxt\)\) return;/);
  });
});

describe("actividad habitual de la empresa en la sucursal (la ★ de la actividad)", () => {
  const RUIZ = "6a7f000000000000000000s3";
  const de2030 = (actividadHabitual?: string) =>
    catalogos({
      sucursales: [{ _id: RUIZ, codigo: "00003", domicilio: "RUIZ HUIDOBRO 4365", actividades: [] }],
      empresas: [{ _id: EMPRESA_ID, razonSocial: "2030 S.R.L.", sucursalIds: [RUIZ], convenioIds: ["cv1"], defaultsArca: { sucursalId: RUIZ }, sucursalActividades: [{ sucursalId: RUIZ, codigo: "00001", actividades: [{ codigo: "602900" }, { codigo: "591110" }], ...(actividadHabitual ? { actividadHabitual } : {}) }] }],
    } as any);
  // Un contrato sin presentar, como los 148 de 2030: no eligió sucursal ni actividad.
  const sinElegir = fila({ sucursalArcaId: null, actividadArca: "" } as any);

  it("el contrato que no eligió hereda la habitual: sale el registro, sin tocar el contrato", () => {
    const r = buildAltaRecord85(sinElegir, de2030("591110"))!;
    assert.ok(r, "con la habitual marcada el registro se arma");
    assert.equal(tramo(r, 18, 22), "00001");
    assert.equal(tramo(r, 23, 28), "591110");
    const v = describirRegistro85(sinElegir, de2030("591110")).valores;
    assert.equal(v.actividadOrigen, "habitual");
    assert.equal(resolveAfip(sinElegir, de2030("591110")).completo, true);
  });

  it("vale para la otra también: la habitual es la que se marque", () => {
    assert.equal(tramo(buildAltaRecord85(sinElegir, de2030("602900"))!, 23, 28), "602900");
  });

  it("se puede cambiar por fila: la elegida en el contrato manda sobre la habitual", () => {
    const r = buildAltaRecord85(fila({ sucursalArcaId: RUIZ, actividadArca: "602900" } as any), de2030("591110"))!;
    assert.equal(tramo(r, 23, 28), "602900");
    assert.equal(describirRegistro85(fila({ sucursalArcaId: RUIZ, actividadArca: "602900" } as any), de2030("591110")).valores.actividadOrigen, "elegida");
  });

  it("sin habitual marcada y con dos actividades, se elige en cada contrato (FZERO en Tronador)", () => {
    assert.equal(buildAltaRecord85(sinElegir, de2030()), null);
    assert.equal(describirRegistro85(sinElegir, de2030()).valores.actividadOrigen, "ambigua");
  });

  it("una actividad ESCRITA que la empresa no tiene ahí no se tapa con la habitual: se frena", () => {
    const mal = fila({ sucursalArcaId: RUIZ, actividadArca: "620100" } as any);
    assert.equal(buildAltaRecord85(mal, de2030("591110")), null);
    assert.deepEqual(problemasDeSucursalParaTxt([mal], de2030("591110")).map((p) => p.problema), ["actividad_no_habilitada"]);
    // Y el que hereda la habitual no frena nada.
    assert.deepEqual(problemasDeSucursalParaTxt([sinElegir], de2030("591110")), []);
  });

  it("una marca que apunta a una actividad que la empresa ya no tiene no se usa", () => {
    assert.equal(buildAltaRecord85(sinElegir, de2030("620100")), null);
  });

  it("el checklist dice que es la habitual y que se puede cambiar", () => {
    const check = resolveAfip(sinElegir, de2030("591110")).checks.find((c) => c.key === "actividad")!;
    assert.equal(check.estado, "ok");
    assert.equal(check.value, "591110");
    assert.match(String(check.detalle), /habitual/i);
  });
});
