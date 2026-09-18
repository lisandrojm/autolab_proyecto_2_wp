/**
 * Tests de cuál contrato se borra junto con una solicitud aprobada.
 *
 *   npm run test:contrato-solicitud
 *
 * Equivocarse acá no da error: borra en silencio el contrato de otra contratación de la misma
 * persona. Por eso lo que se prueba es sobre todo cuándo NO se elige ninguno.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { elegirContratoDeSolicitud } from "./contratoDeSolicitud.js";
const SOL = "66f000000000000000000001";
const OTRA = "66f000000000000000000002";
const contrato = (alta, baja, solicitudId) => ({ c: { fecha_alta_contrato: alta, fecha_baja_contrato: baja, ...(solicitudId ? { solicitudId } : {}) } });
describe("elegir el contrato de una solicitud aprobada", () => {
    it("por solicitudId, aunque haya otro con las mismas fechas", () => {
        const suyo = contrato("2026-09-19", "2026-09-19", SOL);
        const todos = [contrato("2026-09-19", "2026-09-19"), suyo];
        assert.equal(elegirContratoDeSolicitud(todos, { solicitudId: SOL, startDate: "2026-09-19", dueDate: "2026-09-19" }), suyo);
    });
    it("sin solicitudId (aprobadas viejas), por alta y baja", () => {
        const suyo = contrato("2026-09-01", "2026-09-01");
        const todos = [contrato("2026-08-25", "2026-08-25"), suyo, contrato("2026-09-08", "2026-09-08")];
        assert.equal(elegirContratoDeSolicitud(todos, { solicitudId: SOL, startDate: "2026-09-01", dueDate: "2026-09-01" }), suyo);
    });
    it("compara el día aunque vengan en formatos distintos", () => {
        const suyo = contrato("01/09/2026", "2026-09-01T03:00:00.000Z");
        assert.equal(elegirContratoDeSolicitud([suyo], { solicitudId: SOL, startDate: "2026-09-01", dueDate: new Date("2026-09-01T00:00:00Z") }), suyo);
    });
    it("si al aprobar se cambió la baja, cae al alta sola", () => {
        const suyo = contrato("2026-09-01", "2026-09-05");
        assert.equal(elegirContratoDeSolicitud([suyo, contrato("2026-08-01", "2026-08-31")], { solicitudId: SOL, startDate: "2026-09-01", dueDate: "2026-09-01" }), suyo);
    });
    it("no toca un contrato que pertenece a OTRA solicitud", () => {
        const deOtra = contrato("2026-09-01", "2026-09-01", OTRA);
        assert.equal(elegirContratoDeSolicitud([deOtra], { solicitudId: SOL, startDate: "2026-09-01", dueDate: "2026-09-01" }), null);
    });
    it("con dos iguales no adivina", () => {
        const todos = [contrato("2026-09-01", "2026-09-01"), contrato("2026-09-01", "2026-09-01")];
        assert.equal(elegirContratoDeSolicitud(todos, { solicitudId: SOL, startDate: "2026-09-01", dueDate: "2026-09-01" }), null);
    });
    it("sin fecha pedida y sin solicitudId, no elige nada", () => {
        assert.equal(elegirContratoDeSolicitud([contrato("2026-09-01", "2026-09-01")], { solicitudId: SOL }), null);
    });
    it("indeterminado: baja vacía de los dos lados", () => {
        const suyo = contrato("2026-09-01", "");
        assert.equal(elegirContratoDeSolicitud([suyo, contrato("2026-09-01", "2026-12-31")], { solicitudId: SOL, startDate: "2026-09-01" }), suyo);
    });
});
