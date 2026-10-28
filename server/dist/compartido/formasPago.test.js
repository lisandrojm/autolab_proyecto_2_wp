/**
 *   npx tsx --test src/compartido/formasPago.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { codigoDesdeNombre, conflictoDeUnicidad, errorDeCampos, formasDelTipo, motivoParaNoBorrar, normalizarFormasDelTipo, rechazoPorDatosBancarios } from "./formasPago.js";
const EFECTIVO = { _id: "f1", name: "Efectivo", externalId: "EFECTIVO", activo: true, orden: 1 };
const TRANSFERENCIA = { _id: "f2", name: "Transferencia bancaria", externalId: "TRANSFERENCIA_BANCARIA", requiereDatosBancarios: true, activo: true, orden: 2 };
const CHEQUE = { _id: "f3", name: "Cheque", externalId: "CHEQUE", requiereComprobante: true, activo: false, orden: 3 };
const COMPENSACION = { _id: "f5", name: "Compensación / Intercambio", externalId: "COMPENSACION_INTERCAMBIO", activo: true, orden: 5 };
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
describe("las formas de pago salen del tipo de contrato", () => {
    it("una o varias, en el orden del catálogo", () => {
        assert.deepEqual(formasDelTipo(TODAS, { formasPagoIds: ["f5"] }).map((f) => f._id), ["f5"]);
        assert.deepEqual(formasDelTipo(TODAS, { formasPagoIds: ["f5", "f1", "f2"] }).map((f) => f._id), ["f1", "f2", "f5"]);
        assert.deepEqual(formasDelTipo(TODAS, null), []);
    });
});
describe("alta con formas que piden datos bancarios", () => {
    it("sólo transferencia: exige CBU/alias y entidad financiera", () => {
        assert.match(rechazoPorDatosBancarios([TRANSFERENCIA], {}) || "", /CBU o alias y entidad financiera/);
        assert.match(rechazoPorDatosBancarios([TRANSFERENCIA], { aliasBancario: "mi.alias" }) || "", /le falta: entidad financiera/);
        assert.equal(rechazoPorDatosBancarios([TRANSFERENCIA], { aliasBancario: "mi.alias", bancoId: 7 }), null);
    });
    it("con otra forma que no los pide, o sin formas, no frena", () => {
        assert.equal(rechazoPorDatosBancarios([TRANSFERENCIA, EFECTIVO], {}), null);
        assert.equal(rechazoPorDatosBancarios([], {}), null);
    });
});
