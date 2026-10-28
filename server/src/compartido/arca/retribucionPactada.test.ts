/**
 *   npx tsx --test src/compartido/arca/retribucionPactada.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { campoDeModalidad, importeDelContrato, retribucionPactada } from "./retribucionPactada.js";

// Jornada G7 del 634/11: bruto 1.239.805,93 ÷ 22 × 1,5 = 84.532,22 por jornada; neto/bruto 0,81. Un día suelto.
const JORNADA = { cantidadJornadas: 22, diasPorSemana: 5 };
const ESCALA_G7 = { sueldoBruto: 1239805.93, neto: 1004242.80 };
const CONTRATO = { sueldo_jornada: 84532.22, sueldo_bruto: 84532.22, sueldo_neto: 68471.1, sueldo_diario_neto: 68471.1, cantidad_jornadas_laborales: 1, dias_semana: [6], fechas_trabajadas: ["2026-10-24"], fecha_alta_contrato: "2026-10-24", fecha_baja_contrato: "2026-10-24" };
const ctx = { tipo: JORNADA, escala: ESCALA_G7 };

describe("importes del contrato (los de Configurar Miembro)", () => {
  it("jornada, semana y mensual, bruto y neto", () => {
    assert.equal(importeDelContrato("jornada_bruto", CONTRATO, ctx), 84532.22);
    assert.equal(importeDelContrato("jornada_neto", CONTRATO, ctx), 68471.1);
    assert.equal(importeDelContrato("semana_bruto", CONTRATO, ctx), 422661.1);
    assert.equal(importeDelContrato("semana_neto", CONTRATO, ctx), 342355.49);
    assert.equal(importeDelContrato("mensual_bruto", CONTRATO, ctx), 1859708.84);
    assert.equal(importeDelContrato("mensual_neto", CONTRATO, ctx), 1506364.16);
    assert.equal(importeDelContrato("total_neto", CONTRATO, ctx), 68471.1);
  });
  it("los guardados tal cual", () => {
    assert.equal(importeDelContrato("sueldo_bruto", CONTRATO, ctx), 84532.22);
    assert.equal(importeDelContrato("sueldo_neto", CONTRATO, ctx), 68471.1);
    assert.equal(importeDelContrato("sueldo_diario_neto", CONTRATO, ctx), 68471.1);
  });
  it("sin jornada no hay importe (no se declara un 0)", () => {
    assert.equal(importeDelContrato("jornada_bruto", {}, ctx), null);
    assert.equal(importeDelContrato("mensual_bruto", { sueldo_jornada: 100 }, { escala: ESCALA_G7 }), null);
  });
});

describe("la modalidad elige el campo", () => {
  const modalidades = [{ externalId: "4", retribucionPactada: "jornada_bruto" }, { externalId: "1", retribucionPactada: "" }, { externalId: "8", retribucionPactada: "cualquiera" }];
  it("por código; vacío o desconocido = la escala", () => {
    assert.equal(campoDeModalidad("4", modalidades), "jornada_bruto");
    assert.equal(campoDeModalidad("1", modalidades), "");
    assert.equal(campoDeModalidad("8", modalidades), "");
    assert.equal(campoDeModalidad("", modalidades), "");
  });
  it("sin campo se declara el bruto de la escala, como antes", () => {
    assert.deepEqual(retribucionPactada("", CONTRATO, ctx), { valor: 1239805.93, origen: "escala" });
    assert.deepEqual(retribucionPactada("jornada_bruto", CONTRATO, ctx), { valor: 84532.22, origen: "jornada_bruto" });
  });
});
