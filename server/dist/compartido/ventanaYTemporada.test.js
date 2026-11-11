import { test } from "node:test";
import assert from "node:assert/strict";
import { temporadaConVentana, ventanaDeTemporada } from "./ventanaGoce.js";
test("la temporada del plan da la ventana sin año", () => {
    assert.deepEqual(ventanaDeTemporada("2026-11-01", "2027-04-20"), { inicio: "11-01", fin: "04-20" });
});
test("la ventana que envuelve el 1/1 termina el año siguiente, en el año en que empezaba el plan", () => {
    assert.deepEqual(temporadaConVentana("2026-11-01", { inicio: "10-15", fin: "04-30" }), { desde: "2026-10-15", hasta: "2027-04-30" });
});
test("la ventana dentro del año queda en el mismo año", () => {
    assert.deepEqual(temporadaConVentana("2027-01-10", { inicio: "01-01", fin: "03-31" }), { desde: "2027-01-01", hasta: "2027-03-31" });
});
test("el 29/2 en un año que no lo tiene cae en el 28", () => {
    assert.deepEqual(temporadaConVentana("2026-11-01", { inicio: "11-01", fin: "02-29" }), { desde: "2026-11-01", hasta: "2027-02-28" });
});
test("ida y vuelta: la temporada con su propia ventana no cambia", () => {
    const t = { desde: "2026-11-01", hasta: "2027-04-20" };
    assert.deepEqual(temporadaConVentana(t.desde, ventanaDeTemporada(t.desde, t.hasta)), t);
});
