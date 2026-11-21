/**
 * El freno de las bajas automáticas (19/11/2026): sólo `aplicar: true`, tope inclusive, nada si se pasa, y
 * afuera las empleadoras cuya lectura falló. Puro, sin base.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirBajasAutomaticas, topeBajasAutomaticas, TOPE_POR_DEFECTO } from "./bajasArcaAutomaticas.js";
const item = (n, aplicar, cuit = "30111111111") => ({ contratoKey: `k${n}`, aplicar, empleadoraCuit: cuit });
const lote = (aplicables, listadas, cuit) => [...Array.from({ length: aplicables }, (_, i) => item(i, true, cuit)), ...Array.from({ length: listadas }, (_, i) => item(100 + i, false, cuit))];
test("el tope: el env entero ≥ 1, o 20", () => {
    assert.equal(topeBajasAutomaticas(undefined), TOPE_POR_DEFECTO);
    assert.equal(topeBajasAutomaticas(""), 20);
    assert.equal(topeBajasAutomaticas("abc"), 20);
    assert.equal(topeBajasAutomaticas("0"), 20);
    assert.equal(topeBajasAutomaticas("2.5"), 20);
    assert.equal(topeBajasAutomaticas("35"), 35);
});
test("debajo del tope: se escriben sólo las de aplicar=true; las demás se listan", () => {
    const d = decidirBajasAutomaticas(lote(3, 5), 20);
    assert.equal(d.frenada, false);
    assert.deepEqual(d.claves, ["k0", "k1", "k2"]);
    assert.equal(d.aplicables, 3);
    assert.equal(d.listadas, 5);
    assert.equal(d.excluidasPorEmpleadora, 0);
});
test("justo en el tope no frena; una más, frena y no escribe ninguna", () => {
    assert.equal(decidirBajasAutomaticas(lote(20, 0), 20).frenada, false);
    const d = decidirBajasAutomaticas(lote(21, 4), 20);
    assert.equal(d.frenada, true);
    assert.deepEqual(d.claves, []);
    assert.equal(d.aplicables, 21);
    assert.equal(d.listadas, 4);
    assert.equal(d.tope, 20);
});
test("una empleadora con error en la corrida: sus bajas quedan afuera y no cuentan para el tope", () => {
    const items = [...lote(2, 1, "30111111111"), ...lote(19, 0, "30222222222")];
    const d = decidirBajasAutomaticas(items, 20, ["30222222222"]);
    assert.equal(d.frenada, false);
    assert.deepEqual(d.claves, ["k0", "k1"]);
    assert.equal(d.aplicables, 2);
    assert.equal(d.excluidasPorEmpleadora, 19);
    assert.equal(d.listadas, 1);
});
test("sin nada para aplicar: nada que escribir y nada frenado", () => {
    const d = decidirBajasAutomaticas(lote(0, 7), 20);
    assert.deepEqual(d.claves, []);
    assert.equal(d.frenada, false);
    assert.equal(d.listadas, 7);
});
