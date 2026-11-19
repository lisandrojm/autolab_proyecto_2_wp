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
test("Palomino Mateo: sin baja, ARCA cierra y la misma empleadora reabre al día siguiente → por tramos, no se escribe", () => {
    const r = cambio({ fecha_alta_contrato: "2021-12-15" }, CUIL, E2030, [rel("2021-12-15", "2022-02-28"), rel("2022-03-01", "2022-05-31")], HOY);
    assert.equal(r?.tipo, "arca_por_tramos");
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
test("Raffa / Xiara: ARCA terminó antes pero hay otras relaciones dentro del contrato → por tramos, no se recorta", () => {
    const r = cambio({ fecha_alta_contrato: "2026-07-20", fecha_baja_contrato: "2026-08-20" }, CUIL, E2030, [rel("2026-07-20", "2026-07-20"), rel("2026-08-01", "2026-08-20")], HOY);
    assert.equal(r?.tipo, "arca_por_tramos");
    assert.equal(r?.aplicar, false);
});
test("Sarli: ARCA «vencimiento» el día del alta en un plazo fijo mensual → plazo más corto, no se escribe", () => {
    const r = cambio({ fecha_alta_contrato: "2026-06-01", fecha_baja_contrato: "2026-06-30" }, CUIL, E2030, [rel("2026-06-01", "2026-06-01", { situacionBaja: "Vencimiento de contrato a plazo fijo o determinado, a tiempo completo" })], HOY);
    assert.equal(r?.tipo, "arca_plazo_mas_corto");
    assert.equal(r?.aplicar, false);
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
