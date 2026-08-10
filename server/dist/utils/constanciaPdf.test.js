/**
 * Tests de la lectura de la constancia de CUIT de ARCA.
 *
 * Run with:
 *   npx tsx --test src/utils/constanciaPdf.test.ts
 *   – o –
 *   npm run test:constancia
 *
 * Usa el runner de Node (node:test + node:assert).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseConstanciaTexto, normalizarCuit, cuitEsValido } from "./constanciaPdf.js";
// Texto tal como sale de la extracción del PDF real (constancia de opción de un monotributista).
const TEXTO_REAL = `2/8/26, 23:15 Formulario de Impresión de Constancia de Monotributo
ARCA
CONSTANCIA DE OPCIÓN
Régimen Simplificado para Pequeños Contribuyentes
CUIT: 23-27602575-9
MARTINEZ LISANDRO JAVIER
HELGUERA 1393 Piso:1 Dpto:4
1416-CIUDAD AUTONOMA BUENOS AIRES
020 - MONOTRIBUTO
CATEGORÍA
D
FECHA DE INICIO: 01-06-2021
Vigencia de la presente constancia: 02-08-2026 a 01-09-2026 Hora 23:15:32 Verificador 204297607130
Los datos contenidos en la presente constancia deberán ser validados por el receptor`;
describe("normalizarCuit", () => {
    it("deja solo los dígitos de un CUIT con guiones", () => {
        assert.equal(normalizarCuit("23-27602575-9"), "23276025759");
    });
    it("devuelve vacío si no llega a 11 dígitos", () => {
        assert.equal(normalizarCuit("123"), "");
        assert.equal(normalizarCuit(null), "");
        assert.equal(normalizarCuit(undefined), "");
    });
});
describe("parseConstanciaTexto", () => {
    it("lee CUIT, vigencia y verificador de una constancia real", () => {
        const r = parseConstanciaTexto(TEXTO_REAL);
        assert.equal(r.cuit, "23276025759");
        assert.equal(r.vigenciaDesde, "2026-08-02");
        assert.equal(r.vigenciaHasta, "2026-09-01");
        assert.equal(r.verificador, "204297607130");
    });
    it("tolera saltos de línea y espacios de más en el medio de los datos", () => {
        const r = parseConstanciaTexto("CUIT:\n30-71234567-4\nVigencia de la presente constancia:  15-01-2026\na 14-02-2026\nHora 09:00:00\nVerificador\n123456789012");
        assert.equal(r.cuit, "30712345674");
        assert.equal(r.vigenciaDesde, "2026-01-15");
        assert.equal(r.vigenciaHasta, "2026-02-14");
        assert.equal(r.verificador, "123456789012");
    });
    it("lee el CUIT aunque venga sin guiones", () => {
        assert.equal(parseConstanciaTexto("CUIT 23276025759").cuit, "23276025759");
    });
    it("no inventa datos cuando el PDF no es una constancia", () => {
        const r = parseConstanciaTexto("Este es otro documento cualquiera.");
        assert.equal(r.cuit, "");
        assert.equal(r.vigenciaDesde, undefined);
        assert.equal(r.vigenciaHasta, undefined);
        assert.equal(r.verificador, undefined);
    });
    it("devuelve el CUIT aunque falte el pie con la vigencia", () => {
        const r = parseConstanciaTexto("CONSTANCIA DE INSCRIPCIÓN\nCUIT: 20-12345678-3\nAPELLIDO NOMBRE");
        assert.equal(r.cuit, "20123456783");
        assert.equal(r.vigenciaHasta, undefined);
    });
});
describe("cuitEsValido", () => {
    // CUITs reales, tomados de consultas que AFIP resolvió OK en producción.
    it("acepta CUIT/CUIL reales", () => {
        assert.equal(cuitEsValido("23-27602575-9"), true);
        assert.equal(cuitEsValido("27323863240"), true);
        assert.equal(cuitEsValido("20-96265597-2"), true);
    });
    it("rechaza el relleno 00000000000 y otros repetidos", () => {
        assert.equal(cuitEsValido("00000000000"), false);
        assert.equal(cuitEsValido("11111111111"), false);
        assert.equal(cuitEsValido("99999999999"), false);
    });
    it("rechaza prefijos que AFIP no usa", () => {
        assert.equal(cuitEsValido("12345678901"), false);
    });
    it("rechaza un dígito verificador que no cierra", () => {
        // Mismo CUIT válido de arriba con el último dígito cambiado.
        assert.equal(cuitEsValido("23-27602575-8"), false);
    });
    it("rechaza vacío o incompleto", () => {
        assert.equal(cuitEsValido(""), false);
        assert.equal(cuitEsValido(null), false);
        assert.equal(cuitEsValido("2327602575"), false);
    });
});
