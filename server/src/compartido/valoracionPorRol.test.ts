import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { valoracionParaRol, valoracionParaRoles, normalizarValoracionesPorRol, excepcionDelRol } from "./valoracionPorRol.js";

describe("valoración por rol empresa + tipo de contrato", () => {
  const proyecto = {
    valoracionId: "plata",
    valoracionesPorRol: [
      { rolFrameId: 12, contratoId: "jornada", valoracionId: "oro" },
      { rolFrameId: 12, contratoId: "plazoFijo", valoracionId: "bronce" },
      { rolFrameId: 20, valoracionId: "oro" }, // sin tipo: cualquier tipo
    ],
  };

  it("el rol con ese tipo usa su excepción; con otro tipo, la del proyecto", () => {
    assert.equal(valoracionParaRol(proyecto, 12, "jornada"), "oro");
    assert.equal(valoracionParaRol(proyecto, "12", "plazoFijo"), "bronce");
    assert.equal(valoracionParaRol(proyecto, 12, "indeterminado"), "plata");
    assert.equal(valoracionParaRol(proyecto, 12), "plata");
    assert.equal(valoracionParaRol(proyecto, 7, "jornada"), "plata");
  });

  it("una excepción sin tipo vale para cualquier tipo, y la del tipo exacto le gana", () => {
    assert.equal(valoracionParaRol(proyecto, 20, "jornada"), "oro");
    assert.equal(valoracionParaRol(proyecto, 20), "oro");
    const conAmbas = { valoracionId: "plata", valoracionesPorRol: [{ rolFrameId: 5, valoracionId: "oro" }, { rolFrameId: 5, contratoId: "j", valoracionId: "bronce" }] };
    assert.equal(valoracionParaRol(conAmbas, 5, "j"), "bronce");
    assert.equal(valoracionParaRol(conAmbas, 5, "otro"), "oro");
  });

  it("sin valoración del proyecto ni excepción, no hay nada que filtrar", () => {
    assert.equal(valoracionParaRol({}, 12, "jornada"), "");
  });

  it("acepta referencias pobladas", () => {
    assert.equal(valoracionParaRol({ valoracionId: { _id: "plata" }, valoracionesPorRol: [{ rolFrameId: 3, contratoId: { _id: "j" }, valoracionId: { _id: "oro" } }] }, 3, "j"), "oro");
    assert.equal(excepcionDelRol({ valoracionesPorRol: [] }, 3, "j"), null);
  });

  it("varios roles: si coinciden, esa; si difieren, no se filtra", () => {
    assert.equal(valoracionParaRoles(proyecto, [3, 4], "jornada"), "plata");
    assert.equal(valoracionParaRoles(proyecto, [12], "jornada"), "oro");
    assert.equal(valoracionParaRoles(proyecto, [12, 3], "jornada"), "");
    assert.equal(valoracionParaRoles(proyecto, []), "plata");
  });

  it("normaliza: una fila por rol + tipo, sin filas incompletas", () => {
    assert.deepEqual(
      normalizarValoracionesPorRol([
        { rolFrameId: 12, contratoId: "j", valoracionId: "oro" },
        { rolFrameId: "12", contratoId: "j", valoracionId: "bronce" },
        { rolFrameId: 12, contratoId: "p", valoracionId: "oro" },
        { rolFrameId: 0, valoracionId: "x" },
        { rolFrameId: 5, valoracionId: "" },
      ]),
      [
        { rolFrameId: 12, contratoId: "j", valoracionId: "bronce" },
        { rolFrameId: 12, contratoId: "p", valoracionId: "oro" },
      ],
    );
  });
});
