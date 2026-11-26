/**
 *   npx tsx --test src/services/tiposDePedidoSistema.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rechazoAlBorrar, rechazoAlCrear, rechazoAlEditar, datosEditablesDeSistema } from "./tiposDePedidoSistema.js";
const sistema = { isSystem: true, categoryType: "cambio_turno", systemKey: "cambio_turno", config: { reglasCambioTurno: { diasAnticipacion: 3 } } };
const comun = { isSystem: false, categoryType: "fecha" };
describe("tipos de pedido de sistema: qué rechazan las rutas", () => {
    it("DELETE → 403 si es de sistema; un tipo común se borra", () => {
        assert.equal(rechazoAlBorrar(sistema)?.status, 403);
        assert.equal(rechazoAlBorrar(comun), null);
    });
    it("POST → 403 con isSystem, systemKey o tipo de dato cambio_turno", () => {
        assert.equal(rechazoAlCrear({ categoryType: "fecha", isSystem: true })?.status, 403);
        assert.equal(rechazoAlCrear({ categoryType: "otros", systemKey: "x" })?.status, 403);
        assert.equal(rechazoAlCrear({ categoryType: "cambio_turno" })?.status, 403);
        assert.equal(rechazoAlCrear({ categoryType: "fecha" }), null);
    });
    it("PUT de un tipo de sistema → 403 si cambia el tipo de dato, la clave o lo destilda; el resto pasa", () => {
        assert.equal(rechazoAlEditar(sistema, { categoryType: "fecha" })?.status, 403);
        assert.equal(rechazoAlEditar(sistema, { systemKey: "otra" })?.status, 403);
        assert.equal(rechazoAlEditar(sistema, { isSystem: false })?.status, 403);
        // Mandar el mismo tipo de dato (el form lo reenvía) no es un cambio.
        assert.equal(rechazoAlEditar(sistema, { categoryType: "cambio_turno" }), null);
        assert.equal(rechazoAlEditar(sistema, {}), null);
    });
    it("PUT de un tipo común → 403 si quiere volverse de sistema o tomar cambio_turno", () => {
        assert.equal(rechazoAlEditar(comun, { isSystem: true })?.status, 403);
        assert.equal(rechazoAlEditar(comun, { categoryType: "cambio_turno" })?.status, 403);
        assert.equal(rechazoAlEditar(comun, { categoryType: "dinero" }), null);
    });
    it("lo que se guarda de un tipo de sistema: sin isSystem/systemKey/categoryType y la config son sólo las reglas", () => {
        const r = datosEditablesDeSistema(sistema, { name: "Cambio de horario", isSystem: false, systemKey: "x", categoryType: "cambio_turno", config: { subtipos: [{ id: "a" }], reglasCambioTurno: { diasAnticipacion: 5, permitirTemporal: false, cupoMaximoPorTurno: 0 } } });
        assert.deepEqual(r, { name: "Cambio de horario", config: { reglasCambioTurno: { diasAnticipacion: 5, permitirTemporal: false, cupoMaximoPorTurno: null } } });
    });
});
