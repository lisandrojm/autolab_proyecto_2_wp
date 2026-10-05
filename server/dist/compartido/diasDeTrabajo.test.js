/** La semana que propone el tipo de contrato. Run: npx tsx --test src/compartido/diasDeTrabajo.test.ts */
import { test } from "node:test";
import assert from "node:assert/strict";
import { semanaDelTipoDeContrato } from "./diasDeTrabajo.js";
test("6x6 sobre la semana por defecto (Lu–Vi): se suma el sábado", () => {
    assert.deepEqual(semanaDelTipoDeContrato(6, [1, 2, 3, 4, 5]), { diasPorSemana: 6, dias: [1, 2, 3, 4, 5, 6] });
});
test("sin días marcados: de lunes en adelante", () => {
    assert.deepEqual(semanaDelTipoDeContrato(3, []), { diasPorSemana: 3, dias: [1, 2, 3] });
});
test("sobran días: se conservan los primeros de lunes a domingo", () => {
    assert.deepEqual(semanaDelTipoDeContrato(2, [0, 3, 5]), { diasPorSemana: 2, dias: [3, 5] });
});
test("rotativos: los días no se tocan", () => {
    assert.deepEqual(semanaDelTipoDeContrato(3, [1, 2, 3, 4, 5, 6], true), { diasPorSemana: 3, dias: [1, 2, 3, 4, 5, 6] });
});
test("sin días por semana en el tipo: nada que proponer", () => {
    assert.equal(semanaDelTipoDeContrato(null, [1]), null);
    assert.equal(semanaDelTipoDeContrato(0, [1]), null);
});
