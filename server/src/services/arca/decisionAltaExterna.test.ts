import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decidirAltaExterna, mismaModalidad, type AltaPendiente } from "./decisionAltaExterna.js";

const PLAZO_FIJO = "A tiempo completo determinado (contrato a plazo fijo)";
const alta: AltaPendiente = { alta: "2026-10-01", baja: "2026-10-31", modalidadCodigo: "022", modalidadNombre: PLAZO_FIJO, otroContratoMismoDia: false };
const rel = (inicio: string, fin: string, modalidad = PLAZO_FIJO) => ({ inicio, fin, modalidad });

describe("decidirAltaExterna", () => {
  it("relación idéntica (fechas y modalidad) → adoptar", () => {
    const d = decidirAltaExterna(alta, [rel("2026-10-01", "2026-10-31")]);
    assert.equal(d?.accion, "adoptar");
    assert.equal(d?.relacion?.fin, "2026-10-31");
    assert.equal(d?.esperado.modalidad, `022 - ${PLAZO_FIJO}`);
  });

  it("tiempo indeterminado: las dos sin fin → adoptar", () => {
    const d = decidirAltaExterna({ ...alta, baja: "", modalidadCodigo: "008", modalidadNombre: "A tiempo completo indeterminado/Trabajo permanente" }, [rel("2026-10-01", "", "A tiempo completo indeterminado/Trabajo permanente")]);
    assert.equal(d?.accion, "adoptar");
  });

  it("entre relaciones viejas de la misma empleadora, elige sólo la idéntica", () => {
    const d = decidirAltaExterna(alta, [rel("2026-08-01", "2026-08-31"), rel("2026-10-01", "2026-10-31"), rel("2026-09-01", "2026-09-30")]);
    assert.equal(d?.accion, "adoptar");
  });

  it("sólo relaciones anteriores al contrato → null (no es asunto de esta regla)", () => {
    assert.equal(decidirAltaExterna(alta, [rel("2026-09-01", "2026-09-30")]), null);
    assert.equal(decidirAltaExterna(alta, []), null);
  });

  it("mismo inicio, otro fin → revisión manual con lado a lado", () => {
    const d = decidirAltaExterna(alta, [rel("2026-10-01", "2026-11-30")]);
    assert.equal(d?.accion, "revision_manual");
    assert.match(d!.motivo, /termina el 30\/11\/2026 y el contrato el 31\/10\/2026/);
    assert.deepEqual(d?.esperado, { inicio: "2026-10-01", fin: "2026-10-31", modalidad: `022 - ${PLAZO_FIJO}` });
    assert.equal(d?.encontradas.length, 1);
  });

  it("ARCA abierta y el contrato con baja → revisión manual (nunca se adopta sola)", () => {
    const d = decidirAltaExterna(alta, [rel("2026-10-01", "")]);
    assert.equal(d?.accion, "revision_manual");
    assert.match(d!.motivo, /no tiene fecha de fin/);
  });

  it("otra modalidad → revisión manual", () => {
    const d = decidirAltaExterna(alta, [rel("2026-10-01", "2026-10-31", "Trabajo eventual")]);
    assert.equal(d?.accion, "revision_manual");
    assert.match(d!.motivo, /la modalidad es «Trabajo eventual»/);
  });

  it("empieza durante el contrato pero otro día → revisión manual", () => {
    const d = decidirAltaExterna(alta, [rel("2026-10-02", "2026-10-31")]);
    assert.equal(d?.accion, "revision_manual");
    assert.match(d!.motivo, /empieza el 02\/10\/2026 y el contrato el 01\/10\/2026/);
  });

  it("dos relaciones idénticas → revisión manual", () => {
    const d = decidirAltaExterna(alta, [rel("2026-10-01", "2026-10-31"), rel("2026-10-01", "2026-10-31")]);
    assert.equal(d?.accion, "revision_manual");
    assert.match(d!.motivo, /2 relaciones idénticas/);
  });

  it("otro contrato de WeProdu ya es esa alta → revisión manual (duplicado)", () => {
    const d = decidirAltaExterna({ ...alta, otroContratoMismoDia: true }, [rel("2026-10-01", "2026-10-31")]);
    assert.equal(d?.accion, "revision_manual");
    assert.match(d!.motivo, /duplicado/);
  });

  it("el contrato sin modalidad resuelta y ARCA la informa → revisión manual", () => {
    const d = decidirAltaExterna({ ...alta, modalidadCodigo: "", modalidadNombre: "" }, [rel("2026-10-01", "2026-10-31")]);
    assert.equal(d?.accion, "revision_manual");
    assert.match(d!.motivo, /no se pudo comparar la modalidad/);
  });

  it("ARCA no informa la modalidad → se compara sólo por fechas", () => {
    const d = decidirAltaExterna(alta, [rel("2026-10-01", "2026-10-31", "")]);
    assert.equal(d?.accion, "adoptar");
  });
});

describe("mismaModalidad", () => {
  it("compara por código cuando el TXT lo trae adelante", () => {
    assert.equal(mismaModalidad({ modalidadCodigo: "22", modalidadNombre: "" }, "022 - A tiempo completo determinado"), true);
    assert.equal(mismaModalidad({ modalidadCodigo: "021", modalidadNombre: "" }, "022 - A tiempo completo determinado"), false);
  });
  it("sin tildes ni mayúsculas, y tolera la descripción cortada por el ancho del TXT", () => {
    assert.equal(mismaModalidad({ modalidadCodigo: "022", modalidadNombre: PLAZO_FIJO }, "A TIEMPO COMPLETO DETERMINADO (CONTRATO A PLAZO"), true);
    assert.equal(mismaModalidad({ modalidadCodigo: "008", modalidadNombre: "A tiempo completo indeterminado/Trabajo permanente" }, PLAZO_FIJO), false);
  });
});
