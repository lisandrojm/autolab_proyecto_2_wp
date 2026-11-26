/**
 *   npx tsx --test src/compartido/areaTurno.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { claveAreaTurno, partirClaveAreaTurno, claveFilaArea, sedeEnArea, clavesDelMiembro, sedeDe, pendientesDeSede, sedeParaGuardar, sedePrincipalDe, cambiarTurnoEnFila } from "./areaTurno.js";

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

describe("en qué fila (sede) del área está una persona: explícito", () => {
  const conDos = [
    { areaId: "ED", shiftIds: ["M"] }, // la principal (sede 1), sin sede
    { areaId: "ED", shiftIds: ["M"], sedeId: 2 },
  ];
  it("un área con una sola fila toma a todos, como siempre", () => {
    assert.equal(sedeEnArea([{ areaId: "ED", shiftIds: ["M"] }], "ED", null, 1), null);
    assert.equal(sedeEnArea([{ areaId: "ED", shiftIds: ["M"] }], "ED", 1, 1), null);
    assert.equal(sedeEnArea([{ areaId: "ED", shiftIds: ["M"], sedeId: 2 }], "ED", null, 1), 2);
    assert.deepEqual([...clavesDelMiembro([{ areaId: "ED", shiftIds: ["M", "T"], sedeId: 1 }], { areasConfig: [{ areaId: "ED", shiftIds: ["M", "T"] }], sedePrincipal: 1 })], ["ED::M", "ED::T"]);
  });
  it("varias filas: manda la sede de la asignación; la principal cae en la fila sin sede", () => {
    assert.equal(sedeEnArea(conDos, "ED", 2, 1), 2);
    assert.equal(sedeEnArea(conDos, "ED", 1, 1), null);
  });
  it("varias filas sin sede elegida, o con una que el área no tiene: falta elegir sede", () => {
    assert.equal(sedeEnArea(conDos, "ED", null, 1), undefined);
    assert.equal(sedeEnArea(conDos, "ED", 9, 1), undefined);
    assert.deepEqual([...clavesDelMiembro([{ areaId: "ED", shiftIds: ["M"] }], { areasConfig: conDos, sedePrincipal: 1 })], []);
    assert.deepEqual(pendientesDeSede([{ areaId: "ED", shiftIds: ["M"] }], { areasConfig: conDos, sedePrincipal: 1 }), ["ED"]);
    assert.deepEqual(pendientesDeSede([{ areaId: "ED", shiftIds: ["M"], sedeId: 2 }], { areasConfig: conDos, sedePrincipal: 1 }), []);
  });
  it("qué sede se guarda al elegir una fila", () => {
    assert.equal(sedeParaGuardar(conDos, "ED", 2, 1), 2);
    assert.equal(sedeParaGuardar(conDos, "ED", null, 1), 1);
    assert.equal(sedeParaGuardar([{ areaId: "ED", shiftIds: ["M"] }], "ED", null, 1), undefined);
    assert.equal(sedePrincipalDe({ sedeIds: [3, 4] }), 3);
    assert.equal(sedePrincipalDe({ sedeId: 5 }), 5);
  });
  it("sin contexto, la sede de la asignación tal cual", () => {
    assert.deepEqual([...clavesDelMiembro([{ areaId: "ED", shiftIds: ["M"], sedeId: 1 }])], ["ED::M::s1"]);
  });
});

describe("cambiar de turno dentro de la fila (Equipos en la app)", () => {
  const unaFila = { areasConfig: [{ areaId: "A", shiftIds: ["M", "T", "N"] }, { areaId: "B", shiftIds: ["M"] }], sedePrincipal: 1 };

  it("saca el turno viejo, pone el nuevo y no toca las otras áreas", () => {
    const r = cambiarTurnoEnFila([{ areaId: "A", shiftIds: ["M"] }, { areaId: "B", shiftIds: ["M"] }], { areaId: "A", sedeId: null, deShiftId: "M", aShiftId: "N" }, unaFila);
    assert.deepEqual(r, [{ areaId: "A", shiftIds: ["N"] }, { areaId: "B", shiftIds: ["M"] }]);
  });
  it("con dos turnos en la fila se queda con el otro más el nuevo, sin repetir", () => {
    const r = cambiarTurnoEnFila([{ areaId: "A", shiftIds: ["M", "T"] }], { areaId: "A", sedeId: null, deShiftId: "M", aShiftId: "T" }, unaFila);
    assert.deepEqual(r, [{ areaId: "A", shiftIds: ["T"] }]);
  });
  it("si la persona no está en ese turno, null (la lista quedó vieja)", () => {
    assert.equal(cambiarTurnoEnFila([{ areaId: "A", shiftIds: ["T"] }], { areaId: "A", sedeId: null, deShiftId: "M", aShiftId: "N" }, unaFila), null);
    assert.equal(cambiarTurnoEnFila([], { areaId: "A", sedeId: null, deShiftId: "M", aShiftId: "N" }, unaFila), null);
  });
  it("en un área con varias sedes mueve sólo la fila de esa sede y guarda la sede", () => {
    const ctx = { areasConfig: [{ areaId: "A", shiftIds: ["M", "T"] }, { areaId: "A", sedeId: 2, shiftIds: ["M", "T"] }], sedePrincipal: 1 };
    // La fila sin sede es la principal: una asignación con sede 1 está ahí, y al moverla conserva su sede.
    assert.deepEqual(cambiarTurnoEnFila([{ areaId: "A", shiftIds: ["M"], sedeId: 1 }], { areaId: "A", sedeId: null, deShiftId: "M", aShiftId: "T" }, ctx), [{ areaId: "A", shiftIds: ["T"], sedeId: 1 }]);
    // La de la sede 2 no es la fila pedida (null): nada que mover.
    assert.equal(cambiarTurnoEnFila([{ areaId: "A", shiftIds: ["M"], sedeId: 2 }], { areaId: "A", sedeId: null, deShiftId: "M", aShiftId: "T" }, ctx), null);
    assert.deepEqual(cambiarTurnoEnFila([{ areaId: "A", shiftIds: ["M"], sedeId: 2 }], { areaId: "A", sedeId: 2, deShiftId: "M", aShiftId: "T" }, ctx), [{ areaId: "A", shiftIds: ["T"], sedeId: 2 }]);
  });
  it("acepta ids poblados y ObjectId-like", () => {
    const r = cambiarTurnoEnFila([{ areaId: { _id: "A" }, shiftIds: [{ _id: "M" }] }], { areaId: "A", sedeId: null, deShiftId: { _id: "M" }, aShiftId: "N" }, unaFila);
    assert.deepEqual(r, [{ areaId: "A", shiftIds: ["N"] }]);
  });
});
