/**
 * Variables de las plantillas de contrato: que el catálogo del editor y lo que resuelve el server
 * no se desincronicen.
 *
 *   npm run test:variables-documento
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { brutoDeEscalaEnDocumento } from "./employeeDocData.js";
import { getDummyDocVariables, replaceDocVariables } from "./documentPdf.js";
import { numeroALetras } from "./numeroALetras.js";
/** Las variables que ofrece el modal «Variables del contrato» (frontend/src/api/contratosFrame.ts). */
const catalogo = () => {
    const fuente = readFileSync(new URL("../../../frontend/src/api/contratosFrame.ts", import.meta.url), "utf8");
    const desde = fuente.indexOf("export const contratoVariables");
    const hasta = fuente.indexOf("\n];", desde);
    return [...new Set(fuente.slice(desde, hasta).match(/"\{\{\w+\}\}"/g)?.map((v) => v.slice(3, -3)) || [])];
};
describe("bruto de escala de la categoría", () => {
    it("números y letras con el mismo formato que {{sueldoJornada}} / {{sueldoJornadaLetras}}", () => {
        const v = brutoDeEscalaEnDocumento(2185346.12);
        assert.equal(v.sueldoBrutoCatSatNumero, (2185346.12).toLocaleString("es-AR"));
        assert.equal(v.sueldoBrutoCatSatLetras, numeroALetras(2185346.12));
        assert.match(v.sueldoBrutoCatSatLetras, /^DOS MILLONES .* 12\/100$/);
    });
    it("sin categoría o con la escala en cero quedan vacías, no «0» ni «CERO 00/100»", () => {
        for (const falta of [undefined, null, 0, "", "abc"]) {
            assert.deepEqual(brutoDeEscalaEnDocumento(falta), { sueldoBrutoCatSatNumero: "", sueldoBrutoCatSatLetras: "" });
        }
    });
});
describe("catálogo del editor ↔ previsualización", () => {
    it("las tres variables nuevas están en el catálogo", () => {
        const c = catalogo();
        for (const v of ["catSatNombre", "sueldoBrutoCatSatNumero", "sueldoBrutoCatSatLetras"])
            assert.ok(c.includes(v), `falta {{${v}}} en el modal`);
    });
    it("toda variable del catálogo tiene valor de ejemplo: la previsualización no deja ninguna {{…}}", () => {
        const html = catalogo().map((v) => `<p>{{${v}}}</p>`).join("");
        const sinResolver = replaceDocVariables(html, getDummyDocVariables()).match(/\{\{\w+\}\}/g) || [];
        assert.deepEqual(sinResolver, []);
    });
    it("{{catSatNombre}} resuelve lo mismo que {{categoriaSat}}", () => {
        const d = getDummyDocVariables();
        assert.equal(d.catSatNombre, d.categoriaSat);
    });
    it("la frase de la plantilla Plazo fijo 6x6", () => {
        const d = getDummyDocVariables();
        const r = replaceDocVariables("es de Pesos {{sueldoBrutoCatSatLetras}} ({{sueldoBrutoCatSatNumero}}).", d);
        assert.equal(r, `es de Pesos ${d.sueldoBrutoCatSatLetras} (${d.sueldoBrutoCatSatNumero}).`);
        assert.doesNotMatch(r, /\{|\}/);
    });
});
