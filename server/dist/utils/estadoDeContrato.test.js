import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoSegunDatosLocales as estado, rigeHoySegunEstado as rige, tipoEsIndeterminado, transicionDiaria } from "./estadoDeContrato.js";
import { hayQueCalcularEstado } from "../services/estadoContratoAlGuardar.js";
const HOY = "2026-11-19";
test("con baja: pasada FINALIZADO, de hoy en adelante VIGENTE (hoy incluido)", () => {
    assert.deepEqual(estado({ fecha_alta_contrato: "2026-01-01", fecha_baja_contrato: "2026-11-18" }, false, HOY), { estado: "FINALIZADO" });
    assert.deepEqual(estado({ fecha_alta_contrato: "2026-01-01", fecha_baja_contrato: "2026-11-19" }, false, HOY), { estado: "VIGENTE" });
    assert.deepEqual(estado({ fecha_alta_contrato: "2026-12-01", fecha_baja_contrato: "2026-12-31" }, false, HOY), { estado: "VIGENTE" });
});
test("sin baja: VIGENTE sólo si el tipo es indeterminado; si no, SIN_DETERMINAR con motivo (nunca vigente por defecto)", () => {
    assert.deepEqual(estado({ fecha_alta_contrato: "2023-06-01" }, true, HOY), { estado: "VIGENTE" });
    const r = estado({ fecha_alta_contrato: "2023-06-01" }, false, HOY);
    assert.equal(r.estado, "SIN_DETERMINAR");
    assert.match(r.motivo, /no es de tiempo indeterminado/);
    assert.match(estado({ fecha_alta_contrato: "2023-06-01" }, undefined, HOY).motivo, /no se reconoce el tipo/);
});
test("la baja como string \"null\" cuenta como sin baja (no como fecha)", () => {
    assert.equal(estado({ fecha_alta_contrato: "2023-06-01", fecha_baja_contrato: "null" }, false, HOY).estado, "SIN_DETERMINAR");
});
test("indecidibles: sin alta, o baja anterior al alta (Ferro: alta 03/11/2025, baja 08/10/2025)", () => {
    assert.equal(estado({ fecha_baja_contrato: "2026-01-01" }, false, HOY).motivo, "sin fecha de alta");
    const r = estado({ fecha_alta_contrato: "2025-11-03T00:00:00.000Z", fecha_baja_contrato: "2025-10-08T00:00:00.000Z" }, false, HOY);
    assert.equal(r.estado, "SIN_DETERMINAR");
    assert.match(r.motivo, /anterior al alta/);
});
test("rige hoy: sólo VIGENTE, ya arrancado y sin baja pasada; sin estado o SIN_DETERMINAR no rige", () => {
    assert.equal(rige({ estadoContrato: "VIGENTE", fecha_alta_contrato: "2026-01-01" }, HOY), true);
    assert.equal(rige({ estadoContrato: "VIGENTE", fecha_alta_contrato: "2026-12-01" }, HOY), false);
    assert.equal(rige({ estadoContrato: "VIGENTE", fecha_alta_contrato: "2026-01-01", fecha_baja_contrato: "2026-11-18" }, HOY), false);
    assert.equal(rige({ fecha_alta_contrato: "2026-01-01" }, HOY), false);
    assert.equal(rige({ estadoContrato: "SIN_DETERMINAR", fecha_alta_contrato: "2026-01-01" }, HOY), false);
    assert.equal(rige({ estadoContrato: "ANULADO" }, HOY), false);
});
test("tipo indeterminado: por id y, si no, por nombre", () => {
    const porId = new Map([["a", true]]);
    const porNombre = new Map([["jornada", false]]);
    assert.equal(tipoEsIndeterminado({ contrato_id: "a", nombre_contrato: "Jornada" }, porId, porNombre), true);
    assert.equal(tipoEsIndeterminado({ nombre_contrato: " Jornada " }, porId, porNombre), false);
    assert.equal(tipoEsIndeterminado({ nombre_contrato: "Otro" }, porId, porNombre), undefined);
});
test("transición diaria: sólo VIGENTE con baja pasada → FINALIZADO; nunca al revés ni a otra cosa", () => {
    assert.equal(transicionDiaria({ estadoContrato: "VIGENTE", fecha_baja_contrato: "2026-11-18" }, HOY), "FINALIZADO");
    assert.equal(transicionDiaria({ estadoContrato: "VIGENTE", fecha_baja_contrato: "2026-11-19" }, HOY), null); // hoy todavía rige
    assert.equal(transicionDiaria({ estadoContrato: "VIGENTE" }, HOY), null); // indeterminado abierto
    assert.equal(transicionDiaria({ estadoContrato: "VIGENTE", fecha_baja_contrato: "null" }, HOY), null);
    assert.equal(transicionDiaria({ estadoContrato: "FINALIZADO", fecha_baja_contrato: "2027-01-01" }, HOY), null); // nunca vuelve
    assert.equal(transicionDiaria({ estadoContrato: "SIN_DETERMINAR", fecha_baja_contrato: "2020-01-01" }, HOY), null);
    assert.equal(transicionDiaria({ estadoContrato: "ANULADO" }, HOY), null);
    assert.equal(transicionDiaria({ fecha_baja_contrato: "2020-01-01" }, HOY), null); // sin estado: no lo decide esto
});
test("al guardar: se calcula si falta el estado o si cambiaron alta, baja o tipo; si no, se respeta", () => {
    const base = { contratoKey: "k", estadoContrato: "VIGENTE", fecha_alta_contrato: "2026-01-01", fecha_baja_contrato: "2026-12-31", nombre_contrato: "Plazo fijo" };
    assert.equal(hayQueCalcularEstado({ ...base, estadoContrato: undefined }, base), true); // el wizard lo reemplazó sin estado
    assert.equal(hayQueCalcularEstado({ ...base }, undefined), false); // nuevo con estado ya puesto
    assert.equal(hayQueCalcularEstado({ ...base, sueldo_bruto: 9 }, base), false); // otro campo: no
    assert.equal(hayQueCalcularEstado({ ...base, fecha_baja_contrato: "2026-06-30" }, base), true);
    assert.equal(hayQueCalcularEstado({ ...base, nombre_contrato: "Jornada" }, base), true);
    assert.equal(hayQueCalcularEstado({ estadoContrato: "ANULADO" }, undefined), false);
});
