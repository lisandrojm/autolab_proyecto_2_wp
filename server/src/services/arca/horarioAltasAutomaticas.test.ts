/**
 *   npx tsx --test src/services/arca/horarioAltasAutomaticas.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_INTENTOS_AUTOMATICOS, agotoLosIntentos, entraEnLaCorrida, motivoDeOmision, type CandidatoParaCorrida } from "./horarioAltasAutomaticas.js";

const candidato = (o: Partial<CandidatoParaCorrida> = {}): CandidatoParaCorrida => ({
  presentable: true,
  terminado: false,
  rechazoDefinitivo: "",
  agotado: false,
  intentos: 0,
  primerIntentoEl: "",
  motivo: "",
  ...o,
});

describe("cuántas veces insiste la automática con una rechazada", () => {
  it("el tope son tres rechazos de corridas automáticas", () => {
    assert.equal(MAX_INTENTOS_AUTOMATICOS, 3);
    assert.equal(agotoLosIntentos(0), false);
    assert.equal(agotoLosIntentos(2), false);
    assert.equal(agotoLosIntentos(3), true);
    assert.equal(agotoLosIntentos(7), true);
    assert.equal(agotoLosIntentos(undefined), false);
  });
  it("una rechazada una o dos veces entra de nuevo en la corrida siguiente", () => {
    assert.equal(entraEnLaCorrida(candidato({ intentos: 1 })), true);
    assert.equal(entraEnLaCorrida(candidato({ intentos: 2 })), true);
    assert.equal(motivoDeOmision(candidato({ intentos: 2 })), null);
  });
  it("agotada: no entra, y se lista con cuántas veces y desde cuándo", () => {
    const c = candidato({ intentos: 3, agotado: true, primerIntentoEl: "2026-10-15T17:01:00.000Z" });
    assert.equal(entraEnLaCorrida(c), false);
    assert.equal(motivoDeOmision(c), "ARCA la rechazó 3 veces (la primera vez el 15/10): la automática no insiste más; revisala o forzala.");
  });
  it("sin fecha del primer intento, el motivo no la inventa", () => {
    assert.equal(motivoDeOmision(candidato({ intentos: 3, agotado: true })), "ARCA la rechazó 3 veces: la automática no insiste más; revisala o forzala.");
  });
  it("el rechazo definitivo del padrón no entra aunque tenga un solo intento, y manda sobre el agotado", () => {
    const c = candidato({ intentos: 1, rechazoDefinitivo: "El CUIL ya posee una relación laboral activa." });
    assert.equal(entraEnLaCorrida(c), false);
    assert.match(motivoDeOmision(c) || "", /^ARCA ya lo rechazó: El CUIL ya posee/);
    assert.match(motivoDeOmision(candidato({ ...c, intentos: 3, agotado: true })) || "", /^ARCA ya lo rechazó/);
  });
  it("terminados: ni entran ni se listan como omitidos (se ven aparte)", () => {
    assert.equal(entraEnLaCorrida(candidato({ terminado: true })), false);
    assert.equal(motivoDeOmision(candidato({ terminado: true, agotado: true, intentos: 3 })), null);
  });
  it("incompletos: no entran y el motivo es el del dato que falta", () => {
    const c = candidato({ presentable: false, motivo: "Faltan datos de ARCA: Categoría." });
    assert.equal(entraEnLaCorrida(c), false);
    assert.equal(motivoDeOmision(c), "Faltan datos de ARCA: Categoría.");
  });
});
