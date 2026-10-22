import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG_POR_DEFECTO, planificar, puedeCorrer, type ArchivoResuelto, type EstadoThrottle } from "./planificador.js";

const archivo = (n: number, tipo = "Contrato_Jornada", prefijo = "426_LN+") => `${prefijo}_PEREZ_${tipo}_D-20261010_H-20261010_20273130293_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-${String(n).padStart(6, "0")}.pdf`;
const resuelto = (a: string): ArchivoResuelto => ({ archivo: a, firmante: { nombre: "JUAN PEREZ", email: "fulano@gmail.com" } });
// Un martes a las 12:00 de Argentina (UTC-3).
const AHORA = new Date("2026-10-20T15:00:00Z");
const limpio: EstadoThrottle = { contadorDia: { fecha: "2026-10-20", enviados: 0 }, enfriadoHasta: null, ultimaCorridaAt: null };
const config = { ...CONFIG_POR_DEFECTO, activo: true };

describe("planificar la tanda", () => {
  it("respeta el tamaño de tanda y ordena por nombre", () => {
    const archivos = [5, 3, 1, 4, 2].map((n) => resuelto(archivo(n)));
    const plan = planificar(archivos, new Set(), { ...config, tamanoTanda: 3 }, limpio, AHORA);
    assert.deepEqual(plan.tanda.map((c) => c.codigo), ["ID-000001", "ID-000002", "ID-000003"]);
    assert.equal(plan.pendientesDespues, 2);
  });
  it("respeta el tope diario: con 38 enviados hoy y tope 40, la tanda es de 2", () => {
    const archivos = [1, 2, 3, 4, 5].map((n) => resuelto(archivo(n)));
    const plan = planificar(archivos, new Set(), config, { ...limpio, contadorDia: { fecha: "2026-10-20", enviados: 38 } }, AHORA);
    assert.equal(plan.tanda.length, 2);
    assert.equal(plan.cupoHoy, 2);
    // El contador de OTRO día no cuenta.
    assert.equal(planificar(archivos, new Set(), config, { ...limpio, contadorDia: { fecha: "2026-10-19", enviados: 38 } }, AHORA).tanda.length, 5);
  });
  it("dedupe por código: lo ya enviado no sale aunque siga en Outbox", () => {
    const plan = planificar([1, 2].map((n) => resuelto(archivo(n))), new Set(["ID-000001"]), config, limpio, AHORA);
    assert.deepEqual(plan.tanda.map((c) => c.codigo), ["ID-000002"]);
    assert.deepEqual(plan.yaEnviados, [archivo(1)]);
  });
  it("separa lo que requiere revisión: tipos sin regla, sin código, sin firmante, código repetido", () => {
    const sinCodigo = "426_LN+_PEREZ_Contrato_Jornada_D-20261010_H-20261010_20273130293_fulano-ARROBA-gmail.com.pdf";
    const archivos: ArchivoResuelto[] = [
      resuelto(archivo(1, "CCM", "701_X")),
      resuelto(archivo(2, "Contrato_Servicios", "99_PRODUCTORA")),
      resuelto(archivo(3, "Release_Servicios", "99_PRODUCTORA")),
      resuelto("99_PRODUCTORA_REC_SUELDO_2026_PERIODO_09_PEREZ_Juan_fulano-ARROBA-gmail.com_20273130293_ID-000004.pdf"),
      resuelto(sinCodigo),
      { archivo: archivo(6), firmante: null, motivoSinFirmante: "No hay usuario con ese código." },
      resuelto(archivo(7)),
      resuelto(archivo(7, "Release")),
    ];
    const plan = planificar(archivos, new Set(), config, limpio, AHORA);
    assert.deepEqual(plan.tanda.map((c) => c.codigo), ["ID-000007"]);
    // CCM, Contrato_Servicios, Release_Servicios, REC_SUELDO, sin código, sin firmante y el código repetido: 7.
    assert.equal(plan.requiereRevision.length, 7);
    assert.ok(plan.requiereRevision.some((r) => r.archivo === sinCodigo));
    assert.ok(plan.requiereRevision.some((r) => r.codigo === "ID-000006" && /usuario/.test(r.motivo)));
    assert.ok(plan.requiereRevision.some((r) => r.codigo === "ID-000007" && /mismo código/.test(r.motivo)));
  });
});

describe("cuándo corre el scheduler", () => {
  it("no corre desactivado, fuera de ventana, en enfriamiento, sin cupo o antes del intervalo", () => {
    assert.equal(puedeCorrer({ ...config, activo: false }, limpio, AHORA).ok, false);
    assert.equal(puedeCorrer(config, limpio, new Date("2026-10-20T04:00:00Z")).ok, false, "01:00 AR está fuera de 8-22");
    assert.equal(puedeCorrer(config, { ...limpio, enfriadoHasta: new Date(AHORA.getTime() + 3600_000) }, AHORA).ok, false);
    assert.equal(puedeCorrer(config, { ...limpio, contadorDia: { fecha: "2026-10-20", enviados: 40 } }, AHORA).ok, false);
    assert.equal(puedeCorrer(config, { ...limpio, ultimaCorridaAt: new Date(AHORA.getTime() - 3600_000) }, AHORA).ok, false);
    assert.equal(puedeCorrer(config, { ...limpio, ultimaCorridaAt: new Date(AHORA.getTime() - 5 * 3600_000) }, AHORA).ok, true);
  });
  it("el botón manual sólo respeta el enfriamiento y el cupo", () => {
    assert.equal(puedeCorrer({ ...config, activo: false }, limpio, new Date("2026-10-20T04:00:00Z"), { manual: true }).ok, true);
    assert.equal(puedeCorrer(config, { ...limpio, enfriadoHasta: new Date(AHORA.getTime() + 3600_000) }, AHORA, { manual: true }).ok, false);
  });
});
