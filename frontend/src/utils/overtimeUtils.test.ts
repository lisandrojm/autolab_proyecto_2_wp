import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_GLOSSARY, splitOvertime } from "./overtimeUtils.js";

/**
 * El reparto de las horas extra entre 50% y 100% (glosario por defecto: L a V de 06:00 a 20:59 al 50%,
 * sábados de 06:00 a 12:59, el resto al 100%). Caso real del 09/10/2026: turno de 06:00 a 12:00,
 * trabajó de 05:30 a 12:30.
 */
describe("splitOvertime", () => {
  it("05:30-12:30 sobre un turno de 06:00 a 12:00, un viernes: 0,5 h al 100% (antes de las 06:00) y 0,5 h al 50%", () => {
    const r = splitOvertime("2026-10-09", "05:30", "12:30", 1, DEFAULT_GLOSSARY, "06:00", "12:00");
    assert.equal(r.h100, 0.5);
    assert.equal(r.h50, 0.5);
  });
  it("05:30-12:00: toda la extra es antes de las 06:00, al 100%", () => {
    const r = splitOvertime("2026-10-07", "05:30", "12:00", 0.5, DEFAULT_GLOSSARY, "06:00", "12:00");
    assert.equal(r.h100, 0.5);
    assert.equal(r.h50, 0);
  });
  it("06:00-13:00 un martes: la hora después del turno cae en el rango diurno, al 50%", () => {
    const r = splitOvertime("2026-10-06", "06:00", "13:00", 1, DEFAULT_GLOSSARY, "06:00", "12:00");
    assert.equal(r.h50, 1);
    assert.equal(r.h100, 0);
  });
  it("05:00-13:00 sobre un turno de 07:00 a 14:00, un lunes: llegó antes y se fue antes, la hora extra va entera al 100%", () => {
    const r = splitOvertime("2026-11-16", "05:00", "13:00", 1, DEFAULT_GLOSSARY, "07:00", "14:00");
    assert.equal(r.h100, 1);
    assert.equal(r.h50, 0);
  });
  it("06:00-14:00 sobre un turno de 07:00 a 14:00: la hora antes de entrar cae en el rango, al 50%", () => {
    const r = splitOvertime("2026-11-16", "06:00", "14:00", 1, DEFAULT_GLOSSARY, "07:00", "14:00");
    assert.equal(r.h50, 1);
    assert.equal(r.h100, 0);
  });
  it("04:00-13:00 sobre 07:00-14:00: 2 h extra; las 2 h antes de las 06:00 al 100%, nada al 50%", () => {
    const r = splitOvertime("2026-11-16", "04:00", "13:00", 2, DEFAULT_GLOSSARY, "07:00", "14:00");
    assert.equal(r.h100, 2);
    assert.equal(r.h50, 0);
  });
  it("05:30-13:00 sobre 07:00-14:00: 0,5 h extra, va al 100% (media hora antes de las 06:00)", () => {
    const r = splitOvertime("2026-11-16", "05:30", "13:00", 0.5, DEFAULT_GLOSSARY, "07:00", "14:00");
    assert.equal(r.h100, 0.5);
    assert.equal(r.h50, 0);
  });
  it("domingo: todo al 100%", () => {
    const r = splitOvertime("2026-10-11", "05:30", "12:30", 1, DEFAULT_GLOSSARY, "06:00", "12:00");
    assert.equal(r.h100, 1);
    assert.equal(r.h50, 0);
  });
});

describe("splitOvertime en feriados (Configuración › Feriados)", () => {
  it("un feriado de lunes a sábado va todo al 100%, como un domingo", () => {
    // 01/05/2026 es viernes: sin el feriado sería 0,5/0,5.
    const r = splitOvertime("2026-05-01", "05:30", "12:30", 1, DEFAULT_GLOSSARY, "06:00", "12:00", { feriado: true });
    assert.equal(r.h100, 1);
    assert.equal(r.h50, 0);
  });
  it("sin la marca de feriado, el mismo viernes se reparte como un día común", () => {
    const r = splitOvertime("2026-05-01", "05:30", "12:30", 1, DEFAULT_GLOSSARY, "06:00", "12:00");
    assert.equal(r.h100, 0.5);
    assert.equal(r.h50, 0.5);
  });
});
