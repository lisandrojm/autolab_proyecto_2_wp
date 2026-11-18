/**
 * La vigencia con lápidas de contratos anulados (etapa 2b, 18/11/2026).
 *
 *   npm run test:contrato-vigencia
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { esContratoAnulado, esContratoVigente, esTiempoIndeterminado, getContratoActivo, ordenarContratosDesc } from "./contratoVigencia.js";

const lapida = { contratoKey: "k", estadoContrato: "ANULADO", anulacion: { motivo: "duplicado" } };
const jornada = { fecha_alta_contrato: "2025-07-29", fecha_baja_contrato: "2025-07-29", nombre_contrato: "Jornada" };
const indeterminado = { fecha_alta_contrato: "2023-06-01", fecha_baja_contrato: "", nombre_contrato: "Tiempo Indeterminado" };

describe("lápidas de contratos anulados", () => {
  it("una lápida no es vigente ni indeterminada (sin la guarda, sin fechas parecía las dos cosas)", () => {
    assert.equal(esContratoAnulado(lapida), true);
    assert.equal(esContratoVigente(lapida), false);
    assert.equal(esTiempoIndeterminado(lapida), false);
  });

  it("getContratoActivo nunca elige una lápida, y devuelve el MISMO objeto (la posición se busca por identidad)", () => {
    const contratos = [jornada, lapida];
    assert.equal(getContratoActivo(contratos), jornada);
    assert.equal(contratos.indexOf(getContratoActivo(contratos)!), 0);
    const conIndeterminado = [indeterminado, lapida, jornada];
    assert.equal(conIndeterminado.indexOf(getContratoActivo(conIndeterminado)!), 0);
  });

  it("si sólo hay lápidas, no hay contrato que rija", () => {
    assert.equal(getContratoActivo([lapida, { ...lapida, contratoKey: "k2" }]), null);
  });

  it("ordenarContratosDesc no las lista", () => {
    assert.deepEqual(ordenarContratosDesc([jornada, lapida, indeterminado]), [jornada, indeterminado]);
  });
});
