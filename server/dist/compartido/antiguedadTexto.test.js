/**
 *   npx tsx --test src/compartido/antiguedadTexto.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { textoAntiguedad } from "./antiguedadTexto.js";
describe("la antigüedad en palabras", () => {
    it("años de 365 y meses de 30, omitiendo lo que es cero", () => {
        assert.equal(textoAntiguedad(1), "1 día");
        assert.equal(textoAntiguedad(15), "15 días");
        assert.equal(textoAntiguedad(30), "1 mes");
        assert.equal(textoAntiguedad(365), "1 año");
        assert.equal(textoAntiguedad(365 * 9 + 30 * 11 + 18), "9 años, 11 meses, 18 días");
        assert.equal(textoAntiguedad(2 * 365 + 5), "2 años, 5 días");
    });
    it("cero o basura: «0 días»", () => {
        assert.equal(textoAntiguedad(0), "0 días");
        assert.equal(textoAntiguedad(-3), "0 días");
        assert.equal(textoAntiguedad(NaN), "0 días");
    });
});
