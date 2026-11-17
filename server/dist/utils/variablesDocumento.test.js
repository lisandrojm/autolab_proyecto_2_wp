/**
 * Variables de las plantillas de contrato: que el catálogo del editor y lo que resuelve el server
 * no se desincronicen.
 *
 *   npm run test:variables-documento
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { brutoDeEscalaEnDocumento, escalaDelContratoEnDocumento, importesNetosDelContrato, textoDeDiasSemana } from "./employeeDocData.js";
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
describe("importes netos y días del contrato (variables del 09/10/2026)", () => {
    it("los mismos números que la solicitud: neto por jornada, semana, mes del tipo y total por las jornadas del contrato", () => {
        // Asistente de cámara (G7): escala bruta 1.239.806,04 y neta 1.004.242,89; tipo Servicios de 22 jornadas por mes; 16 jornadas.
        const bruto = 1239806.04;
        const neto = 1004242.89;
        const jornadaBruta = bruto / 22;
        const r = importesNetosDelContrato({ jornadaBruto: jornadaBruta, escalaNeto: neto, escalaBruto: bruto, diasPorSemana: 5, jornadasPorMes: 22, jornadas: 16 });
        // Al centavo: el bruto de la escala del ejemplo está redondeado.
        const cerca = (a, b) => assert.ok(Math.abs(a - b) <= 0.02, `${a} ≠ ${b}`);
        cerca(r.jornada, 45647.4);
        cerca(r.semana, 228237.02);
        cerca(r.mensual, 1004242.89);
        cerca(r.total, 730358.46);
    });
    it("sin escala el importe por jornada ya es el neto, y sin jornadas no hay total", () => {
        const r = importesNetosDelContrato({ jornadaBruto: 1000, diasPorSemana: 0, jornadasPorMes: null, jornadas: 0 });
        assert.deepEqual(r, { jornada: 1000, semana: 0, mensual: 30000, total: 0, jornadaBruto: 1000, semanaBruto: 0, mensualBruto: 30000 });
    });
    it("los brutos de la solicitud: jornada, × días por semana y × jornadas por mes del tipo", () => {
        const r = importesNetosDelContrato({ jornadaBruto: 107392.04, escalaNeto: 81, escalaBruto: 100, diasPorSemana: 5, jornadasPorMes: 22, jornadas: 7 });
        assert.equal(r.jornadaBruto, 107392.04);
        assert.equal(r.semanaBruto, 536960.2);
        assert.equal(r.mensualBruto, 2362624.88);
    });
    it("los días como los muestra la app", () => {
        assert.equal(textoDeDiasSemana([1, 2, 3, 4, 5]), "Lu a Vi");
        assert.equal(textoDeDiasSemana([0, 1, 2, 3, 4, 5, 6]), "Lun a Dom");
        assert.equal(textoDeDiasSemana([1, 3, 5]), "Lu, Mi, Vi");
        assert.equal(textoDeDiasSemana([]), "");
    });
});
describe("los campos de la solicitud (17/11/2026)", () => {
    it("el catálogo ofrece los campos del formulario, con el neto por jornada en letras", () => {
        const c = catalogo();
        for (const v of ["sueldoBasico", "adicional", "porcentajeAdicional", "presentismo", "importeJornadaNeto", "importeJornadaNetoLetras", "importeJornadaBruto", "importeSemanaNeto", "importeSemanaBruto", "importeMensualNeto", "importeMensualBruto", "importeTotalNeto", "importeTotalNetoLetras"])
            assert.ok(c.includes(v), `falta {{${v}}} en el modal`);
    });
    it("las anteriores siguen en el catálogo: hay plantillas que las usan", () => {
        const c = catalogo();
        for (const v of ["sueldoJornada", "sueldoJornadaLetras", "sueldoMano", "sueldoBruto"])
            assert.ok(c.includes(v), `falta {{${v}}}`);
    });
    it("con el importe de la escala, básico, adicional y presentismo son los de la escala", () => {
        // 634/11: básico 1.000.000, 35 % de adicional, presentismo 10 % de básico + adicional; 30 jornadas.
        const mensual = 1000000 + 350000 + 135000;
        const e = escalaDelContratoEnDocumento({ jornadaBruto: mensual / 30, basico: 1000000, adicional: 350000, presentismo: 135000, jornadasPorMes: 30 });
        assert.equal(e.sueldoBasico, (1000000).toLocaleString("es-AR"));
        assert.equal(e.adicional, (350000).toLocaleString("es-AR"));
        assert.equal(e.presentismo, (135000).toLocaleString("es-AR"));
        assert.equal(e.porcentajeAdicional, "35 %");
    });
    it("pactado un 10 % arriba de la escala: cada columna sube un 10 %, el % adicional no", () => {
        const e = escalaDelContratoEnDocumento({ jornadaBruto: (1485000 / 22) * 1.1, basico: 1000000, adicional: 350000, presentismo: 135000, jornadasPorMes: 22 });
        assert.equal(e.sueldoBasico, (1100000).toLocaleString("es-AR"));
        assert.equal(e.porcentajeAdicional, "35 %");
    });
    it("sin categoría, vacías", () => {
        assert.deepEqual(escalaDelContratoEnDocumento({ jornadaBruto: 1000 }), { sueldoBasico: "", adicional: "", porcentajeAdicional: "", presentismo: "" });
    });
});
