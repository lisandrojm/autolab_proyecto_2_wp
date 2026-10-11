import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { altaQueSePisa } from "./altasVigentes.js";
import { CONFIG_POR_DEFECTO, configDe, minutosArgentina, momentoDeCorrida, proximaCorridaPara, validarConfig, ventanaDeLaCorrida } from "./horarioAltasAutomaticas.js";
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
    const cfg = CONFIG_POR_DEFECTO;
    it("por defecto, las 14:00 de la fecha de alta, hora argentina (UTC-3)", () => {
        assert.equal(momentoDeCorrida("2026-10-12", cfg).toISOString(), "2026-10-12T17:00:00.000Z");
        assert.equal(momentoDeCorrida("2026-10-12", { hora: 9, minuto: 30, diasAntes: 0 }).toISOString(), "2026-10-12T12:30:00.000Z");
    });
    it("la hora argentina no depende de la zona del servidor", () => {
        assert.equal(minutosArgentina(new Date("2026-10-12T17:00:00Z")), 14 * 60);
        assert.equal(minutosArgentina(new Date("2026-10-13T02:30:00Z")), 23 * 60 + 30);
        assert.equal(minutosArgentina(new Date("2026-10-13T03:00:00Z")), 0);
    });
    it("lo guardado se completa con los defaults y se descarta lo inválido", () => {
        assert.deepEqual(configDe(undefined), { hora: 14, minuto: 0, diasAntes: 0 });
        assert.deepEqual(configDe({ hora: 9, minuto: 75, diasAntes: 2 }), { hora: 9, minuto: 0, diasAntes: 2 });
    });
    it("al guardar, cada campo se valida y el que falta no se toca", () => {
        assert.deepEqual(validarConfig({ hora: 10 }), { ok: true, cambios: { hora: 10 } });
        assert.equal(validarConfig({ hora: 24 }).ok, false);
        assert.equal(validarConfig({ diasAntes: -1 }).ok, false);
        assert.deepEqual(validarConfig({}), { ok: true, cambios: {} });
    });
    it("la corrida toma las atrasadas de hasta 30 días y, con anticipación, los días que vienen", () => {
        assert.deepEqual(ventanaDeLaCorrida("2026-10-10", cfg), { desde: "2026-09-10", hasta: "2026-10-10" });
        assert.deepEqual(ventanaDeLaCorrida("2026-10-30", { ...cfg, diasAntes: 2 }), { desde: "2026-09-30", hasta: "2026-11-01" });
    });
    describe("la próxima corrida que presenta un alta", () => {
        const hoy = "2026-10-10";
        const manana = new Date("2026-10-10T12:00:00-03:00"); // 12:00, antes de la corrida
        const tarde = new Date("2026-10-10T15:00:00-03:00"); // 15:00, después
        it("alta de hoy, antes de la hora: la corrida de hoy", () => {
            assert.equal(proximaCorridaPara("2026-10-10", cfg, manana, hoy)?.toISOString(), "2026-10-10T17:00:00.000Z");
        });
        it("alta de hoy, después de la hora: entra en la corrida de mañana (no queda para subir a mano)", () => {
            assert.equal(proximaCorridaPara("2026-10-10", cfg, tarde, hoy)?.toISOString(), "2026-10-11T17:00:00.000Z");
        });
        it("alta de pasado mañana sin anticipación: la corrida de ese día", () => {
            assert.equal(proximaCorridaPara("2026-10-12", cfg, tarde, hoy)?.toISOString(), "2026-10-12T17:00:00.000Z");
        });
        it("con 2 días de anticipación, el alta de pasado mañana sale hoy si todavía no es la hora", () => {
            assert.equal(proximaCorridaPara("2026-10-12", { ...cfg, diasAntes: 2 }, manana, hoy)?.toISOString(), "2026-10-10T17:00:00.000Z");
        });
        it("…y si la de hoy ya pasó, sale mañana (no espera a su día)", () => {
            assert.equal(proximaCorridaPara("2026-10-12", { ...cfg, diasAntes: 2 }, tarde, hoy)?.toISOString(), "2026-10-11T17:00:00.000Z");
        });
        it("con anticipación, un alta lejana sale en la primera corrida que la alcanza", () => {
            assert.equal(proximaCorridaPara("2026-10-20", { ...cfg, diasAntes: 3 }, tarde, hoy)?.toISOString(), "2026-10-17T17:00:00.000Z");
        });
        it("un alta atrasada (falló, o se cargó después de su fecha) entra en la próxima corrida", () => {
            assert.equal(proximaCorridaPara("2026-10-09", cfg, manana, hoy)?.toISOString(), "2026-10-10T17:00:00.000Z");
            assert.equal(proximaCorridaPara("2026-10-01", cfg, tarde, hoy)?.toISOString(), "2026-10-11T17:00:00.000Z");
        });
        it("más vieja que 30 días, la automática ya no la toma: se fuerza a mano", () => {
            assert.equal(proximaCorridaPara("2026-09-01", cfg, manana, hoy), null);
        });
    });
});
