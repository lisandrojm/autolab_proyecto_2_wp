import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { superponerContratos, filaSegunContratos, areasDelContrato, repartirAreas, unirAreas, turnosPorContrato } from "./equipoSegunContratos.js";
import { clavesDelMiembro } from "../compartido/areaTurno.js";
const TECNICA = "64a000000000000000000001";
const MANANA = "64b000000000000000000001";
const TARDE = "64b000000000000000000002";
describe("el área del equipo se lee del contrato que rige", () => {
    it("equipo «Tarde», contrato «Mañana · sede 3» → Mañana con su sede; el resto de la fila se conserva", () => {
        const equipo = [{ userId: "u1", canRegister: false, startTime: "10:30", areaShiftAssignments: [{ areaId: TECNICA, shiftIds: [TARDE] }], areaId: TECNICA, shiftId: TARDE }];
        const [fila] = superponerContratos(equipo, new Map([["u1", { areaShiftAssignments: [{ areaId: TECNICA, shiftIds: [MANANA], sedeId: 3 }] }]]));
        assert.deepEqual(fila.areaShiftAssignments, [{ areaId: TECNICA, shiftIds: [MANANA], sedeId: 3 }]);
        assert.equal(fila.shiftId, MANANA);
        assert.equal(fila.canRegister, false);
        assert.equal(fila.startTime, "10:30");
        // El original no se toca.
        assert.equal(equipo[0].shiftId, TARDE);
    });
    it("contrato viejo con sólo areaId/shiftId → una fila con ésos", () => {
        const [fila] = superponerContratos([{ userId: "u1", areaShiftAssignments: [] }], new Map([["u1", { areaId: TECNICA, shiftId: MANANA }]]));
        assert.deepEqual(fila.areaShiftAssignments, [{ areaId: TECNICA, shiftIds: [MANANA] }]);
    });
    it("contrato sin área, o sin contrato → queda la fila del equipo", () => {
        const equipo = [{ userId: "u1", areaShiftAssignments: [{ areaId: TECNICA, shiftIds: [TARDE] }] }, { userId: "u2", areaShiftAssignments: [{ areaId: TECNICA, shiftIds: [TARDE] }] }];
        const filas = superponerContratos(equipo, new Map([["u1", { areaShiftAssignments: [] }]]));
        assert.deepEqual(filas, equipo);
    });
    it("con contrato y sin fila en el equipo → se le arma la fila", () => {
        const filas = superponerContratos([], new Map([["u9", { areaShiftAssignments: [{ areaId: TECNICA, shiftIds: [MANANA] }] }]]));
        assert.equal(filas.length, 1);
        assert.equal(filas[0].userId, "u9");
        assert.equal(filas[0].canRegister, true);
    });
    it("la ficha de una persona: entre sus contratos manda el que rige hoy", () => {
        const fila = filaSegunContratos({ userId: "u1", areaShiftAssignments: [{ areaId: TECNICA, shiftIds: [TARDE] }] }, [
            { fecha_alta_contrato: "2020-01-01", fecha_baja_contrato: "2020-01-31", areaShiftAssignments: [{ areaId: TECNICA, shiftIds: [TARDE] }] },
            { fecha_alta_contrato: "2020-02-01", fecha_baja_contrato: "", areaShiftAssignments: [{ areaId: TECNICA, shiftIds: [MANANA] }] },
        ]);
        assert.deepEqual(fila.areaShiftAssignments, [{ areaId: TECNICA, shiftIds: [MANANA] }]);
    });
});
/*
  El caso que lo pidió (14/11/2026): un plazo fijo a la Mañana y, vigente a la vez, un Servicios Adicional a
  la Tarde. Regía el último cargado y la persona desaparecía de la Mañana.
*/
describe("varios contratos vigentes a la vez: el área del equipo es la suma", () => {
    const EDICION = "64a000000000000000000002";
    const NOCHE = "64b000000000000000000003";
    const plazoFijo = { _indice: 0, fecha_alta_contrato: "2026-11-01", fecha_baja_contrato: "2026-11-30", areaShiftAssignments: [{ areaId: TECNICA, shiftIds: [MANANA], sedeId: 1 }] };
    const adicional = { _indice: 1, fecha_alta_contrato: "2026-11-01", fecha_baja_contrato: "2026-11-23", areaShiftAssignments: [{ areaId: TECNICA, shiftIds: [TARDE], sedeId: 1 }] };
    const rige = { ...adicional, _vigentes: [plazoFijo, adicional] };
    it("Mañana en un contrato y Tarde en el otro → los dos turnos, en una fila; primero el del que rige", () => {
        assert.deepEqual(areasDelContrato(rige), [{ areaId: TECNICA, shiftIds: [TARDE, MANANA], sedeId: 1 }]);
        const [fila] = superponerContratos([{ userId: "u1", canRegister: false, areaShiftAssignments: [{ areaId: TECNICA, shiftIds: [TARDE] }] }], new Map([["u1", rige]]));
        assert.deepEqual(fila.areaShiftAssignments, [{ areaId: TECNICA, shiftIds: [TARDE, MANANA], sedeId: 1 }]);
        assert.equal(fila.shiftId, TARDE);
        assert.equal(fila.canRegister, false);
    });
    it("un solo vigente (sin `_vigentes`) → el que rige, tal cual: no cambia nada", () => {
        assert.deepEqual(areasDelContrato(adicional), adicional.areaShiftAssignments);
        assert.equal(areasDelContrato({ areaShiftAssignments: [] }), null);
    });
    it("los dos dicen lo mismo → una sola vez; áreas o sedes distintas → una fila cada una", () => {
        assert.deepEqual(unirAreas([plazoFijo.areaShiftAssignments, plazoFijo.areaShiftAssignments]), plazoFijo.areaShiftAssignments);
        assert.deepEqual(unirAreas([[{ areaId: TECNICA, shiftIds: [MANANA], sedeId: 1 }], [{ areaId: TECNICA, shiftIds: [MANANA], sedeId: 2 }, { areaId: EDICION, shiftIds: [MANANA] }]]).length, 3);
    });
    it("uno de los vigentes no tiene área → cuentan los que sí; ninguno tiene → queda la fila del equipo", () => {
        assert.deepEqual(areasDelContrato({ ...adicional, _vigentes: [{ _indice: 0 }, adicional] }), adicional.areaShiftAssignments);
        assert.equal(areasDelContrato({ _indice: 1, _vigentes: [{ _indice: 0 }, { _indice: 1 }] }), null);
    });
    it("la ficha de una persona: dos vigentes hoy se suman; el vencido no cuenta", () => {
        const fila = filaSegunContratos({ userId: "u1", areaShiftAssignments: [] }, [{ fecha_alta_contrato: "2026-10-01", fecha_baja_contrato: "2026-10-31", areaShiftAssignments: [{ areaId: EDICION, shiftIds: [NOCHE] }] }, plazoFijo, adicional], "2026-11-14");
        assert.deepEqual(fila.areaShiftAssignments, [{ areaId: TECNICA, shiftIds: [TARDE, MANANA], sedeId: 1 }]);
        // El 24/11 el adicional ya venció: queda sólo el plazo fijo.
        assert.deepEqual(filaSegunContratos({ userId: "u1" }, [plazoFijo, adicional], "2026-11-24").areaShiftAssignments, plazoFijo.areaShiftAssignments);
    });
    // Del equipo a los contratos: [0] es el que rige (Tarde), [1] el otro (Mañana).
    const vigentes = [adicional.areaShiftAssignments, plazoFijo.areaShiftAssignments];
    const fila = (areaId, shiftIds, sedeId = 1) => ({ areaId, shiftIds, sedeId });
    it("cambiar la Tarde por la Noche → la Noche va al que rige; el de la Mañana no se toca", () => {
        assert.deepEqual(repartirAreas([fila(TECNICA, [MANANA, NOCHE])], vigentes, 0), [[fila(TECNICA, [NOCHE])], [fila(TECNICA, [MANANA])]]);
    });
    it("sumar un área nueva → al que rige; cada uno conserva lo suyo", () => {
        assert.deepEqual(repartirAreas([fila(TECNICA, [TARDE, MANANA]), fila(EDICION, [NOCHE])], vigentes, 0), [[fila(TECNICA, [TARDE]), fila(EDICION, [NOCHE])], [fila(TECNICA, [MANANA])]]);
    });
    it("sacarlo de la Mañana → el contrato de la Mañana pasa a decir lo del que rige (no queda «sin área» ni sigue en la Mañana)", () => {
        assert.deepEqual(repartirAreas([fila(TECNICA, [TARDE])], vigentes, 0), [[fila(TECNICA, [TARDE])], [fila(TECNICA, [TARDE])]]);
    });
    it("cambiar sólo la sede («Pasar todos a…») → cada contrato conserva su turno, con la sede nueva", () => {
        assert.deepEqual(repartirAreas([fila(TECNICA, [TARDE, MANANA], 2)], vigentes, 0), [[fila(TECNICA, [TARDE], 2)], [fila(TECNICA, [MANANA], 2)]]);
    });
    it("dos contratos con la misma área, se lo mueve a otra → los dos dicen la nueva", () => {
        assert.deepEqual(repartirAreas([fila(EDICION, [MANANA])], [[fila(TECNICA, [MANANA])], [fila(TECNICA, [MANANA])]], 0), [[fila(EDICION, [MANANA])], [fila(EDICION, [MANANA])]]);
    });
    it("un vigente sin área cargada se deja como está; sacarlo de todo vacía a los que tenían", () => {
        assert.deepEqual(repartirAreas([fila(TECNICA, [NOCHE])], [adicional.areaShiftAssignments, []], 0), [[fila(TECNICA, [NOCHE])], []]);
        assert.deepEqual(repartirAreas([], vigentes, 0), [[], []]);
    });
    it("lo repartido, sumado, es exactamente lo pedido", () => {
        const pedido = [fila(TECNICA, [MANANA, NOCHE]), fila(EDICION, [TARDE], 2)];
        const firma = (filas) => filas.flatMap((x) => x.shiftIds.map((t) => `${x.areaId}|${t}|${x.sedeId}`)).sort();
        assert.deepEqual(firma(unirAreas(repartirAreas(pedido, vigentes, 0))), firma(pedido));
    });
});
// El reporte de asistencia lista a la persona una vez por contrato, y Equipos muestra en cada turno el suyo.
describe("qué turnos pone cada contrato vigente", () => {
    const claves = (filas) => clavesDelMiembro(filas);
    const plazoFijo = { _indice: 0, nombre_contrato: "Plazo fijo 6x6", nombre_estado_empleado: "Firma enviada", fecha_alta_contrato: "2026-11-01", fecha_baja_contrato: "2026-11-30", hora_inicio: "06:00", hora_fin: "12:00", areaShiftAssignments: [{ areaId: TECNICA, shiftIds: [MANANA], sedeId: 1 }] };
    const adicional = { _indice: 1, nombre_contrato: "Servicios Adicional", nombre_estado_empleado: "Disponible", fecha_alta_contrato: "2026-11-01", fecha_baja_contrato: "2026-11-23", hora_inicio: "12:00", hora_fin: "18:00", areaShiftAssignments: [{ areaId: TECNICA, shiftIds: [TARDE], sedeId: 1 }] };
    it("Mañana con el plazo fijo y Tarde con el adicional → uno por contrato, con su horario; primero el que rige", () => {
        const r = turnosPorContrato({ ...adicional, _vigentes: [plazoFijo, adicional] }, claves);
        assert.deepEqual(r.map((c) => [c.nombreContrato, c.claves, c.horaInicio, c.horaFin]), [
            ["Servicios Adicional", [`${TECNICA}::${TARDE}::s1`], "12:00", "18:00"],
            ["Plazo fijo 6x6", [`${TECNICA}::${MANANA}::s1`], "06:00", "12:00"],
        ]);
        assert.equal(r[1].estadoContrato, "Firma enviada");
        assert.equal(r[1].fechaBaja, "2026-11-30");
    });
    it("un solo vigente, o dos que dicen el mismo turno → nada que separar: va una vez, como siempre", () => {
        assert.equal(turnosPorContrato(adicional, claves), null);
        assert.equal(turnosPorContrato({ ...adicional, _vigentes: [{ ...plazoFijo, areaShiftAssignments: adicional.areaShiftAssignments }, adicional] }, claves), null);
    });
    it("un vigente sin área no cuenta", () => {
        assert.equal(turnosPorContrato({ ...adicional, _vigentes: [{ _indice: 0, nombre_contrato: "Viejo" }, adicional] }, claves), null);
    });
});
