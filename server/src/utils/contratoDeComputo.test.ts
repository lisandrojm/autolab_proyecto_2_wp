import { test } from "node:test";
import assert from "node:assert/strict";
import { contratoVigenteDeComputo } from "./contratoDeComputo.js";
import { fechaISO } from "./contratoVigencia.js";

const HOY = "2026-11-16";
const FZERO = "30711111111";
const DOS_MIL_TREINTA = "30722222222";
const c = (tipo: number, claveEmpresa: string, alta: string, baja = "", carga = "") => ({ estadoContrato: fechaISO(baja) && fechaISO(baja) < HOY ? "FINALIZADO" : "VIGENTE", tipo_contrato_id: tipo, claveEmpresa, fecha_alta_contrato: alta, fecha_baja_contrato: baja, fecha_carga: carga });

test("vigentes en dos empresas: sólo cuenta el de la empresa de cómputo", () => {
  const contratos = [c(1, FZERO, "2020-01-01"), c(2, DOS_MIL_TREINTA, "2026-10-01", "2026-12-31")];
  assert.equal(contratoVigenteDeComputo(contratos, FZERO, HOY)!.tipo_contrato_id, 1);
  assert.equal(contratoVigenteDeComputo(contratos, DOS_MIL_TREINTA, HOY)!.tipo_contrato_id, 2);
});

test("varios vigentes en la empresa de cómputo: el de alta más reciente (no manda el indeterminado)", () => {
  const contratos = [c(1, FZERO, "2020-01-01"), c(2, FZERO, "2026-09-01", "2026-12-31"), c(3, DOS_MIL_TREINTA, "2026-11-01")];
  assert.equal(contratoVigenteDeComputo(contratos, FZERO, HOY)!.tipo_contrato_id, 2);
});

test("misma alta: gana el que se cargó después", () => {
  const contratos = [c(1, FZERO, "2026-09-01", "", "2026-09-02T10:00:00"), c(2, FZERO, "2026-09-01", "", "2026-09-05T10:00:00")];
  assert.equal(contratoVigenteDeComputo(contratos, FZERO, HOY)!.tipo_contrato_id, 2);
});

test("sin contrato vigente en la empresa de cómputo: null, aunque tenga uno vigente en otra", () => {
  const contratos = [c(1, FZERO, "2020-01-01", "2026-10-31"), c(2, DOS_MIL_TREINTA, "2026-10-01")];
  assert.equal(contratoVigenteDeComputo(contratos, FZERO, HOY), null);
  assert.equal(contratoVigenteDeComputo([], FZERO, HOY), null);
});

test("uno que todavía no arrancó no es vigente; el que termina hoy sí", () => {
  assert.equal(contratoVigenteDeComputo([c(1, FZERO, "2026-12-01")], FZERO, HOY), null);
  assert.equal(contratoVigenteDeComputo([c(1, FZERO, "2026-11-01", HOY)], FZERO, HOY)!.tipo_contrato_id, 1);
});

test("fechas en DD/MM/YYYY y baja guardada como el texto «null»", () => {
  const contratos = [c(1, FZERO, "01/02/2024", "null"), c(2, FZERO, "15/10/2026", "31/12/2026")];
  assert.equal(contratoVigenteDeComputo(contratos, FZERO, HOY)!.tipo_contrato_id, 2);
});

test("sin empresa de cómputo que elegir: se miran todos los vigentes", () => {
  const contratos = [c(1, "", "2020-01-01"), c(2, "", "2026-10-01")];
  assert.equal(contratoVigenteDeComputo(contratos, null, HOY)!.tipo_contrato_id, 2);
});
