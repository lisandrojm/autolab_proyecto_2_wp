import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decidirReparacion, esDocumentoDelContrato, motivoParaNoAvanzar, tieneDocumentosGenerados } from "./circuitoContrato.js";

// Los órdenes de producción: 2 impositivo, 3 Envío de documentación (Generar Documentos), 4 Firma pendiente, 5 Firma enviada, 6 Disponible.
const GENERAR = 3;

describe("qué documento mueve el contrato por Outbox / Pendbox / Firmados", () => {
  it("su contrato y su release, sí", () => {
    assert.equal(esDocumentoDelContrato({ tipo: "Contrato" }, "x"), true);
    assert.equal(esDocumentoDelContrato({ tipo: "Release" }, "x"), true);
  });
  it("(regresión, grupo B) la constancia de ARCA no: su aviso de firma pasaba el contrato a «Firma enviada»", () => {
    assert.equal(esDocumentoDelContrato({ tipo: "AltaAFIP" }, "426_LN+_FAMULARO_AltaArca_Jornada_D-20261107_H-20261107_20308952127_x_Empresa-30717068374_ID-000980.pdf"), false);
    assert.equal(esDocumentoDelContrato({ tipo: "ConstanciaCUIT" }, "x"), false);
  });
  it("(regresión, grupo A) el recibo de sueldo registrado como «Contrato» entre el 20 y el 24/10 no", () => {
    assert.equal(esDocumentoDelContrato({ tipo: "Contrato", clase: "recibo_sueldo" }, "426_LN+_REC_SUELDO_2026_PERIODO_10_X_ID-000590.pdf"), false);
  });
  it("sin registro (archivos de antes de los códigos), por el nombre", () => {
    assert.equal(esDocumentoDelContrato(null, "426_LN+_PARRINELLO_AltaAFIP_Jornada_D-20261025_H-20261025_23148850984_x.pdf"), false);
    assert.equal(esDocumentoDelContrato(null, "426_LN+_REC_SUELDO_2026_PERIODO_10_TIERO.pdf"), false);
    assert.equal(esDocumentoDelContrato(null, "703_TELECOM_Contrato_PEREZ_JUAN-x-ARROBA-gmail.com_20111111112_D-20261101_H-20261130.pdf"), true);
  });
});

describe("el circuito se recorre en orden", () => {
  it("desde el trámite impositivo no se salta a Firma pendiente, Firma enviada ni Disponible", () => {
    for (const destino of [4, 5, 6]) assert.equal(motivoParaNoAvanzar({ ordenActual: 2, ordenDestino: destino, ordenGenerar: GENERAR, documentosGenerados: true }), "saltea_generar_documentos");
    assert.equal(motivoParaNoAvanzar({ ordenActual: 0, ordenDestino: 5, ordenGenerar: GENERAR, documentosGenerados: false }), "saltea_generar_documentos");
  });
  it("al terminar el trámite se llega a Generar Documentos, sin condiciones", () => {
    assert.equal(motivoParaNoAvanzar({ ordenActual: 2, ordenDestino: GENERAR, ordenGenerar: GENERAR, documentosGenerados: false }), null);
  });
  it("de Generar Documentos se sale sólo con el contrato o el release generados", () => {
    assert.equal(motivoParaNoAvanzar({ ordenActual: GENERAR, ordenDestino: 5, ordenGenerar: GENERAR, documentosGenerados: false }), "sin_documentos_generados");
    assert.equal(motivoParaNoAvanzar({ ordenActual: GENERAR, ordenDestino: 4, ordenGenerar: GENERAR, documentosGenerados: true }), null);
  });
  it("lo que ya está más adelante sigue solo (Firma pendiente → enviada → Disponible)", () => {
    assert.equal(motivoParaNoAvanzar({ ordenActual: 4, ordenDestino: 5, ordenGenerar: GENERAR, documentosGenerados: false }), null);
    assert.equal(motivoParaNoAvanzar({ ordenActual: 5, ordenDestino: 6, ordenGenerar: GENERAR, documentosGenerados: false }), null);
  });
  it("sin el estado de Generar Documentos configurado no se frena nada", () => {
    assert.equal(motivoParaNoAvanzar({ ordenActual: 0, ordenDestino: 6, ordenGenerar: null, documentosGenerados: false }), null);
  });
  it("documentos generados: el contrato, el release, o releases sueltos", () => {
    assert.equal(tieneDocumentosGenerados({}), false);
    assert.equal(tieneDocumentosGenerados({ firmaGeneradoAt: new Date() }), true);
    assert.equal(tieneDocumentosGenerados({ firmaReleases: [{ nombre: "x" }] }), true);
  });
});

describe("qué contratos vuelven a Generar Documentos", () => {
  it("grupo B (Famularo): sólo la constancia de ARCA, firmada → vuelve", () => {
    const r = decidirReparacion({ documentos: [{ codigo: "ID-000980", tipo: "AltaAFIP", archivo: "426_LN+_FAMULARO_AltaArca_Jornada_x_ID-000980", enDropbox: true }], sinCodigo: [] });
    assert.deepEqual(r, { volver: true, motivo: "nunca se le generó el contrato ni el release; sólo tuvo AltaAFIP ID-000980" });
  });
  it("grupo A (Tiero): el «contrato» del 24/10 con nombre de recibo, borrado del Outbox → vuelve", () => {
    const r = decidirReparacion({ documentos: [{ codigo: "ID-000700", tipo: "Contrato", archivo: "426_LN+_REC_SUELDO_2026_PERIODO_10_TIERO_ID-000700", enDropbox: false }, { codigo: "ID-001122", tipo: "AltaAFIP", archivo: "426_LN+_TIERO_AltaArca_x_ID-001122", enDropbox: true }], sinCodigo: [] });
    assert.equal(r.volver, true);
  });
  it("grupo A del 21/10: un recibo de sueldo de verdad (clase recibo) no cuenta como contrato → vuelve", () => {
    const r = decidirReparacion({ documentos: [{ codigo: "ID-000590", tipo: "Contrato", clase: "recibo_sueldo", archivo: "426_LN+_REC_SUELDO_2026_PERIODO_10_X_ID-000590", enDropbox: true }], sinCodigo: [] });
    assert.deepEqual(r, { volver: true, motivo: "nunca se le generó el contrato ni el release; sólo tuvo recibo ID-000590" });
  });
  it("con su contrato o su release en Dropbox, no se toca (Aquino)", () => {
    const r = decidirReparacion({ documentos: [{ codigo: "ID-000751", tipo: "Contrato", archivo: "426_LN+_Contrato_AQUINO_x_ID-000751", enDropbox: true }, { codigo: "ID-000754", tipo: "Release", archivo: "x_ID-000754", enDropbox: true }], sinCodigo: [] });
    assert.equal(r.volver, false);
  });
  it("un contrato de antes de los códigos que está en Dropbox, no se toca", () => {
    assert.equal(decidirReparacion({ documentos: [], sinCodigo: ["426_LN+_Contrato_PEREZ_JUAN_20111111112_D-20261001_H-20261031.pdf"] }).volver, false);
    // La constancia de alta de antes de los códigos no es un contrato.
    assert.equal(decidirReparacion({ documentos: [], sinCodigo: ["426_LN+_PEREZ_AltaAFIP_Jornada_D-20261001_H-20261001_20111111112.pdf"] }).volver, true);
  });
});
