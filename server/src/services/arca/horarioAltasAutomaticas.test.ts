/**
 *   npx tsx --test src/services/arca/horarioAltasAutomaticas.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIG_POR_DEFECTO,
  configDe,
  entraEnLaCorrida,
  esDelDia,
  hastaDeLaCorrida,
  leTocaALaCola,
  motivoDeOmision,
  proximaCorridaPara,
  proximaDeLaCola,
  validarConfig,
  type CandidatoParaCorrida,
} from "./horarioAltasAutomaticas.js";

const candidato = (o: Partial<CandidatoParaCorrida> = {}): CandidatoParaCorrida => ({ presentable: true, rechazadaEl: "", motivo: "", ...o });
const hoy = "2026-10-19";

describe("nada queda fuera de la automática (pedido del 19/10/2026)", () => {
  it("una completa entra, aunque la hayan rechazado antes", () => {
    assert.equal(entraEnLaCorrida(candidato(), hoy), true);
    assert.equal(entraEnLaCorrida(candidato({ rechazadaEl: "2026-10-15T17:01:00.000Z" }), hoy), true);
    assert.equal(motivoDeOmision(candidato({ rechazadaEl: "2026-10-18T20:00:00.000Z" }), hoy), null);
  });
  it("rechazada hoy (hora argentina): espera a mañana", () => {
    const c = candidato({ rechazadaEl: "2026-10-19T17:05:00.000Z" });
    assert.equal(entraEnLaCorrida(c, hoy), false);
    assert.equal(motivoDeOmision(c, hoy), "ARCA la rechazó hoy: vuelve a intentarse mañana.");
    // 23:30 argentinas del 18 son las 02:30 UTC del 19: fue ayer.
    assert.equal(entraEnLaCorrida(candidato({ rechazadaEl: "2026-10-19T02:30:00.000Z" }), hoy), true);
  });
  it("incompletas: no entran y el motivo es el del dato que falta", () => {
    const c = candidato({ presentable: false, motivo: "Faltan datos de ARCA: Categoría." });
    assert.equal(entraEnLaCorrida(c, hoy), false);
    assert.equal(motivoDeOmision(c, hoy), "Faltan datos de ARCA: Categoría.");
  });
});

describe("modo y frecuencia", () => {
  it("por defecto, diaria cada 60 (la frecuencia sólo pesa en modo frecuente)", () => {
    assert.deepEqual(configDe(undefined), CONFIG_POR_DEFECTO);
    assert.equal(configDe({ modo: "frecuente", cadaMinutos: 30 }).modo, "frecuente");
    assert.equal(configDe({ modo: "otro", cadaMinutos: 7 }).modo, "diaria");
    assert.equal(configDe({ cadaMinutos: 7 }).cadaMinutos, 60);
  });
  it("al guardar, el modo y la frecuencia se validan", () => {
    assert.deepEqual(validarConfig({ modo: "frecuente", cadaMinutos: 30 }), { ok: true, cambios: { modo: "frecuente", cadaMinutos: 30 } });
    assert.equal(validarConfig({ modo: "x" }).ok, false);
    assert.equal(validarConfig({ cadaMinutos: 7 }).ok, false);
  });
  it("la cola corre cada N minutos desde la última pasada, y nunca en modo diario", () => {
    const cfg = configDe({ modo: "frecuente", cadaMinutos: 30 });
    const ahora = new Date("2026-10-19T15:00:00.000Z");
    assert.equal(leTocaALaCola(cfg, "2026-10-19T14:40:00.000Z", ahora), false);
    assert.equal(leTocaALaCola(cfg, "2026-10-19T14:30:00.000Z", ahora), true);
    assert.equal(leTocaALaCola(cfg, undefined, ahora), true);
    assert.equal(leTocaALaCola({ ...cfg, modo: "diaria" }, undefined, ahora), false);
    assert.equal(proximaDeLaCola(cfg, "2026-10-19T14:40:00.000Z", ahora).toISOString(), "2026-10-19T15:10:00.000Z");
  });
});

describe("qué toma cada corrida", () => {
  const cfg = CONFIG_POR_DEFECTO;
  const antes = new Date("2026-10-19T12:00:00-03:00");
  const despues = new Date("2026-10-19T15:00:00-03:00");
  it("la del día llega hasta la anticipación", () => {
    assert.equal(hastaDeLaCorrida(hoy, cfg, "dia", antes), hoy);
    assert.equal(hastaDeLaCorrida(hoy, { ...cfg, diasAntes: 2 }, "dia", antes), "2026-10-21");
  });
  it("la cola, antes de la hora, no toca las del día: son de la corrida del día", () => {
    assert.equal(hastaDeLaCorrida(hoy, cfg, "cola", antes), "2026-10-18");
    assert.equal(hastaDeLaCorrida(hoy, cfg, "cola", despues), hoy);
  });
  it("en la corrida del día van primero las que no están atrasadas", () => {
    assert.equal(esDelDia(hoy, hoy), true);
    assert.equal(esDelDia("2026-10-20", hoy), true);
    assert.equal(esDelDia("2026-10-18", hoy), false);
  });
});

describe("la próxima corrida de un alta", () => {
  const diaria = CONFIG_POR_DEFECTO;
  const frecuente = configDe({ modo: "frecuente", cadaMinutos: 60 });
  const antes = new Date("2026-10-19T12:00:00-03:00");
  const despues = new Date("2026-10-19T15:00:00-03:00");
  it("una atrasada de cualquier fecha tiene corrida (no hay límite de 30 días)", () => {
    assert.equal(proximaCorridaPara("2026-06-01", diaria, antes, hoy)?.toISOString(), "2026-10-19T17:00:00.000Z");
    assert.equal(proximaCorridaPara("2026-06-01", diaria, despues, hoy)?.toISOString(), "2026-10-20T17:00:00.000Z");
  });
  it("en modo frecuente, una atrasada sale en la próxima pasada de la cola", () => {
    assert.equal(proximaCorridaPara("2026-06-01", frecuente, despues, hoy, { ultimaCola: "2026-10-19T17:30:00.000Z" })?.toISOString(), "2026-10-19T18:30:00.000Z");
  });
  it("un alta futura espera su turno, en cualquier modo", () => {
    assert.equal(proximaCorridaPara("2026-10-22", frecuente, despues, hoy, { ultimaCola: "2026-10-19T17:30:00.000Z" })?.toISOString(), "2026-10-22T17:00:00.000Z");
    assert.equal(proximaCorridaPara(hoy, frecuente, antes, hoy, { ultimaCola: "2026-10-19T14:30:00.000Z" })?.toISOString(), "2026-10-19T17:00:00.000Z");
  });
  it("rechazada hoy: mañana (a la hora del día, o a primera hora en modo frecuente)", () => {
    assert.equal(proximaCorridaPara("2026-10-10", diaria, despues, hoy, { rechazadaHoy: true })?.toISOString(), "2026-10-20T17:00:00.000Z");
    assert.equal(proximaCorridaPara("2026-10-10", frecuente, despues, hoy, { rechazadaHoy: true })?.toISOString(), "2026-10-20T03:00:00.000Z");
  });
});
