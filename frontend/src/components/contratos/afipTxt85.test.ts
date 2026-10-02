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
import { resolveAfip, resolveAfip85 } from "./afipCompleteness";
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
