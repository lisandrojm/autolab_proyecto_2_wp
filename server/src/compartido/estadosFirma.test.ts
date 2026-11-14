/**
 *   npx tsx --test src/compartido/estadosFirma.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estadoPermitidoParaTipo, esEstadoDeFirma, pareceEstadoDeFirma, quedaContratadoAlCrearse, tipoEnviaAFirmar } from "./estadosFirma.js";

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

describe("un contrato nuevo queda contratado al crearse sólo si no tiene nada que hacer en el circuito", () => {
  const NADA_A_FIRMAR = { requiereFirma: false, requiereFirmaRelease: false, requiereFirmaAlta: false };
  it("Servicios (constancia de CUIT) que no manda nada a firmar → NO: tiene que validarse el CUIT antes de llegar a Contratos", () => {
    assert.equal(quedaContratadoAlCrearse(NADA_A_FIRMAR, "constancia_cuit"), false);
  });
  it("con alta temprana de ARCA → no (lleva el alta), firme o no la constancia", () => {
    assert.equal(quedaContratadoAlCrearse(NADA_A_FIRMAR, "alta_temprana_afip"), false);
  });
  it("sin trámite impositivo y sin nada a firmar → sí, como desde el 28/10", () => {
    assert.equal(quedaContratadoAlCrearse(NADA_A_FIRMAR, undefined), true);
    assert.equal(quedaContratadoAlCrearse(NADA_A_FIRMAR, ""), true);
    // La firma del alta no cuenta si el contrato no lleva alta.
    assert.equal(quedaContratadoAlCrearse({ requiereFirma: false, requiereFirmaRelease: false }, null), true);
  });
  it("manda a firmar el contrato o el release → no; sin tipo → no (sigue el circuito)", () => {
    assert.equal(quedaContratadoAlCrearse({ ...NADA_A_FIRMAR, requiereFirma: true }, undefined), false);
    assert.equal(quedaContratadoAlCrearse({ ...NADA_A_FIRMAR, requiereFirmaRelease: true }, undefined), false);
    assert.equal(quedaContratadoAlCrearse(null, undefined), false);
  });
});
