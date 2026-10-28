/**
 *   npx tsx --test src/utils/conciliacionOutbox.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { codigosDe, describirConciliacion, planConciliacionOutbox, yaEnviadoPorCarpeta } from "./conciliacionOutbox.js";

// Recibos del PERIODO_09 (forma de los nombres reales). BENITEZ tiene dos documentos.
const rec = (apellido: string, codigo: string) => `REC_SUELDO_PERIODO_09_${apellido}_20301234567_${apellido.toLowerCase()}-ARROBA-gmail.com_${codigo}.pdf`;
const o = (name: string) => ({ name, path: `/HelloSign/Outbox/${name}` });
const p = (name: string) => ({ name, path: `/HelloSign/Pendbox/${name}` });
const f = (name: string) => ({ name, path: `/HelloSign/Requested signatures/${name}` });

const OUTBOX = [o(rec("PELLEGRINI", "ID-000429")), o(rec("LABONIA", "ID-000431")), o(rec("BENITEZ", "ID-000448")), o(rec("BENITEZ", "ID-000510")), o(rec("NUEVO", "ID-000600")), o("REC_SUELDO_PERIODO_09_SINCODIGO_20301234567.pdf"), o("datos.json")];
// El firmado vuelve con la cola de Dropbox Sign detrás del «.pdf».
const FIRMADOS = [f(`${rec("PELLEGRINI", "ID-000429")}_ Firma solicitada por Thu, 08 Oct 2026 14h56m54s.pdf`)];
const PENDBOX = [p(rec("LABONIA", "ID-000431")), p(rec("BENITEZ", "ID-000510")), p(rec("PELLEGRINI", "ID-000429"))];

describe("conciliación Outbox ↔ Pendbox/Firmados", () => {
  const plan = planConciliacionOutbox(OUTBOX, PENDBOX, FIRMADOS);
  const estado = (codigo: string) => plan.mover.find((m) => m.codigo === codigo)?.estado;

  it("lo que está en Firmados es firmado, aunque el original siga en Pendbox", () => {
    assert.equal(estado("ID-000429"), "firmado");
  });
  it("lo que está en Pendbox espera firma", () => {
    assert.equal(estado("ID-000431"), "esperando_firma");
  });
  it("matchea por código: los dos documentos de la misma persona se resuelven por separado", () => {
    assert.equal(estado("ID-000510"), "esperando_firma");
    assert.equal(estado("ID-000448"), undefined);
    assert.ok(plan.quedan.some((q) => q.archivo.name.includes("ID-000448") && q.motivo === "sin_rastro"));
  });
  it("sin rastro o sin código, se queda; los .json no cuentan", () => {
    assert.ok(plan.quedan.some((q) => q.archivo.name.includes("ID-000600") && q.motivo === "sin_rastro"));
    assert.ok(plan.quedan.some((q) => q.motivo === "sin_codigo"));
    assert.equal(plan.mover.length + plan.quedan.length, 6);
    assert.equal(plan.mover.length, 3);
  });
  it("un prefijo de código no es el mismo código", () => {
    const r = planConciliacionOutbox([o(rec("X", "ID-0004290"))], [p(rec("X", "ID-000429"))], []);
    assert.equal(r.mover.length, 0);
  });
  it("el resumen en seco dice cuántos y no promete mover lo que no", () => {
    const texto = describirConciliacion(plan, true).join("\n");
    assert.match(texto, /EN SECO/);
    assert.match(texto, /3 ya enviados \(1 firmados · 2 esperando firma\)  → se moverían/);
    assert.match(texto, /2 sin rastro/);
    assert.match(texto, /ID-000429 {2}firmado/);
  });
});

describe("la red de la corrida de envío", () => {
  const carpetas = { pendbox: codigosDe(PENDBOX), firmados: codigosDe(FIRMADOS) };
  it("saltea lo que ya está en una de las dos carpetas", () => {
    assert.equal(yaEnviadoPorCarpeta("ID-000429", carpetas), "firmado");
    assert.equal(yaEnviadoPorCarpeta("ID-000431", carpetas), "esperando_firma");
    assert.equal(yaEnviadoPorCarpeta("ID-000448", carpetas), null);
    assert.equal(yaEnviadoPorCarpeta("", carpetas), null);
  });
});
