/**
 * Etapa 5: «relación de ARCA sin contrato exacto» (sólo para mostrar; nunca escribe). Puro, sin base.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { relacionesSinContratoExacto } from "./auditoriaArca.js";
const CUIL = "27470285058";
const CUIT = "30111111111";
const HOY = "2026-11-20";
const rel = (inicio, fin = "", extra = {}) => ({ cuil: CUIL, empleadoraCuit: CUIT, inicio, fin, ...extra });
const contrato = (contratoKey, alta, baja = "", extra = {}) => ({ contratoKey, alta, baja, cuil: CUIL, cuit: CUIT, ...extra });
test("Pellegrini: contrato desde el 07/02, ARCA desde el 10/02 → una fila con las dos fechas y 3 días", () => {
    const r = relacionesSinContratoExacto([contrato("k1", "2025-02-07", "2025-03-31")], [rel("2025-02-10", "2025-03-31", { situacionBaja: "Vencimiento de plazo" })], HOY);
    assert.deepEqual(r, [{ cuil: CUIL, cuit: CUIT, inicio: "2025-02-10", fin: "2025-03-31", situacionBaja: "Vencimiento de plazo", contratos: [{ contratoKey: "k1", alta: "2025-02-07", baja: "2025-03-31", dias: 3 }] }]);
});
test("con un contrato de alta exacta la relación está explicada: nada", () => {
    assert.deepEqual(relacionesSinContratoExacto([contrato("k1", "2025-02-10", "2025-03-31")], [rel("2025-02-10", "2025-03-31")], HOY), []);
});
test("Montoya: un tramo 17–20/07 y jornadas 18, 19, 20 (y una del 12) → UNA fila con las tres solapadas, la más cercana primero", () => {
    const contratos = [contrato("k12", "2026-07-12", "2026-07-12"), contrato("k18", "2026-07-18", "2026-07-18"), contrato("k19", "2026-07-19", "2026-07-19"), contrato("k20", "2026-07-20", "2026-07-20")];
    const r = relacionesSinContratoExacto(contratos, [rel("2026-07-17", "2026-07-20")], HOY);
    assert.equal(r.length, 1);
    assert.deepEqual(r[0].contratos.map((c) => [c.contratoKey, c.dias]), [["k18", -1], ["k19", -2], ["k20", -3]]);
});
test("Palomino: el segundo tramo, contiguo al primero (que tiene contrato exacto), está explicado por la misma cadena", () => {
    const contratos = [contrato("k0", "2021-12-15", "2026-10-31")];
    const rels = [rel("2021-12-15", "2022-02-28"), rel("2022-03-01", "2026-10-31", { situacionBaja: "Baja por despido" })];
    assert.deepEqual(relacionesSinContratoExacto(contratos, rels, HOY), []);
    // Con un hueco de un día ya no es la cadena: se lista.
    assert.equal(relacionesSinContratoExacto(contratos, [rel("2021-12-15", "2022-02-27"), rel("2022-03-01", "2026-10-31")], HOY).length, 1);
});
test("sin solapamiento no se lista (una jornada del 12 y un tramo del 17 al 20 no son la misma relación)", () => {
    assert.deepEqual(relacionesSinContratoExacto([contrato("k12", "2026-07-12", "2026-07-12")], [rel("2026-07-17", "2026-07-20")], HOY), []);
});
test("abiertos de los dos lados se solapan; la relación futura no se mira; los anulados no cuentan", () => {
    assert.equal(relacionesSinContratoExacto([contrato("k1", "2023-06-01")], [rel("2023-06-05")], HOY).length, 1);
    assert.deepEqual(relacionesSinContratoExacto([contrato("k1", "2026-12-01")], [rel("2026-12-03")], HOY), []);
    assert.deepEqual(relacionesSinContratoExacto([contrato("k1", "2025-02-07", "2025-03-31", { estadoContrato: "ANULADO" })], [rel("2025-02-10", "2025-03-31")], HOY), []);
});
test("otra persona u otra empleadora no se mezclan; una relación repetida en el espejo sale una vez", () => {
    const rels = [rel("2025-02-10", "2025-03-31"), rel("2025-02-10", "2025-03-31")];
    assert.equal(relacionesSinContratoExacto([contrato("k1", "2025-02-07", "2025-03-31")], rels, HOY).length, 1);
    assert.deepEqual(relacionesSinContratoExacto([contrato("k1", "2025-02-07", "2025-03-31", { cuil: "20000000001" })], rels, HOY), []);
    assert.deepEqual(relacionesSinContratoExacto([contrato("k1", "2025-02-07", "2025-03-31", { cuit: "30999999999" })], rels, HOY), []);
});
