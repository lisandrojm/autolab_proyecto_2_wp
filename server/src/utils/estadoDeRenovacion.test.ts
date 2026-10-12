import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estadoDeRenovacion, procesoTerminadoSegunEstados, type ContratoParaRenovacion } from "./estadoDeRenovacion.js";

const HOY = "2026-10-12";
const terminado = procesoTerminadoSegunEstados(
  [
    { name: "Pedido de AFIP", data: { ordenDependencia: 1 } },
    { name: "Envio de documentacion", data: { ordenDependencia: 2 } },
    { name: "Firma pendiente", data: { ordenDependencia: 3 } },
    { name: "Disponible", data: { ordenDependencia: 5 } },
  ],
  (s) => s.toLowerCase(),
);
const c = (alta: string, baja: string, delSistema: boolean, estado = "Disponible"): ContratoParaRenovacion => ({ fecha_alta_contrato: alta, fecha_baja_contrato: baja, nombre_estado_empleado: estado, delSistema });
const evaluar = (contrato: ContratoParaRenovacion, contratos: ContratoParaRenovacion[], renovacionPedida = false) => estadoDeRenovacion({ contrato, contratos, hoy: HOY, procesoTerminado: terminado, renovacionPedida });

describe("qué dice un contrato sobre su renovación", () => {
  it("un contrato viejo (importado) vencido y sin nada después: Renovar", () => {
    const viejo = c("2026-09-01", "2026-09-30", false);
    assert.equal(evaluar(viejo, [viejo]), "renovar");
  });
  it("un contrato viejo que todavía no venció: nada", () => {
    const viejo = c("2026-10-01", "2026-10-31", false);
    assert.equal(evaluar(viejo, [viejo]), null);
  });
  it("viejo vencido con una solicitud de renovación pendiente: En proceso", () => {
    const viejo = c("2026-09-01", "2026-09-30", false);
    assert.equal(evaluar(viejo, [viejo], true), "en_proceso");
  });
  it("viejo vencido con un contrato posterior del sistema todavía en circuito: En proceso", () => {
    const viejo = c("2026-09-01", "2026-09-30", false);
    const nuevo = c("2026-10-15", "2026-10-31", true, "Firma pendiente");
    assert.equal(evaluar(viejo, [viejo, nuevo]), "en_proceso");
  });
  it("viejo vencido con un posterior del sistema ya terminado y sin vencer: Renovado", () => {
    const viejo = c("2026-09-01", "2026-09-30", false);
    const nuevo = c("2026-10-01", "2026-10-31", true, "Disponible");
    assert.equal(evaluar(viejo, [viejo, nuevo]), "renovado");
  });
  it("viejo cuyo posterior también venció: nada (lo que rige es el posterior)", () => {
    const viejo = c("2026-08-01", "2026-08-31", false);
    const nuevo = c("2026-09-01", "2026-09-30", true);
    assert.equal(evaluar(viejo, [viejo, nuevo]), null);
  });
  it("el contrato del sistema que ES la renovación: En proceso mientras recorre el circuito", () => {
    const viejo = c("2026-09-01", "2026-09-30", false);
    const nuevo = c("2026-10-15", "2026-10-31", true, "Envio de documentacion");
    assert.equal(evaluar(nuevo, [viejo, nuevo]), "en_proceso");
  });
  it("…Renovado cuando terminó y todavía no venció (también si aún no empezó)", () => {
    const viejo = c("2026-09-01", "2026-09-30", false);
    assert.equal(evaluar(c("2026-10-01", "2026-10-31", true), [viejo, c("2026-10-01", "2026-10-31", true)]), "renovado");
    assert.equal(evaluar(c("2026-10-20", "2026-10-31", true), [viejo, c("2026-10-20", "2026-10-31", true)]), "renovado");
  });
  it("…y cuando vence, nada: se edita, no se renueva", () => {
    const viejo = c("2026-08-01", "2026-08-31", false);
    const nuevo = c("2026-09-01", "2026-09-30", true);
    assert.equal(evaluar(nuevo, [viejo, nuevo]), null);
  });
  it("el primer contrato de una persona, aunque sea del sistema, no es una renovación: nada", () => {
    const unico = c("2026-10-01", "2026-10-31", true, "Pedido de AFIP");
    assert.equal(evaluar(unico, [unico]), null);
  });
  it("un estado que no está en el circuito cuenta como terminado", () => {
    assert.equal(terminado("Activo"), true);
    assert.equal(terminado("Firma pendiente"), false);
    assert.equal(terminado("Disponible"), true);
  });
});
