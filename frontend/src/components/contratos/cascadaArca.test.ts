import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverCascada, defaultDe, conCascada } from "./cascadaArca.js";

/*
  La cascada decide qué sale en el TXT de ARCA, así que lo que se prueba es el ORDEN y, sobre todo,
  que un escalón vacío NO tape al siguiente — que es el error que dejaría al default global sin
  servir nunca.
*/

test("gana el primer escalón con contenido", () => {
  const r = resolverCascada([
    { valor: "007", origen: "contrato" },
    { valor: "999", origen: "empresa" },
  ]);
  assert.equal(r.valor, "007");
  assert.equal(r.origen, "contrato");
});

test("un escalón vacío pasa al siguiente, no lo tapa", () => {
  for (const vacio of ["", "   ", null, undefined]) {
    const r = resolverCascada([
      { valor: vacio, origen: "contrato" },
      { valor: "5", origen: "global" },
    ]);
    assert.equal(r.valor, "5", `"${String(vacio)}" no debería ganar`);
    assert.equal(r.origen, "global");
  }
});

test("sin ningún escalón cargado, el origen es `ninguno` y no `global`", () => {
  const r = resolverCascada([
    { valor: "", origen: "empresa" },
    { valor: "", origen: "global" },
  ]);
  assert.equal(r.valor, "");
  assert.equal(r.origen, "ninguno");
});

test("el valor se devuelve sin espacios de más", () => {
  assert.equal(resolverCascada([{ valor: "  12  ", origen: "empresa" }]).valor, "12");
});

test("defaultDe: la empresa le gana a la instalación", () => {
  const r = defaultDe("modalidadLiquidacion", { modalidadLiquidacion: "2" }, { modalidadLiquidacion: "1" });
  assert.equal(r.valor, "2");
  assert.equal(r.origen, "empresa");
});

test("defaultDe: sin dato en la empresa, hereda el de la instalación", () => {
  const r = defaultDe("modalidadLiquidacion", { modalidadLiquidacion: "" }, { modalidadLiquidacion: "1" });
  assert.equal(r.valor, "1");
  assert.equal(r.origen, "global");
});

test("defaultDe: una empresa sin defaults cargados no rompe", () => {
  assert.equal(defaultDe("tipoServicio", undefined, { tipoServicio: "008" }).valor, "008");
  assert.equal(defaultDe("tipoServicio", null, null).origen, "ninguno");
});

test("conCascada: el tipo de contrato le gana a los dos defaults", () => {
  const r = conCascada("100", "tipo_contrato", "modalidadContratacion", { modalidadContratacion: "200" }, { modalidadContratacion: "300" });
  assert.equal(r.valor, "100");
  assert.equal(r.origen, "tipo_contrato");
});

test("conCascada: sin tipo de contrato, cae a la empresa y después a la instalación", () => {
  assert.equal(conCascada("", "tipo_contrato", "modalidadContratacion", { modalidadContratacion: "200" }, { modalidadContratacion: "300" }).origen, "empresa");
  assert.equal(conCascada("", "tipo_contrato", "modalidadContratacion", {}, { modalidadContratacion: "300" }).origen, "global");
});

test("sucursalId y convenioId son referencias y cascadean igual", () => {
  const r = defaultDe("sucursalId", { sucursalId: null }, { sucursalId: "abc123" });
  assert.equal(r.valor, "abc123");
  assert.equal(r.origen, "global");
});
