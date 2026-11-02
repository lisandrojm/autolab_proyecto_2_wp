import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decidirVerificacion, decisionSinConsultar, type AltaAVerificar, type ConsultaArca } from "./decisionVerificacionAlta.js";

/** Una jornada: alta y baja el mismo día, como los cinco casos trabados del 02/11/2026. */
const jornada: AltaAVerificar = { alta: "2026-10-09", baja: "2026-10-09", otroContratoMismoDia: false };
const consulta = (relaciones: Array<{ inicio: string; fin: string }>, encontrada: true | null = true): ConsultaArca => ({ ok: true, relaciones, encontrada });

describe("decidirVerificacion", () => {
  it("existe el alta con la misma baja → presentada (nunca se vuelve a presentar)", () => {
    const d = decidirVerificacion(jornada, consulta([{ inicio: "2026-10-09", fin: "2026-10-09" }]));
    assert.equal(d.accion, "presentada");
    assert.match(d.motivo, /verificación automática/);
    assert.equal(d.relacion?.inicio, "2026-10-09");
  });

  it("existe entre otras relaciones de la persona: elige la de ese día", () => {
    const d = decidirVerificacion(jornada, consulta([{ inicio: "2026-10-30", fin: "2026-10-30" }, { inicio: "2026-10-09", fin: "2026-10-09" }, { inicio: "2026-09-29", fin: "2026-09-30" }]));
    assert.equal(d.accion, "presentada");
  });

  it("no existe → revisión manual (un «no la vi» no destraba)", () => {
    const d = decidirVerificacion(jornada, consulta([{ inicio: "2026-10-30", fin: "2026-10-30" }], null));
    assert.equal(d.accion, "revision_manual");
    assert.match(d.motivo, /no mostró ninguna relación/);
  });

  it("el CUIL y la fecha están en pantalla pero no se leyó la tarjeta → revisión manual", () => {
    const d = decidirVerificacion(jornada, consulta([], true));
    assert.equal(d.accion, "revision_manual");
    assert.match(d.motivo, /no se pudo leer la relación/);
  });

  it("existe sin baja (sin fecha de fin) → revisión manual: falta la baja, no se presenta nada", () => {
    const d = decidirVerificacion(jornada, consulta([{ inicio: "2026-10-09", fin: "" }]));
    assert.equal(d.accion, "revision_manual");
    assert.match(d.motivo, /falta la baja/);
    assert.equal(d.relacion?.fin, "");
  });

  it("existe con otra fecha de fin → revisión manual", () => {
    const d = decidirVerificacion(jornada, consulta([{ inicio: "2026-10-09", fin: "2026-10-12" }]));
    assert.equal(d.accion, "revision_manual");
    assert.match(d.motivo, /no coinciden/);
  });

  it("resultado ambiguo: dos relaciones que empiezan ese día → revisión manual", () => {
    const d = decidirVerificacion(jornada, consulta([{ inicio: "2026-10-09", fin: "2026-10-09" }, { inicio: "2026-10-09", fin: "" }]));
    assert.equal(d.accion, "revision_manual");
    assert.match(d.motivo, /2 relaciones/);
  });

  it("error de consulta → revisión manual con el error", () => {
    const d = decidirVerificacion(jornada, { ok: false, error: "La sesión de ARCA se cayó" });
    assert.equal(d.accion, "revision_manual");
    assert.match(d.motivo, /La sesión de ARCA se cayó/);
  });

  it("tiempo indeterminado: presentada si ARCA tampoco tiene fin; revisión si tiene", () => {
    const indet: AltaAVerificar = { alta: "2026-10-09", baja: "", otroContratoMismoDia: false };
    assert.equal(decidirVerificacion(indet, consulta([{ inicio: "2026-10-09", fin: "" }])).accion, "presentada");
    assert.equal(decidirVerificacion(indet, consulta([{ inicio: "2026-10-09", fin: "2026-12-31" }])).accion, "revision_manual");
  });

  it("otro contrato de WeProdu ya es esa alta → revisión manual sin consultar, aunque ARCA la tenga", () => {
    const dup = { ...jornada, otroContratoMismoDia: true };
    assert.equal(decisionSinConsultar(dup)?.accion, "revision_manual");
    assert.equal(decidirVerificacion(dup, consulta([{ inicio: "2026-10-09", fin: "2026-10-09" }])).accion, "revision_manual");
    assert.equal(decisionSinConsultar(jornada), null);
  });
});
