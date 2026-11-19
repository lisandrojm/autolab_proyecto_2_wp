import { test } from "node:test";
import assert from "node:assert/strict";
import { bajaConFormatoDelAlta, cambioDeBajaSegunArca as cambio } from "./bajasArcaContrato.js";
const HOY = "2026-11-19";
const CUIL = "20171793751";
const E2030 = "30717068374";
const FZERO = "30710295839";
const rel = (inicio, fin, extra = {}) => ({ cuil: CUIL, empleadoraCuit: E2030, inicio, fin, situacionBaja: "", ...extra });
test("Becerini: indeterminado sin baja, ARCA lo cerró (despido) → se escribe", () => {
    const r = cambio({ fecha_alta_contrato: "2023-06-01", fecha_baja_contrato: null }, CUIL, E2030, [rel("2023-06-01", "2025-02-28", { situacionBaja: "Despido / ART. 245 - LCT" })], HOY);
    assert.equal(r?.tipo, "baja_nueva");
    assert.equal(r?.aplicar, true);
    assert.equal(r?.finArca, "2025-02-28");
});
test("evidencia fuerte o nada: otra empleadora, otra fecha de alta, sin CUIL o sin CUIT → no se escribe", () => {
    const rs = [rel("2023-06-01", "2025-02-28")];
    assert.equal(cambio({ fecha_alta_contrato: "2023-06-01" }, CUIL, FZERO, rs, HOY), null);
    assert.equal(cambio({ fecha_alta_contrato: "2023-06-02" }, CUIL, E2030, rs, HOY), null);
    assert.equal(cambio({ fecha_alta_contrato: "2023-06-01" }, "", E2030, rs, HOY), null);
    assert.equal(cambio({ fecha_alta_contrato: "2023-06-01" }, CUIL, "", rs, HOY), null);
});
test("anulado o ARCA abierta con contrato abierto: nada", () => {
    assert.equal(cambio({ estadoContrato: "ANULADO", fecha_alta_contrato: "2023-06-01" }, CUIL, E2030, [rel("2023-06-01", "2025-02-28")], HOY), null);
    assert.equal(cambio({ fecha_alta_contrato: "2023-06-01" }, CUIL, E2030, [rel("2023-06-01", "")], HOY), null);
});
test("Palomino Mateo: sin baja, tramos contiguos con el último cerrado (despido) → se escribe el fin del ÚLTIMO tramo", () => {
    const r = cambio({ fecha_alta_contrato: "2021-12-15" }, CUIL, E2030, [rel("2021-12-15", "2022-02-28", { situacionBaja: "Vencimiento" }), rel("2022-03-01", "2026-10-31", { situacionBaja: "Baja por despido" })], HOY);
    assert.equal(r?.tipo, "baja_por_tramos");
    assert.equal(r?.aplicar, true);
    assert.equal(r?.finArca, "2026-10-31");
    assert.equal(r?.situacionBaja, "Baja por despido");
    assert.equal(r?.tramos?.length, 2);
});
test("tramos contiguos con el último abierto → la relación sigue, no se escribe nada", () => {
    assert.equal(cambio({ fecha_alta_contrato: "2021-12-15" }, CUIL, E2030, [rel("2021-12-15", "2022-02-28"), rel("2022-03-01", "")], HOY), null);
});
test("un día de hueco ya no es contiguo: se cierra el primer tramo (como un reingreso)", () => {
    assert.equal(cambio({ fecha_alta_contrato: "2021-12-15" }, CUIL, E2030, [rel("2021-12-15", "2022-02-27"), rel("2022-03-01", "2026-10-31")], HOY)?.tipo, "baja_nueva");
});
test("Palomino después de escribirla: la cadena llega a la baja → granularidad, no vuelve a aparecer como pendiente", () => {
    const r = cambio({ fecha_alta_contrato: "2021-12-15", fecha_baja_contrato: "2026-10-31" }, CUIL, E2030, [rel("2021-12-15", "2022-02-28", { situacionBaja: "Vencimiento" }), rel("2022-03-01", "2026-10-31", { situacionBaja: "Baja por despido" })], HOY);
    assert.equal(r?.tipo, "arca_granularidad");
    assert.equal(r?.aplicar, false);
});
test("Pereda: reingreso meses después NO es tramo → la primera relación se cierra igual", () => {
    const r = cambio({ fecha_alta_contrato: "2023-06-01" }, CUIL, E2030, [rel("2023-06-01", "2025-06-30"), rel("2026-01-07", "2026-06-18")], HOY);
    assert.equal(r?.tipo, "baja_nueva");
});
test("Rodriguez: ARCA terminó antes por renuncia → se escribe la de ARCA", () => {
    const r = cambio({ fecha_alta_contrato: "2026-01-01", fecha_baja_contrato: "2026-03-31" }, CUIL, E2030, [rel("2026-01-01", "2026-02-04", { situacionBaja: "Renuncia del trabajador / ART.240 - LCT" })], HOY);
    assert.equal(r?.tipo, "baja_anterior");
    assert.equal(r?.aplicar, true);
});
const V = "Vencimiento de contrato a plazo fijo o determinado, a tiempo completo";
test("Xiara: jornadas con «vencimiento», todas dentro del contrato → granularidad de ARCA, manda el contrato", () => {
    const r = cambio({ fecha_alta_contrato: "2026-07-20", fecha_baja_contrato: "2026-08-20" }, CUIL, E2030, [rel("2026-07-04", "2026-07-04", { situacionBaja: V }), rel("2026-07-20", "2026-07-20", { situacionBaja: V }), rel("2026-08-01", "2026-08-20", { situacionBaja: V })], HOY);
    assert.equal(r?.tipo, "arca_granularidad");
    assert.equal(r?.aplicar, false);
});
test("Sarli: un solo tramo con «vencimiento» antes del fin del contrato → granularidad, no se escribe (no es un hecho)", () => {
    const r = cambio({ fecha_alta_contrato: "2026-06-01", fecha_baja_contrato: "2026-06-30" }, CUIL, E2030, [rel("2026-06-01", "2026-06-01", { situacionBaja: V })], HOY);
    assert.equal(r?.tipo, "arca_granularidad");
    assert.equal(r?.aplicar, false);
});
test("Rodini: un tramo sale del período del contrato → revisión manual", () => {
    const r = cambio({ fecha_alta_contrato: "2024-12-31", fecha_baja_contrato: "2025-02-03" }, CUIL, E2030, [rel("2024-12-31", "2025-01-03", { situacionBaja: V }), rel("2025-01-13", "2025-01-17", { situacionBaja: V }), rel("2025-02-03", "2025-02-28", { situacionBaja: V })], HOY);
    assert.equal(r?.tipo, "revision_manual");
    assert.equal(r?.aplicar, false);
});
test("un hecho (renuncia) en medio de varios tramos → revisión manual, no se escribe", () => {
    const r = cambio({ fecha_alta_contrato: "2026-01-01", fecha_baja_contrato: "2026-03-31" }, CUIL, E2030, [rel("2026-01-01", "2026-01-10", { situacionBaja: V }), rel("2026-02-01", "2026-02-10", { situacionBaja: "Renuncia del trabajador" })], HOY);
    assert.equal(r?.tipo, "revision_manual");
});
test("jornada: ARCA un día después → arca_posterior, no se escribe; terminado y ARCA abierta → falta la baja en ARCA", () => {
    assert.equal(cambio({ fecha_alta_contrato: "2026-08-22", fecha_baja_contrato: "2026-08-22" }, CUIL, E2030, [rel("2026-08-22", "2026-08-23")], HOY)?.tipo, "arca_posterior");
    const r = cambio({ fecha_alta_contrato: "2026-01-01", fecha_baja_contrato: "2026-03-31" }, CUIL, E2030, [rel("2026-01-01", "")], HOY);
    assert.equal(r?.tipo, "arca_abierta");
    assert.equal(r?.aplicar, false);
});
test("la baja se guarda con el formato del alta", () => {
    assert.equal(bajaConFormatoDelAlta("2025-02-28", "2023-06-01"), "2025-02-28");
    assert.equal(bajaConFormatoDelAlta("2025-02-28", "2023-06-01T00:00:00.000Z"), "2025-02-28T00:00:00.000Z");
});
