/**
 *   npx tsx --test src/compartido/areaTurno.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { claveAreaTurno, partirClaveAreaTurno, claveFilaArea, sedeEnArea, clavesDelMiembro, sedeDe } from "./areaTurno.js";
describe("la clave de área × turno × sede", () => {
    it("sin sede es la de siempre", () => {
        assert.equal(claveAreaTurno({ areaId: "A", shiftId: "T" }), "A::T");
        assert.equal(claveAreaTurno({ areaId: { _id: "A" }, shiftId: { _id: "T" }, sedeId: null }), "A::T");
        assert.equal(claveAreaTurno({ areaId: "A", shiftId: "T", sedeId: 0 }), "A::T");
    });
    it("con sede suma ::s<id>, y se parte de vuelta", () => {
        assert.equal(claveAreaTurno({ areaId: "A", shiftId: "T", sedeId: 12 }), "A::T::s12");
        assert.deepEqual(partirClaveAreaTurno("A::T::s12"), { areaId: "A", shiftId: "T", sedeId: 12 });
        assert.deepEqual(partirClaveAreaTurno("A::T"), { areaId: "A", shiftId: "T", sedeId: null });
    });
    it("la fila de área (sin turno)", () => {
        assert.equal(claveFilaArea({ areaId: "A" }), "A");
        assert.equal(claveFilaArea({ areaId: "A", sedeId: "3" }), "A::s3");
        assert.equal(sedeDe("x"), null);
    });
});
describe("en qué sede del área cae una persona", () => {
    const conDos = [
        { areaId: "ED", shiftIds: ["M"], sedeId: 1 },
        { areaId: "ED", shiftIds: ["M"], sedeId: 2 },
    ];
    it("la asignación con sede manda", () => {
        assert.equal(sedeEnArea(conDos, "ED", 2, 1), 2);
    });
    it("si no, la sede del contrato cuando el área existe en esa sede", () => {
        assert.equal(sedeEnArea(conDos, "ED", null, 1), 1);
        assert.equal(sedeEnArea(conDos, "ED", null, 2), 2);
    });
    it("contrato en otra sede: la fila sin sede si hay; si el área tiene una sola fila, esa; si no, ninguna", () => {
        assert.equal(sedeEnArea([...conDos, { areaId: "ED", shiftIds: ["M"] }], "ED", null, 9), null);
        assert.equal(sedeEnArea([{ areaId: "ED", shiftIds: ["M"], sedeId: 2 }], "ED", null, 9), 2);
        assert.equal(sedeEnArea(conDos, "ED", null, 9), null);
    });
    it("un proyecto sin sedes por área no cambia nada", () => {
        assert.equal(sedeEnArea([{ areaId: "ED", shiftIds: ["M"] }], "ED", null, 1), null);
        assert.deepEqual([...clavesDelMiembro([{ areaId: "ED", shiftIds: ["M", "T"] }], { areasConfig: [{ areaId: "ED", shiftIds: ["M", "T"] }], sedeContrato: 1 })], ["ED::M", "ED::T"]);
    });
    it("las claves del miembro llevan su sede", () => {
        assert.deepEqual([...clavesDelMiembro([{ areaId: "ED", shiftIds: ["M"] }], { areasConfig: conDos, sedeContrato: 2 })], ["ED::M::s2"]);
        assert.deepEqual([...clavesDelMiembro([{ areaId: "ED", shiftIds: ["M"], sedeId: 1 }])], ["ED::M::s1"]);
    });
});
