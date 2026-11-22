import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoDeRelacion, modoDeOperar } from "./relacionesOperables.js";
import { marcaDeLog, marcasDeLogs, SIN_MARCAS } from "./registroOperaciones.js";
const HOY = "2026-11-22";
const rel = (x = {}) => ({ empleadoraCuit: "30222222223", cuil: "20111111112", inicio: "2026-05-01", fin: "", ...x });
const contrato = (x = {}) => ({ userProjectId: "up1", contratoKey: "k1", posicion: 0, proyecto: "LN+", contrato: "Tiempo Indeterminado", alta: "2026-05-01", baja: "", estadoContrato: "", tramite: "alta_temprana_afip", altaArcaPresentada: null, marcas: [], ...x });
test("estado de la relación por su fecha de fin", () => {
    assert.equal(estadoDeRelacion("", HOY), "abierta");
    assert.equal(estadoDeRelacion(HOY, HOY), "fin_futuro");
    assert.equal(estadoDeRelacion("2026-12-31", HOY), "fin_futuro");
    assert.equal(estadoDeRelacion("2026-11-01", HOY), "cerrada_reciente");
    assert.equal(estadoDeRelacion("2026-10-22", HOY), "cerrada");
});
test("un contrato: el panel abre con él; si ya terminó en WeProdu, dice hace cuántos días", () => {
    const vivo = modoDeOperar(rel(), [contrato()], SIN_MARCAS, HOY);
    assert.equal(vivo.modo, "contrato");
    assert.equal(vivo.diasDesdeFinContrato, null);
    // Becerini / Pereda: terminó en WeProdu y ARCA la sigue teniendo abierta.
    const terminado = modoDeOperar(rel(), [contrato({ baja: "2026-11-12" })], SIN_MARCAS, HOY);
    assert.equal(terminado.modo, "contrato");
    assert.equal(terminado.diasDesdeFinContrato, 10);
});
test("varios contratos con la misma alta y empleadora: hay que elegir", () => {
    const r = modoDeOperar(rel(), [contrato(), contrato({ userProjectId: "up2", contratoKey: "k2" })], SIN_MARCAS, HOY);
    assert.equal(r.modo, "elegir");
    assert.equal(r.contratos.length, 2);
});
test("un Servicios que empieza el mismo día no es el contrato de la relación", () => {
    const r = modoDeOperar(rel(), [contrato(), contrato({ userProjectId: "up2", contratoKey: "k2", contrato: "Servicios Intercambio", tramite: "constancia_cuit" })], SIN_MARCAS, HOY);
    assert.equal(r.modo, "contrato");
    assert.equal(r.contratos.length, 1);
    // Y si el único es de Servicios, la relación queda sin contrato.
    assert.equal(modoDeOperar(rel(), [contrato({ tramite: "constancia_cuit" })], SIN_MARCAS, HOY).modo, "sin_contrato");
});
test("un contrato anulado no cuenta", () => {
    assert.equal(modoDeOperar(rel(), [contrato({ estadoContrato: "ANULADO" })], SIN_MARCAS, HOY).modo, "sin_contrato");
});
test("sin contrato: abierta o con fin futuro se opera; cerrada no", () => {
    assert.deepEqual(modoDeOperar(rel(), [], SIN_MARCAS, HOY), { contratos: [], modo: "sin_contrato", puede: true, motivo: "", diasDesdeFinContrato: null });
    assert.equal(modoDeOperar(rel({ fin: "2026-12-31" }), [], SIN_MARCAS, HOY).modo, "sin_contrato");
    const cerrada = modoDeOperar(rel({ fin: "2026-11-10" }), [], SIN_MARCAS, HOY);
    assert.equal(cerrada.modo, null);
    assert.match(cerrada.motivo, /terminó el 10\/11\/2026/);
});
test("sin contrato: una baja reciente del registro la deja a mano; el alta anulada la saca", () => {
    const baja = marcasDeLogs([{ tipo: "baja", createdAt: "2026-11-15T12:00:00Z", resultado: "presentada", irreversible: true }]);
    assert.equal(modoDeOperar(rel({ fin: "2026-11-10" }), [], baja, HOY).modo, "sin_contrato");
    const anulada = marcasDeLogs([{ tipo: "anulacion", createdAt: "2026-11-15T12:00:00Z", resultado: "presentada", irreversible: true, operacion: { que: "alta" } }]);
    const r = modoDeOperar(rel(), [], anulada, HOY);
    assert.equal(r.modo, null);
    assert.match(r.motivo, /anulada/);
});
test("un contrato con la relación cerrada: no hay nada que operar, y lo dice", () => {
    const r = modoDeOperar(rel({ fin: "2025-06-30" }), [contrato({ baja: "2025-06-30" })], SIN_MARCAS, HOY);
    assert.equal(r.modo, null);
    assert.equal(r.puede, false);
    assert.match(r.motivo, /terminó el 30\/06\/2025/);
});
test("la marca que deja un log", () => {
    assert.equal(marcaDeLog({ tipo: "baja", resultado: "presentada" }).resultado, "presentada");
    assert.equal(marcaDeLog({ tipo: "baja", resultado: "ya_hecha" }).resultado, "presentada");
    assert.equal(marcaDeLog({ tipo: "baja", resultado: "indeterminado" }).resultado, "indeterminado");
    // El servidor se cayó después de dejar el rastro: no se sabe si ARCA lo tomó.
    assert.equal(marcaDeLog({ tipo: "baja", resultado: "en_curso", irreversible: true }).resultado, "presentando");
    assert.equal(marcaDeLog({ tipo: "baja", resultado: "fallo", irreversible: true }).resultado, "indeterminado");
    // Cortada antes del click, o rechazada: no traba.
    assert.equal(marcaDeLog({ tipo: "baja", resultado: "en_curso", irreversible: false }).resultado, "fallida");
    assert.equal(marcaDeLog({ tipo: "baja", resultado: "rechazada", irreversible: true }).resultado, "fallida");
});
test("las marcas de una relación: vale la más nueva, y un intento fallido no tapa una que traba", () => {
    const m = marcasDeLogs([
        { tipo: "baja", createdAt: "2026-11-20T10:00:00Z", resultado: "fallida" },
        { tipo: "baja", createdAt: "2026-11-10T10:00:00Z", resultado: "presentada", irreversible: true, operacion: { payload: { fechaFin: "2026-11-09" } } },
        { tipo: "modificacion", createdAt: "2026-11-11T10:00:00Z", resultado: "en_curso", irreversible: true },
    ]);
    assert.equal(m.baja?.resultado, "presentada");
    assert.deepEqual(m.baja?.payload, { fechaFin: "2026-11-09" });
    assert.equal(m.modificacion?.resultado, "presentando");
    assert.equal(m.anulacion, null);
    assert.equal(m.altaAnulada, false);
});
test("anular la baja la deja anulada: se puede volver a dar", () => {
    const m = marcasDeLogs([
        { tipo: "baja", createdAt: "2026-11-10T10:00:00Z", resultado: "presentada", irreversible: true },
        { tipo: "anulacion", createdAt: "2026-11-12T10:00:00Z", resultado: "presentada", irreversible: true, operacion: { que: "baja" } },
    ]);
    assert.equal(m.baja?.resultado, "anulada");
    assert.equal(m.anulacion?.resultado, "presentada");
});
