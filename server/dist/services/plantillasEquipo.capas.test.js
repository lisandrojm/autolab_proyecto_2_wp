/**
 * Las tres capas de un puesto en un equipo (puesto → equipo → diferencia) y el reemplazo explícito.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { contratoEsDelEquipo, datosDelEquipo, puestoEnEquipo, reemplazoDe } from "./plantillasEquipo.js";
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
test("de quién es el tipo de contrato que rige el puesto: del equipo (lo pisa el general al contratar) o propio (se conserva)", () => {
    const equipoJornada = { condiciones: { contratoId: "cJornada", nombreContrato: "Jornada" } };
    // El equipo pone Jornada para todos y el puesto no dice nada: es del equipo.
    assert.equal(contratoEsDelEquipo(null, equipoJornada), true);
    assert.equal(contratoEsDelEquipo({ userId: "u1", condiciones: { inTime: "16:00" } }, equipoJornada), true);
    // La asignación eligió otro para este puesto en este equipo: es propio, aunque el equipo tenga el suyo.
    assert.equal(contratoEsDelEquipo({ condiciones: { contratoId: "cServAdic", nombreContrato: "Servicios Adicional" } }, equipoJornada), false);
    // El equipo no fija contrato: lo que rija (el del puesto en la plantilla, o ninguno) no es del equipo.
    assert.equal(contratoEsDelEquipo(null, { condiciones: { inTime: "18:00" } }), false);
    assert.equal(contratoEsDelEquipo(null, {}), false);
    assert.equal(contratoEsDelEquipo(null, { condiciones: { contratoId: null } }), false);
    // Coherente con `puestoEnEquipo`: lo que éste devuelve como contrato es lo que la marca califica.
    const puestoServ = { _id: "p1", rolesFrame: ["r1"], contratoId: "cServ" };
    assert.equal(puestoEnEquipo(puestoServ, null, equipoJornada).contratoId, "cJornada");
    assert.equal(puestoEnEquipo(puestoServ, { condiciones: { contratoId: "cServAdic" } }, equipoJornada).contratoId, "cServAdic");
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
