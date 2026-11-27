import { test } from "node:test";
import assert from "node:assert/strict";
import { configDe, leToca, proximaCorrida, validarCambios } from "./config.js";
test("configDe: apagada y con la frecuencia de siempre si no hay nada guardado; lo guardado manda", () => {
    assert.deepEqual(configDe(null, "generacionDocumentos"), { activa: false, cadaMinutos: 30 });
    assert.deepEqual(configDe(undefined, "validacionCuit"), { activa: false, cadaMinutos: 60 });
    assert.deepEqual(configDe({ activa: true, cadaMinutos: 15 }, "generacionDocumentos"), { activa: true, cadaMinutos: 15 });
    assert.deepEqual(configDe({ activa: true, cadaMinutos: 0 }, "generacionDocumentos"), { activa: true, cadaMinutos: 30 }, "una frecuencia inválida cae a la de siempre");
});
test("validarCambios: sólo lo que viene, con límites", () => {
    assert.deepEqual(validarCambios({ activa: true }), { ok: true, cambios: { activa: true } });
    assert.deepEqual(validarCambios({ cadaMinutos: 30 }), { ok: true, cambios: { cadaMinutos: 30 } });
    assert.equal(validarCambios({ cadaMinutos: 2 }).ok, false);
    assert.equal(validarCambios({ cadaMinutos: "treinta" }).ok, false);
    assert.equal(validarCambios({ activa: "sí" }).ok, false);
    assert.deepEqual(validarCambios({}), { ok: true, cambios: {} });
});
test("leToca y proximaCorrida: por la frecuencia desde la última corrida", () => {
    const ahora = new Date("2026-11-27T15:00:00Z");
    const cfg = { activa: true, cadaMinutos: 30 };
    assert.equal(leToca({ ...cfg, activa: false }, null, ahora), false);
    assert.equal(leToca(cfg, null, ahora), true, "nunca corrió");
    assert.equal(leToca(cfg, new Date("2026-11-27T14:40:00Z"), ahora), false, "hace 20 min");
    assert.equal(leToca(cfg, new Date("2026-11-27T14:30:00Z"), ahora), true, "hace 30 min justos");
    assert.equal(proximaCorrida({ ...cfg, activa: false }, null, ahora), null);
    assert.equal(proximaCorrida(cfg, null, ahora)?.toISOString(), ahora.toISOString());
    assert.equal(proximaCorrida(cfg, new Date("2026-11-27T14:40:00Z"), ahora)?.toISOString(), "2026-11-27T15:10:00.000Z");
    assert.equal(proximaCorrida(cfg, new Date("2026-11-27T14:00:00Z"), ahora)?.toISOString(), ahora.toISOString(), "ya vencida: ahora");
});
