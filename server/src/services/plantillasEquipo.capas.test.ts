/**
 * Las tres capas de un puesto en un equipo (puesto → equipo → diferencia) y el reemplazo explícito.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { datosDelEquipo, puestoEnEquipo, reemplazoDe } from "./plantillasEquipo.js";

const puesto = { _id: "p1", rolesFrame: ["r1"], categoriaSatId: "cat1", inTime: "09:00", outTime: "17:00", shiftId: "sViejo" };
const equipo = { condiciones: { shiftId: "sNoche", inTime: "18:00", outTime: "00:00", diasSemana: [6] } };

test("el equipo pisa al puesto; lo que el equipo no dice sale del puesto", () => {
  const e = puestoEnEquipo(puesto, null, equipo);
  assert.equal(e.shiftId, "sNoche");
  assert.equal(e.inTime, "18:00");
  assert.equal(e.categoriaSatId, "cat1");
});

test("la diferencia del puesto pisa al equipo", () => {
  const e = puestoEnEquipo(puesto, { condiciones: { inTime: "16:00" } }, equipo);
  assert.equal(e.inTime, "16:00");
  assert.equal(e.outTime, "00:00");
});

test("reemplazo explícito, y el «Entró en lugar de» viejo como reemplazo a revisar", () => {
  assert.deepEqual(reemplazoDe({ reemplazo: { replacedUserId: "u9", motivoReemplazoId: "m1" } }), { replacedUserId: "u9", motivoReemplazoId: "m1", revisarMotivo: false });
  assert.deepEqual(reemplazoDe({ reemplazadoDePersonaId: "u8" }), { replacedUserId: "u8", motivoReemplazoId: null, revisarMotivo: true });
  assert.equal(reemplazoDe({ userId: "u1" }), null);
});

test("el proyecto es del equipo; las plantillas viejas se lo prestan a sus equipos", () => {
  const vieja = { projectId: "pLN", empresaContratoId: "e2030", convenioId: "c634" };
  assert.deepEqual(datosDelEquipo(vieja, {}), { projectId: "pLN", empresaContratoId: "e2030", convenioId: "c634" });
  assert.deepEqual(datosDelEquipo({ projectId: null }, { projectId: "pOtro", empresaContratoId: "eF", convenioId: "c131" }), { projectId: "pOtro", empresaContratoId: "eF", convenioId: "c131" });
});
