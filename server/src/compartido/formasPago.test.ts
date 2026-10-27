/**
 *   npx tsx --test src/compartido/formasPago.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { codigoDesdeNombre, conflictoDeUnicidad, errorDeCampos, formasParaSelector, motivoParaNoBorrar, normalizarFormasDelTipo, rechazoDeFormaPago, type FormaPagoLike } from "./formasPago.js";

const EFECTIVO: FormaPagoLike = { _id: "f1", name: "Efectivo", externalId: "EFECTIVO", activo: true, orden: 1 };
const TRANSFERENCIA: FormaPagoLike = { _id: "f2", name: "Transferencia bancaria", externalId: "TRANSFERENCIA_BANCARIA", requiereDatosBancarios: true, activo: true, orden: 2 };
const CHEQUE: FormaPagoLike = { _id: "f3", name: "Cheque", externalId: "CHEQUE", requiereComprobante: true, activo: false, orden: 3 };
const COMPENSACION: FormaPagoLike = { _id: "f5", name: "Compensación / Intercambio", externalId: "COMPENSACION_INTERCAMBIO", activo: true, orden: 5 };
const TODAS = [COMPENSACION, CHEQUE, TRANSFERENCIA, EFECTIVO];

describe("código", () => {
  it("se arma del nombre: mayúsculas, sin tildes ni espacios", () => {
    assert.equal(codigoDesdeNombre("Transferencia bancaria"), "TRANSFERENCIA_BANCARIA");
    assert.equal(codigoDesdeNombre("Compensación / Intercambio"), "COMPENSACION_INTERCAMBIO");
    assert.equal(codigoDesdeNombre("  Billetera virtual "), "BILLETERA_VIRTUAL");
  });
  it("valida largo del nombre, forma del código y largo de la descripción", () => {
    assert.match(errorDeCampos({ nombre: "Ef" }) || "", /entre 3 y 50/);
    assert.match(errorDeCampos({ nombre: "x".repeat(51) }) || "", /entre 3 y 50/);
    assert.match(errorDeCampos({ codigo: "con espacio" }) || "", /mayúsculas/);
    assert.match(errorDeCampos({ descripcion: "x".repeat(201) }) || "", /200/);
    assert.equal(errorDeCampos({ nombre: "Efectivo", codigo: "EFECTIVO", descripcion: "" }), null);
    // Edición parcial (sólo el interruptor): no se valida lo que no vino.
    assert.equal(errorDeCampos({}), null);
  });
});

describe("unicidad", () => {
  it("el nombre se repite sin importar mayúsculas ni tildes", () => {
    assert.match(conflictoDeUnicidad(TODAS, { nombre: "EFECTIVO" }) || "", /Ya existe.*Efectivo/);
    assert.match(conflictoDeUnicidad(TODAS, { nombre: "compensacion / intercambio" }) || "", /Ya existe/);
  });
  it("el código se repite aunque el nombre sea otro", () => {
    assert.match(conflictoDeUnicidad(TODAS, { nombre: "Contado", codigo: "EFECTIVO" }) || "", /código EFECTIVO ya lo usa «Efectivo»/);
  });
  it("editar un registro no choca consigo mismo", () => {
    assert.equal(conflictoDeUnicidad(TODAS, { nombre: "Efectivo", codigo: "EFECTIVO" }, "f1"), null);
    assert.match(conflictoDeUnicidad(TODAS, { nombre: "Cheque" }, "f1") || "", /Ya existe/);
  });
  it("lo nuevo pasa", () => {
    assert.equal(conflictoDeUnicidad(TODAS, { nombre: "Billetera virtual", codigo: "BILLETERA_VIRTUAL" }), null);
  });
});

describe("borrado con uso", () => {
  it("con contratos o tipos asociados se rechaza diciendo cuántos y sugiriendo desactivar", () => {
    const m = motivoParaNoBorrar("Efectivo", { contratos: 12, tipos: 1 }) || "";
    assert.match(m, /12 contratos y 1 tipo de contrato/);
    assert.match(m, /Desactivala/);
    assert.match(motivoParaNoBorrar("Cheque", { contratos: 1, tipos: 0 }) || "", /la usan 1 contrato\./);
    assert.match(motivoParaNoBorrar("Cheque", { contratos: 0, tipos: 3 }) || "", /3 tipos de contrato/);
  });
  it("sin uso registrado se puede borrar", () => {
    assert.equal(motivoParaNoBorrar("Efectivo", { contratos: 0, tipos: 0 }), null);
  });
});

describe("las formas de un tipo de contrato", () => {
  it("la predeterminada tiene que estar habilitada: si no, se limpia", () => {
    assert.deepEqual(normalizarFormasDelTipo(["f1", "f2", "f1"], "f2"), { formasPagoIds: ["f1", "f2"], formaPagoDefaultId: "f2" });
    assert.deepEqual(normalizarFormasDelTipo(["f1"], "f2"), { formasPagoIds: ["f1"], formaPagoDefaultId: null });
    assert.deepEqual(normalizarFormasDelTipo(undefined, "f2"), { formasPagoIds: [], formaPagoDefaultId: null });
  });
});

describe("selector de forma de pago por tipo de contrato", () => {
  it("el tipo acota: sólo sus habilitadas activas, con la predeterminada precargada", () => {
    const r = formasParaSelector(TODAS, { formasPagoIds: ["f5"], formaPagoDefaultId: "f5" });
    assert.deepEqual(r.opciones.map((f) => f._id), ["f5"]);
    assert.equal(r.predeterminada, "f5");
    assert.equal(r.restringido, true);
  });
  it("una habilitada inactiva no se ofrece", () => {
    const r = formasParaSelector(TODAS, { formasPagoIds: ["f1", "f3"], formaPagoDefaultId: "f3" });
    assert.deepEqual(r.opciones.map((f) => f._id), ["f1"]);
    assert.equal(r.predeterminada, null);
  });
  it("sin habilitadas: todas las activas, en orden, sin predeterminada", () => {
    const r = formasParaSelector(TODAS, { formasPagoIds: [] });
    assert.deepEqual(r.opciones.map((f) => f._id), ["f1", "f2", "f5"]);
    assert.equal(r.predeterminada, null);
    assert.equal(r.restringido, false);
    assert.deepEqual(formasParaSelector(TODAS, null).opciones.map((f) => f._id), ["f1", "f2", "f5"]);
  });
  it("la que el contrato ya tiene se conserva aunque esté inactiva o fuera del tipo", () => {
    assert.deepEqual(formasParaSelector(TODAS, { formasPagoIds: ["f5"] }, "f3").opciones.map((f) => f._id), ["f3", "f5"]);
  });
});

describe("guardar un contrato con forma de pago", () => {
  const tipo = { formasPagoIds: ["f1", "f2"] };
  const conBanco = { cbu: "0000003100010000000001", bancoId: 7 };
  it("rechaza una forma que el tipo no habilita o que está inactiva", () => {
    assert.match(rechazoDeFormaPago({ forma: COMPENSACION, tipo, metadata: conBanco }) || "", /no habilita/);
    assert.match(rechazoDeFormaPago({ forma: CHEQUE, tipo: null }) || "", /inactiva/);
  });
  it("transferencia exige CBU/alias y entidad financiera", () => {
    assert.match(rechazoDeFormaPago({ forma: TRANSFERENCIA, tipo, metadata: {} }) || "", /CBU o alias y entidad financiera/);
    assert.match(rechazoDeFormaPago({ forma: TRANSFERENCIA, tipo, metadata: { aliasBancario: "mi.alias" } }) || "", /le falta: entidad financiera/);
    assert.equal(rechazoDeFormaPago({ forma: TRANSFERENCIA, tipo, metadata: { aliasBancario: "mi.alias", bancoId: 7 } }), null);
  });
  it("la forma que el contrato ya tenía no se vuelve a juzgar", () => {
    assert.equal(rechazoDeFormaPago({ forma: CHEQUE, tipo, previaId: "f3" }), null);
  });
});
