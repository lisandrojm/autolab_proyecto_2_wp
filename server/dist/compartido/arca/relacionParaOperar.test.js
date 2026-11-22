import { test } from "node:test";
import assert from "node:assert/strict";
import { finConocido, operacionReciente, relacionParaOperar } from "./relacionParaOperar.js";
const c = (x = {}) => ({ tramite: "alta_temprana_afip", cuil: "20111111112", empresaCuit: "30222222223", alta: "2026-10-01", altaArcaPresentada: null, enEspejo: false, ...x });
test("alta presentada desde WeProdu: se opera, aunque el espejo no la tenga", () => {
    assert.deepEqual(relacionParaOperar(c({ altaArcaPresentada: { resultado: "presentada", via: "altas_masivas" } })), { puede: true, motivo: "", via: "weprodu" });
});
test("adoptada y hallada al verificar: se dicen aparte", () => {
    assert.equal(relacionParaOperar(c({ altaArcaPresentada: { resultado: "presentada", via: "externa" } })).via, "adoptada");
    assert.equal(relacionParaOperar(c({ altaArcaPresentada: { resultado: "presentada", via: "verificacion" } })).via, "verificacion");
});
test("sin marca pero en el espejo (alta hecha a mano, no adoptada): se opera", () => {
    assert.deepEqual(relacionParaOperar(c({ enEspejo: true })), { puede: true, motivo: "", via: "espejo" });
    // Un alta que ARCA rechazó desde WeProdu y después se hizo a mano: está en el espejo.
    assert.equal(relacionParaOperar(c({ enEspejo: true, altaArcaPresentada: { resultado: "fallida" } })).via, "espejo");
});
test("sin marca y sin espejo: no hay relación", () => {
    const r = relacionParaOperar(c());
    assert.equal(r.puede, false);
    assert.match(r.motivo, /no hay relación/);
});
test("Servicios o trámite desconocido: no", () => {
    assert.match(relacionParaOperar(c({ tramite: "constancia_cuit", enEspejo: true })).motivo, /no es de trámite ARCA/);
    assert.equal(relacionParaOperar(c({ tramite: null, altaArcaPresentada: { resultado: "presentada" } })).puede, false);
    // Sin resolver el trámite (quien llama no lo pasa) no se mira.
    assert.equal(relacionParaOperar(c({ tramite: undefined, enEspejo: true })).puede, true);
});
test("ANULADO en WeProdu: no, aunque ARCA tenga la relación", () => {
    assert.match(relacionParaOperar(c({ estadoContrato: "ANULADO", enEspejo: true })).motivo, /anulado en WeProdu/);
});
test("alta sin confirmar o anulada en ARCA: no, aunque esté en el espejo", () => {
    assert.match(relacionParaOperar(c({ enEspejo: true, altaArcaPresentada: { resultado: "indeterminado" } })).motivo, /sin confirmar/);
    assert.match(relacionParaOperar(c({ enEspejo: true, altaArcaPresentada: { resultado: "presentando" } })).motivo, /sin confirmar/);
    assert.match(relacionParaOperar(c({ enEspejo: true, altaArcaPresentada: { resultado: "anulada" } })).motivo, /anulada/);
});
test("sin CUIL, sin CUIT de la empleadora o sin fecha de alta: no", () => {
    assert.match(relacionParaOperar(c({ cuil: "123", enEspejo: true })).motivo, /CUIL/);
    assert.match(relacionParaOperar(c({ empresaCuit: "", altaArcaPresentada: { resultado: "presentada" } })).motivo, /CUIT/);
    assert.match(relacionParaOperar(c({ alta: "", enEspejo: true })).motivo, /fecha de alta/);
});
const HOY = "2026-11-22";
test("hay algo que operar: abierta o con fin de hoy en adelante; una cerrada no", () => {
    const presentada = { altaArcaPresentada: { resultado: "presentada", via: "altas_masivas" }, hoy: HOY };
    assert.equal(relacionParaOperar(c({ ...presentada, fin: "" })).puede, true);
    assert.equal(relacionParaOperar(c({ ...presentada, fin: HOY })).puede, true);
    assert.equal(relacionParaOperar(c({ ...presentada, fin: "2026-12-31" })).puede, true);
    const r = relacionParaOperar(c({ ...presentada, fin: "2026-11-21" }));
    assert.equal(r.puede, false);
    assert.match(r.motivo, /terminó el 21\/11\/2026 en ARCA/);
    // Igual para las que sólo están en el espejo.
    assert.equal(relacionParaOperar(c({ enEspejo: true, hoy: HOY, fin: "2025-03-01" })).puede, false);
    assert.equal(relacionParaOperar(c({ enEspejo: true, hoy: HOY, fin: "" })).via, "espejo");
    // Sin `hoy` no se mira (quien llama no lo resolvió).
    assert.equal(relacionParaOperar(c({ ...presentada, hoy: undefined, fin: "2020-01-01" })).puede, true);
});
test("una cerrada con una operación reciente desde WeProdu sigue a mano (anular la baja)", () => {
    const cerrada = { altaArcaPresentada: { resultado: "presentada" }, hoy: HOY, fin: "2026-11-10" };
    assert.equal(relacionParaOperar(c({ ...cerrada, operacionReciente: true })).puede, true);
    assert.equal(relacionParaOperar(c({ ...cerrada, operacionReciente: false })).puede, false);
});
test("operación reciente: sin confirmar siempre; presentada sólo 30 días", () => {
    assert.equal(operacionReciente([null, { resultado: "indeterminado", fecha: "2025-01-01" }], HOY), true);
    assert.equal(operacionReciente([{ resultado: "presentando" }], HOY), true);
    assert.equal(operacionReciente([{ resultado: "presentada", fecha: "2026-11-01T12:00:00Z" }], HOY), true);
    assert.equal(operacionReciente([{ resultado: "presentada", fecha: new Date("2026-10-01T12:00:00Z") }], HOY), false);
    assert.equal(operacionReciente([{ resultado: "fallida", fecha: "2026-11-21" }], HOY), false);
    assert.equal(operacionReciente([], HOY), false);
});
test("fin conocido: el del espejo si está; si no, la baja del contrato", () => {
    assert.equal(finConocido({ enEspejo: true, finEspejo: "", bajaContrato: "2026-11-01" }), "");
    assert.equal(finConocido({ enEspejo: true, finEspejo: "2026-11-30", bajaContrato: "2026-11-01" }), "2026-11-30");
    assert.equal(finConocido({ enEspejo: false, finEspejo: "", bajaContrato: "2026-11-01T00:00:00.000Z" }), "2026-11-01");
});
