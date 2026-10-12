import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tieneValoracion, valoracionesDeCategoria } from "./valoracionesDeCategoria.js";

describe("las valoraciones de una categoría en una función", () => {
  it("sin nada es «sin valorar»", () => {
    assert.deepEqual(valoracionesDeCategoria(undefined), []);
    assert.deepEqual(valoracionesDeCategoria({}), []);
    assert.deepEqual(valoracionesDeCategoria({ valoracionId: null, valoracionIds: [] }), []);
  });
  it("el campo viejo, de un solo valor, se lee como lista de uno", () => {
    assert.deepEqual(valoracionesDeCategoria({ valoracionId: "ORO" }), ["ORO"]);
  });
  it("la lista manda sobre el campo viejo, sin repetidos ni vacíos", () => {
    assert.deepEqual(valoracionesDeCategoria({ valoracionId: "ORO", valoracionIds: ["PLATA", "ORO", "", "PLATA"] }), ["PLATA", "ORO"]);
  });
  it("acepta ObjectIds (cualquier cosa con toString)", () => {
    const id = { toString: () => "abc" };
    assert.deepEqual(valoracionesDeCategoria({ valoracionIds: [id] }), ["abc"]);
  });
  it("tieneValoracion: cualquiera de las suyas", () => {
    assert.equal(tieneValoracion({ valoracionIds: ["ORO", "PLATA"] }, "PLATA"), true);
    assert.equal(tieneValoracion({ valoracionIds: ["ORO"] }, "PLATA"), false);
    assert.equal(tieneValoracion({ valoracionIds: ["ORO"] }, ""), false);
  });
});
