/**
 * El import de FRAME reconoce un contrato que ya está (18/11/2026). Sin base.
 *
 *   npm run test:import-identidad
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { claveDeIdentidad, findNewContracts, sinRepetidosDeFrame, tipoCanonico } from "./additiveSync.js";
import { lapidaDe } from "./anulacionContrato.js";

const CAT = ["Jornada", "Servicios", "Servicios Adicional", "Servicios Intercambio", "Tiempo Indeterminado", "Plazo fijo 5x7", "Plazo fijo 5x7 part-time"];
const base = { proyecto_id: 705, empleado_id: 922, fecha_alta_contrato: "2026-05-01", tipo_contrato_id: 4, categoria_sat_id: 1, nombre_contrato: "Tiempo Indeterminado", nombre_categoria_sat: "Director de Programas" };

test("tipo canónico: prefijo exacto normalizado, el más largo; si no matchea, null", () => {
  assert.equal(tipoCanonico("Servicios - FZERO SRL", CAT), "servicios");
  assert.equal(tipoCanonico("Servicios Adicional", CAT), "servicios adicional");
  assert.equal(tipoCanonico("Plazo fijo 5x7 part-time 2030 SRL", CAT), "plazo fijo 5x7 part-time");
  assert.equal(tipoCanonico("Eventual Talento", CAT), null);
});

test("la categoría cambiada en FRAME NO crea un contrato: sale como discrepancia", () => {
  const r = findNewContracts([{ ...base, categoria_sat_id: 43 }], [{ ...base, contratoKey: "k1" }], CAT);
  assert.equal(r.newContracts.length, 0);
  assert.equal(r.discrepancias.length, 1);
  assert.equal(r.discrepancias[0].contratoKey, "k1");
  assert.deepEqual([r.discrepancias[0].weprodu.id, r.discrepancias[0].frame.id], [1, 43]);
});

test("misma clave de siempre: nada nuevo y sin discrepancia", () => {
  const r = findNewContracts([{ ...base }], [{ ...base }], CAT);
  assert.equal(r.newContracts.length + r.discrepancias.length, 0);
});

test("fecha en otro formato y tipo con otro id (unificarTiposDeContrato): es el mismo contrato", () => {
  const frame = { ...base, fecha_alta_contrato: "2026-05-01T00:00:00.000Z", tipo_contrato_id: 11, nombre_contrato: "Tiempo Indeterminado - FZERO SRL" };
  const r = findNewContracts([frame], [{ ...base }], CAT);
  assert.equal(r.newContracts.length, 0);
  assert.equal(r.discrepancias.length, 0, "el tipo y el formato no son discrepancias");
});

test("NO junta contratos distintos que sólo separaba la categoría: Servicios Intercambio ≠ Servicios Adicional el mismo día", () => {
  const ex = { proyecto_id: 705, empleado_id: 207, fecha_alta_contrato: "2026-10-31", tipo_contrato_id: "", categoria_sat_id: 200, nombre_contrato: "Servicios Intercambio" };
  const nuevo = { ...ex, categoria_sat_id: 201, nombre_contrato: "Servicios Adicional" };
  assert.equal(findNewContracts([nuevo], [ex], CAT).newContracts.length, 1);
});

test("NO junta Jornada con Servicios del mismo día (el par de Aquino)", () => {
  const jornada = { ...base, fecha_alta_contrato: "2026-10-24", tipo_contrato_id: 3, nombre_contrato: "Jornada" };
  const servicios = { ...jornada, tipo_contrato_id: 6, nombre_contrato: "Servicios Jornada" };
  assert.equal(findNewContracts([servicios], [jornada], CAT).newContracts.length, 1);
});

test("un contrato de verdad nuevo se agrega", () => {
  assert.equal(findNewContracts([{ ...base, fecha_alta_contrato: "2026-06-01" }], [{ ...base }], CAT).newContracts.length, 1);
});

test("una lápida no vuelve, ni con la categoría cambiada en FRAME", () => {
  const lapida = lapidaDe({ ...base }, "k9", { el: new Date(), motivo: "duplicado" } as any);
  assert.equal(findNewContracts([{ ...base }], [lapida], CAT).newContracts.length, 0, "por la clave de siempre");
  const r = findNewContracts([{ ...base, categoria_sat_id: 43 }], [lapida], CAT);
  assert.equal(r.newContracts.length, 0, "por la identidad");
  assert.equal(r.discrepancias.length, 0, "una lápida no tiene categoría que discrepar");
});

test("lo que FRAME manda repetido para un vínculo nuevo entra una sola vez", () => {
  assert.equal(sinRepetidosDeFrame([{ ...base }, { ...base }, { ...base, categoria_sat_id: 43 }], CAT).length, 1);
});

test("identidad: sin nombre o sin alta no hay", () => {
  assert.equal(claveDeIdentidad({ ...base, nombre_contrato: "" }, CAT), null);
  assert.equal(claveDeIdentidad({ ...base, fecha_alta_contrato: "" }, CAT), null);
  assert.equal(claveDeIdentidad({ ...base, fecha_alta_contrato: "01/05/2026" }, CAT), "705|922|2026-05-01|tiempo indeterminado");
});

test("una baja distinta en FRAME se informa y NO se aplica; sin cambios no hay discrepancia", () => {
  const ex = { ...base, fecha_baja_contrato: null, contratoKey: "k2" };
  const r = findNewContracts([{ ...base, fecha_baja_contrato: "2026-06-18T00:00:00.000Z" }], [ex], CAT);
  assert.equal(r.newContracts.length, 0);
  assert.equal(r.discrepancias.length, 1);
  assert.equal(r.discrepancias[0].campo, "fecha_baja_contrato");
  assert.deepEqual([r.discrepancias[0].weprodu.id, r.discrepancias[0].frame.id], [null, "2026-06-18"]);
  assert.equal(ex.fecha_baja_contrato, null, "no se aplica");
  assert.equal(findNewContracts([{ ...base, fecha_baja_contrato: "18/06/2026" }], [{ ...base, fecha_baja_contrato: "2026-06-18" }], CAT).discrepancias.length, 0, "mismo día en otro formato");
});
