import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diferenciasConElEquipo, filaDelEquipoTrasGuardar, firmaDeAreas, horarioAlElegirTurno, queActualizarDelEquipo, rolDelEquipoTrasGuardar } from "./configDelEquipo.js";

const AREA = "64a000000000000000000001";
const OTRA_AREA = "64a000000000000000000002";
const TURNO_TARDE = "64b000000000000000000001";
const TURNO_NOCHE = "64b000000000000000000002";

// El miembro: en el equipo, área A turno tarde con horario propio y sin permiso de registrar; rol de la tabla «Peinador».
const filaEquipo = { userId: "u1", canRegister: false, useProjectSchedule: false, startTime: "10:30", endTime: "19:15", areaShiftAssignments: [{ areaId: AREA, shiftIds: [TURNO_TARDE] }] };
const rolEquipo = "Peinador";

describe("6. regresión: «Configurar Miembro» y guardar SIN tocar nada", () => {
  it("con el contrato que rige = una jornada con otro rol que la ficha, no cambia el equipo, ni el rol, ni el horario", () => {
    // Lo que precarga el wizard: rol del contrato que se edita (Maquillador, id 7) y el área del equipo.
    const precarga = { rolFrameId: "7", areas: firmaDeAreas([{ areaId: AREA, shiftIds: [TURNO_TARDE] }]) };
    const ahora = { ...precarga }; // no se tocó nada
    const que = queActualizarDelEquipo({ nuevoEnElEquipo: false, contratoNuevo: false, editaElQueRige: true, precarga, ahora });
    assert.deepEqual(que, { areas: false, rol: false });
    // El server con ese pedido: la fila del equipo y el rol de la tabla quedan idénticos.
    assert.equal(filaDelEquipoTrasGuardar(filaEquipo, { areaId: AREA, shiftId: TURNO_TARDE, areaShiftAssignments: [{ areaId: AREA, shiftIds: [TURNO_TARDE] }] }, que.areas), null);
    assert.equal(rolDelEquipoTrasGuardar(rolEquipo, "Maquillador", que.rol), null);
  });
  it("aunque el payload trajera otra área (precarga vieja), sin pedido explícito el server no la escribe", () => {
    assert.equal(filaDelEquipoTrasGuardar(filaEquipo, { areaShiftAssignments: [{ areaId: OTRA_AREA, shiftIds: [TURNO_NOCHE] }] }, undefined), null);
    assert.equal(rolDelEquipoTrasGuardar(rolEquipo, "Maquillador", undefined), null);
  });
  it("sin tocar el turno, el horario no se toca; elegir otro turno conserva un horario propio", () => {
    const turnoTarde = { startTime: "14:00", endTime: "22:00" };
    const turnoNoche = { startTime: "22:00", endTime: "06:00" };
    assert.equal(horarioAlElegirTurno({ horaInicio: "10:30", horaFin: "19:15", turnoAnterior: turnoTarde, turnoNuevo: turnoNoche }), null);
    // Con el horario del turno anterior (no propio), toma el del nuevo, como siempre.
    assert.deepEqual(horarioAlElegirTurno({ horaInicio: "14:00", horaFin: "22:00", turnoAnterior: turnoTarde, turnoNuevo: turnoNoche }), { hora_inicio: "22:00", hora_fin: "06:00" });
    // Sin turno anterior, lo completa el del turno elegido.
    assert.deepEqual(horarioAlElegirTurno({ horaInicio: "09:00", horaFin: "18:00", turnoAnterior: null, turnoNuevo: turnoNoche }), { hora_inicio: "22:00", hora_fin: "06:00" });
  });
});

describe("qué escribe un guardado en el equipo", () => {
  const precarga = { rolFrameId: "7", areas: firmaDeAreas([{ areaId: AREA, shiftIds: [TURNO_TARDE] }]) };
  const otraArea = firmaDeAreas([{ areaId: OTRA_AREA, shiftIds: [TURNO_NOCHE] }]);
  it("cambiar el área del contrato que rige actualiza sólo el área, y la fila conserva lo demás", () => {
    const que = queActualizarDelEquipo({ nuevoEnElEquipo: false, contratoNuevo: false, editaElQueRige: true, precarga, ahora: { rolFrameId: "7", areas: otraArea } });
    assert.deepEqual(que, { areas: true, rol: false });
    const fila: any = filaDelEquipoTrasGuardar(filaEquipo, { areaShiftAssignments: [{ areaId: OTRA_AREA, shiftIds: [TURNO_NOCHE] }] }, que.areas);
    assert.equal(fila.areaShiftAssignments[0].areaId, OTRA_AREA);
    assert.equal(fila.canRegister, false);
    assert.equal(fila.startTime, "10:30");
  });
  it("corregir una tarjeta vieja no toca el equipo", () => {
    assert.deepEqual(queActualizarDelEquipo({ nuevoEnElEquipo: false, contratoNuevo: false, editaElQueRige: false, precarga, ahora: { rolFrameId: "9", areas: otraArea } }), { areas: false, rol: false });
  });
  it("aprobar o renovar: sólo lo confirmado", () => {
    assert.deepEqual(queActualizarDelEquipo({ nuevoEnElEquipo: false, contratoNuevo: true, editaElQueRige: false, precarga: null, ahora: { rolFrameId: "9", areas: otraArea } }), { areas: false, rol: false });
    assert.deepEqual(queActualizarDelEquipo({ nuevoEnElEquipo: false, contratoNuevo: true, editaElQueRige: false, precarga: null, ahora: { rolFrameId: "9", areas: otraArea }, confirmado: { areas: true } }), { areas: true, rol: false });
  });
  it("alta en el equipo: todo; y lo que falta se completa sin pedirlo", () => {
    assert.deepEqual(queActualizarDelEquipo({ nuevoEnElEquipo: true, contratoNuevo: true, editaElQueRige: false, precarga: null, ahora: { rolFrameId: "9", areas: otraArea } }), { areas: true, rol: true });
    assert.ok(filaDelEquipoTrasGuardar({ userId: "u1", areaShiftAssignments: [] }, { areaShiftAssignments: [{ areaId: AREA, shiftIds: [TURNO_TARDE] }] }, false));
    assert.equal(rolDelEquipoTrasGuardar("Sin rol frame", "Maquillador", false), "Maquillador");
    assert.equal(rolDelEquipoTrasGuardar("", "Maquillador", false), "Maquillador");
  });
  it("las diferencias que se preguntan al aprobar", () => {
    assert.deepEqual(diferenciasConElEquipo({ areasEquipo: precarga.areas, areasContrato: otraArea, rolEquipo: "Peinador", rolContrato: "Maquillador" }), { areas: true, rol: true });
    assert.deepEqual(diferenciasConElEquipo({ areasEquipo: "[]", areasContrato: otraArea, rolEquipo: "-", rolContrato: "Maquillador" }), { areas: false, rol: false });
  });
  it("la firma no depende del orden ni de ids como objeto", () => {
    assert.equal(firmaDeAreas([{ areaId: { _id: AREA }, shiftIds: [TURNO_NOCHE, TURNO_TARDE] }]), firmaDeAreas([{ areaId: AREA, shiftIds: [TURNO_TARDE, { _id: TURNO_NOCHE }] }]));
  });
});

describe("fase 2: una sola regla para leer", () => {
  it("el rol de hoy: el del EQUIPO del proyecto donde rige el contrato, no el del contrato ni el de otro proyecto", async () => {
    const { rolDelMiembroHoy, rolDelMiembro } = await import("./configDelEquipo.js");
    const vinculos = [
      { nombre_rol_frame: "Peinador", contracts: [{ fecha_alta_contrato: "2026-10-30", fecha_baja_contrato: "2026-10-30", nombre_rol_frame: "Maquillador" }] },
      { nombre_rol_frame: "Asistente", contracts: [{ fecha_alta_contrato: "01/01/2026", fecha_baja_contrato: "31/12/2025", nombre_rol_frame: "Asistente" }] },
    ];
    assert.equal(rolDelMiembroHoy(vinculos, "2026-10-30"), "Peinador");
    // Terminada la jornada, no cambia a otro rol de contrato: queda el del equipo con rol.
    assert.equal(rolDelMiembroHoy(vinculos, "2026-11-02"), "Asistente");
    assert.equal(rolDelMiembro("Sin rol frame", "Maquillador"), "Maquillador");
  });
  it("las asignaciones: la fila del equipo aunque esté vacía; el contrato sólo sin fila", async () => {
    const { asignacionesDelMiembro } = await import("../utils/areaTurno.js");
    const contrato = { areaShiftAssignments: [{ areaId: AREA, shiftIds: [TURNO_TARDE] }] };
    assert.deepEqual(asignacionesDelMiembro({ areaShiftAssignments: [] }, contrato), []);
    assert.deepEqual(asignacionesDelMiembro(undefined, contrato), contrato.areaShiftAssignments);
  });
});
