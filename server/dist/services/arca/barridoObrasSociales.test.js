import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planBarrido } from "./barridoObrasSociales.js";
const E1 = "e1";
const E2 = "e2";
const A = "20111111112";
const B = "27222222223";
const HORA = 60 * 60_000;
describe("el plan del barrido de obras sociales", () => {
    it("agrupa por empleadora, un CUIL por empleadora", () => {
        const p = planBarrido([
            { cuil: A, empresaId: E1 },
            { cuil: "20-11111111-2", empresaId: E1 },
            { cuil: B, empresaId: E1 },
            { cuil: A, empresaId: E2 },
        ], new Map(), 0, HORA);
        assert.deepEqual(p.grupos, [
            { empresaId: E1, cuils: [A, B] },
            { empresaId: E2, cuils: [A] },
        ]);
        assert.equal(p.esperando, 0);
    });
    it("no insiste con quien se intentó hace poco; sí con quien ya pasó el plazo", () => {
        const ahora = 10 * HORA;
        const ultimo = new Map([
            [A, ahora - 10 * 60_000],
            [B, ahora - 2 * HORA],
        ]);
        const p = planBarrido([{ cuil: A, empresaId: E1 }, { cuil: B, empresaId: E1 }], ultimo, ahora, HORA);
        assert.deepEqual(p.grupos, [{ empresaId: E1, cuils: [B] }]);
        assert.equal(p.esperando, 1);
    });
    it("CUIL inválido o sin empleadora quedan afuera", () => {
        const p = planBarrido([{ cuil: "123", empresaId: E1 }, { cuil: A, empresaId: "" }], new Map(), 0, HORA);
        assert.deepEqual(p.grupos, []);
    });
});
