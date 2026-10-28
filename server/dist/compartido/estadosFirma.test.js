/**
 *   npx tsx --test src/compartido/estadosFirma.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estadoPermitidoParaTipo, esEstadoDeFirma, pareceEstadoDeFirma, tipoEnviaAFirmar } from "./estadosFirma.js";
const SIN_FIRMA = { requiereFirma: false, requiereFirmaRelease: false, requiereFirmaAlta: false };
const FIRMA = { data: { vinculadoAFirma: true } };
const DISPONIBLE = { data: {} };
describe("¿el tipo manda algo a firmar?", () => {
    it("cualquiera de los tres checks alcanza; ausente = sí, como en el modelo", () => {
        assert.equal(tipoEnviaAFirmar({}), true);
        assert.equal(tipoEnviaAFirmar({ ...SIN_FIRMA, requiereFirma: true }), true);
        assert.equal(tipoEnviaAFirmar({ ...SIN_FIRMA, requiereFirmaRelease: true }), true);
        assert.equal(tipoEnviaAFirmar({ ...SIN_FIRMA, requiereFirmaAlta: true }), true);
        assert.equal(tipoEnviaAFirmar(SIN_FIRMA), false);
    });
    it("la firma del alta no cuenta si el tipo no genera alta (el check ni se muestra)", () => {
        assert.equal(tipoEnviaAFirmar({ ...SIN_FIRMA, requiereFirmaAlta: true, generaAlta: false }), false);
        assert.equal(tipoEnviaAFirmar({ requiereFirma: false, requiereFirmaRelease: false, generaAlta: false }), false);
    });
});
describe("estados de firma", () => {
    it("sólo se asignan a tipos que mandan algo a firmar", () => {
        assert.equal(estadoPermitidoParaTipo(FIRMA, SIN_FIRMA), false);
        assert.equal(estadoPermitidoParaTipo(FIRMA, { ...SIN_FIRMA, requiereFirma: true }), true);
        assert.equal(estadoPermitidoParaTipo(DISPONIBLE, SIN_FIRMA), true);
    });
    it("un impositivo nunca es de firma", () => {
        assert.equal(esEstadoDeFirma({ data: { vinculadoAFirma: true, esImpositivo: true } }), false);
    });
    it("la semilla los reconoce por nombre o por la carpeta de Dropbox Sign", () => {
        assert.equal(pareceEstadoDeFirma("ENVIO DE DOCUMENTACION"), true);
        assert.equal(pareceEstadoDeFirma("Envío de documentación"), true);
        assert.equal(pareceEstadoDeFirma("FIRMA ENVIADA"), true);
        assert.equal(pareceEstadoDeFirma("Firmado", [{ proposito: "firmados" }]), true);
        assert.equal(pareceEstadoDeFirma("DISPONIBLE", [{ proposito: "outbox" }]), false);
    });
});
