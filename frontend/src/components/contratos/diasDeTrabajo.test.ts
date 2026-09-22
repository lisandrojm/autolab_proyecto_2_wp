/**
 * Tests de los días de trabajo: la semana que se propone sola y el tope de días marcables.
 *
 * Run with:
 *   npx tsx --test src/components/contratos/diasDeTrabajo.test.ts
 *   – o –
 *   npm run test:dias
 *
 * Son los dos números que terminan en el contrato —cuántos días trabaja y cuáles—, y de ahí sale
 * cuánto se le paga. Un default que proponga los días equivocados no falla: queda cargado.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { semanaEstandar, maximoDiasElegibles } from "./DiasDeTrabajo.js";

describe("semanaEstandar — la semana que se propone sola", () => {
  it("5 días es lunes a viernes", () => {
    assert.deepEqual(semanaEstandar(5), [1, 2, 3, 4, 5]);
  });

  it("6 días es lunes a sábado (sin domingo)", () => {
    assert.deepEqual(semanaEstandar(6), [1, 2, 3, 4, 5, 6]);
    assert.ok(!semanaEstandar(6)?.includes(0));
  });

  it("7 días es la semana entera, domingo incluido", () => {
    assert.deepEqual(semanaEstandar(7), [0, 1, 2, 3, 4, 5, 6]);
  });

  it("con menos de 5 no se propone nada: no hay una semana obvia", () => {
    // Tres días pueden ser lunes-miércoles-viernes o martes-jueves-sábado: elegir sería inventar.
    for (const n of [0, 1, 2, 3, 4]) assert.equal(semanaEstandar(n), null);
  });

  it("lo que propone entra en el tope de días marcables", () => {
    for (const n of [5, 6, 7]) assert.equal(semanaEstandar(n)?.length, maximoDiasElegibles(n, false));
  });
});
