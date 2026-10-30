import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rolesTrasAprobarPedido } from "./personalDataFields.js";
describe("roles de la ficha al aprobar un pedido de datos personales", () => {
    it("aplica sólo lo que el pedido cambió y conserva lo agregado después", () => {
        // Al pedir tenía A y B; pidió A y C (sacó B, agregó C). Después le agregaron D.
        assert.deepEqual(rolesTrasAprobarPedido(["A", "B", "D"], ["A", "B"], ["A", "C"]).sort(), ["A", "C", "D"]);
    });
    it("sin la foto del momento (pedido viejo) sólo agrega", () => {
        assert.deepEqual(rolesTrasAprobarPedido(["A", "D"], undefined, ["C"]).sort(), ["A", "C", "D"]);
    });
    it("acepta refs como objeto", () => {
        assert.deepEqual(rolesTrasAprobarPedido([{ _id: "A" }], ["A"], []), []);
    });
});
