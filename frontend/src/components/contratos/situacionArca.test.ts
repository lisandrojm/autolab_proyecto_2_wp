/**
 * Tests de la columna «ARCA» del padrón de Contratados: qué está dado de alta y qué no.
 *
 * Run with:
 *   npx tsx --test src/components/contratos/situacionArca.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { situacionArca, type FilaConArca } from "./situacionArca";

const fila = (x: Partial<FilaConArca>): FilaConArca => x as FilaConArca;
const AFIP = "alta_temprana_afip";

describe("situacionArca: contratos de ARCA (alta temprana)", () => {
  it("con la fila del ciclo de la constancia, tiene alta (la fila nace al presentarse)", () => {
    const s = situacionArca(fila({ constanciaArca: { presentadaEl: "2026-10-24T13:00:00.000Z" } as any }), AFIP);
    assert.equal(s.grupo, "con_alta");
    assert.equal(s.fecha, "2026-10-24T13:00:00.000Z");
  });
  it("presentada por la corrida o adoptada al sincronizar, tiene alta", () => {
    assert.equal(situacionArca(fila({ altaArcaPresentada: { via: "altas_masivas", fecha: "2026-11-01", resultado: "presentada" } }), AFIP).grupo, "con_alta");
    assert.match(situacionArca(fila({ altaArcaPresentada: { via: "externa", fecha: "2026-11-01", resultado: "presentada" } }), AFIP).titulo, /a mano/);
  });
  it("con la constancia subida a mano y sin marca de la corrida, también tiene alta", () => {
    assert.equal(situacionArca(fila({ altaDocumentoUrl: "/uploads/x.pdf" }), AFIP).grupo, "con_alta");
  });
  it("una presentación sin resultado leído queda «sin confirmar», no como alta", () => {
    assert.equal(situacionArca(fila({ altaArcaPresentada: { via: "carga_masiva", fecha: "2026-11-01", resultado: "indeterminado" } }), AFIP).grupo, "sin_confirmar");
    assert.equal(situacionArca(fila({ altaArcaPresentada: { via: "carga_masiva", fecha: "2026-11-01", resultado: "presentando" } }), AFIP).grupo, "sin_confirmar");
  });
  it("rechazada o sin nada, no tiene alta", () => {
    const r = situacionArca(fila({ altaArcaPresentada: { via: "carga_masiva", fecha: "2026-11-01", resultado: "fallida", motivo: "CUIL inválido" } }), AFIP);
    assert.deepEqual([r.grupo, r.texto, r.titulo], ["sin_alta", "Rechazada por ARCA", "CUIL inválido"]);
    assert.equal(situacionArca(fila({}), AFIP).texto, "Sin alta en ARCA");
  });
});

describe("situacionArca: Servicios, Sin CUIT y solicitudes", () => {
  it("Servicios no lleva alta: dice cómo está el CUIT", () => {
    assert.deepEqual([situacionArca(fila({ constanciaAfipDropboxSubidaAt: "2026-11-02" }), "constancia_cuit").grupo, situacionArca(fila({ constanciaAfipDropboxSubidaAt: "2026-11-02" }), "constancia_cuit").texto], ["servicios", "CUIT validado"]);
    assert.equal(situacionArca(fila({ constanciaAfipEstado: "inactivo" }), "constancia_cuit").texto, "CUIT inactivo");
    assert.equal(situacionArca(fila({}), "constancia_cuit").texto, "CUIT sin validar");
  });
  it("sin CUIT no va por ARCA, aunque el tipo sea de alta temprana", () => {
    assert.equal(situacionArca(fila({ sinCuit: true }), AFIP).grupo, "no_corresponde");
  });
  it("una solicitud sin aprobar no cuenta ni como alta ni como falta", () => {
    const s = situacionArca(fila({}), AFIP, { pendiente: true });
    assert.deepEqual([s.grupo, s.texto, s.detalle], ["no_corresponde", "Es solicitud", "Alta en ARCA: no dada aún"]);
    assert.equal(situacionArca(fila({}), "constancia_cuit", { pendiente: true }).detalle, "CUIT: sin validar aún");
  });
  it("un tipo sin trámite impositivo no aparece", () => {
    assert.equal(situacionArca(fila({}), undefined).grupo, "no_corresponde");
  });
});
