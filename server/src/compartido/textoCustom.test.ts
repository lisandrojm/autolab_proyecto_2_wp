import { test } from "node:test";
import assert from "node:assert/strict";
import { PLACEHOLDER_CONTRATO_CUSTOM, PLACEHOLDER_RELEASE_CUSTOM, textoCustomDeRelease, textoCustomUsable } from "./textoCustom.js";

test("vacío, sólo etiquetas o espacios no sirve", () => {
  assert.equal(textoCustomUsable(null), false);
  assert.equal(textoCustomUsable(""), false);
  assert.equal(textoCustomUsable("<p></p>"), false);
  assert.equal(textoCustomUsable("<p>&nbsp; </p>"), false);
});

test("el placeholder (de contrato o de release) no sirve, aunque cambie el formato", () => {
  assert.equal(textoCustomUsable(PLACEHOLDER_CONTRATO_CUSTOM), false);
  assert.equal(textoCustomUsable(PLACEHOLDER_RELEASE_CUSTOM), false);
  assert.equal(textoCustomUsable("<p><strong>Contrato custom</strong></p>"), false);
  assert.equal(textoCustomUsable("Release   custom"), false);
});

test("texto real, con o sin variables, sirve", () => {
  assert.equal(textoCustomUsable("<p>Contrato custom con {{nombre}}</p>"), true);
  assert.equal(textoCustomUsable("<p>Cláusula primera</p>"), true);
});

test("texto de un release: por releaseId, como string", () => {
  const contenidos = [{ releaseId: "a1", content: "<p>uno</p>" }, { releaseId: "b2", content: "<p>dos</p>" }];
  assert.equal(textoCustomDeRelease(contenidos, "b2"), "<p>dos</p>");
  assert.equal(textoCustomDeRelease(contenidos, "zz"), null);
  assert.equal(textoCustomDeRelease(undefined, "a1"), null);
});
