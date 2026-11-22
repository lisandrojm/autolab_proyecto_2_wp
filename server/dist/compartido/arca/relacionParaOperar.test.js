import { test } from "node:test";
import assert from "node:assert/strict";
import { relacionParaOperar } from "./relacionParaOperar.js";
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
