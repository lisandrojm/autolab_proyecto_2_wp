import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmacionValida, fechaDeCorrida } from "./importFramePausado.js";

const ULTIMA = new Date("2026-09-21T15:00:00Z");
test("la fecha se muestra DD/MM/AAAA en hora argentina", () => {
  assert.equal(fechaDeCorrida(ULTIMA), "21/09/2026");
  assert.equal(fechaDeCorrida(new Date("2026-09-22T02:00:00Z")), "21/09/2026"); // 23 h del 21 en Argentina
});
test("sin escribir nada, no", () => assert.equal(confirmacionValida(ULTIMA, undefined), false));
test("otra fecha, no", () => assert.equal(confirmacionValida(ULTIMA, "22/09/2026"), false));
test("la fecha exacta, sí (también con guiones o espacios)", () => {
  assert.equal(confirmacionValida(ULTIMA, "21/09/2026"), true);
  assert.equal(confirmacionValida(ULTIMA, " 21-09-2026 "), true);
});
test("un «sí» o true no alcanza", () => {
  assert.equal(confirmacionValida(ULTIMA, true), false);
  assert.equal(confirmacionValida(ULTIMA, "PRIMERA"), false);
});
test("sin ninguna previa hay que escribir PRIMERA", () => {
  assert.equal(confirmacionValida(null, "primera"), true);
  assert.equal(confirmacionValida(null, ""), false);
});
