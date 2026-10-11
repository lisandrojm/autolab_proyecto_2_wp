import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { altaQueSePisa } from "./altasVigentes.js";
import { horaArgentina, momentoDePresentacion } from "./presentacionAutomatica.js";
const presentada = (o = {}) => ({ userId: "u1", userProjectId: "up1", contractIndex: 0, empresaId: "e1", alta: "2026-10-10", baja: "2026-10-12", ...o });
const contrato = (o = {}) => ({
    userId: "u1",
    userProjectId: "up1",
    contractIndex: 1,
    empresaId: "e1",
    alta: "2026-10-11",
    baja: "2026-10-15",
    ...o,
});
describe("una sola alta vigente por persona y empleadora", () => {
    it("se pisa con un alta presentada que todavía no terminó", () => {
        assert.ok(altaQueSePisa(contrato(), [presentada()]));
    });
    it("empezar el mismo día que termina la otra también se pisa (los dos días cuentan)", () => {
        assert.ok(altaQueSePisa(contrato({ alta: "2026-10-12" }), [presentada()]));
    });
    it("después de la baja de la presentada, no", () => {
        assert.equal(altaQueSePisa(contrato({ alta: "2026-10-13" }), [presentada()]), null);
    });
    it("una presentada sin baja sigue abierta: pisa a cualquiera posterior", () => {
        assert.ok(altaQueSePisa(contrato({ alta: "2027-03-01", baja: "" }), [presentada({ baja: "" })]));
    });
    it("con OTRA empleadora no se pisa: son dos relaciones legítimas", () => {
        assert.equal(altaQueSePisa(contrato({ empresaId: "e2" }), [presentada()]), null);
    });
    it("otra persona no cuenta", () => {
        assert.equal(altaQueSePisa(contrato({ userId: "u2" }), [presentada()]), null);
    });
    it("el mismo contrato no se pisa consigo mismo", () => {
        assert.equal(altaQueSePisa(contrato({ contractIndex: 0 }), [presentada()]), null);
    });
    it("lee las fechas viejas DD/MM/YYYY", () => {
        assert.ok(altaQueSePisa(contrato({ alta: "11/10/2026", baja: "15/10/2026" }), [presentada()]));
    });
});
describe("el horario de la automática", () => {
    it("las 14 h de la fecha de alta, hora argentina (UTC-3)", () => {
        assert.equal(momentoDePresentacion("2026-10-12").toISOString(), "2026-10-12T17:00:00.000Z");
    });
    it("la hora argentina no depende de la zona del servidor", () => {
        assert.equal(horaArgentina(new Date("2026-10-12T17:00:00Z")), 14);
        assert.equal(horaArgentina(new Date("2026-10-13T02:30:00Z")), 23);
        assert.equal(horaArgentina(new Date("2026-10-13T03:00:00Z")), 0);
    });
});
