import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { superponerContratos, filaSegunContratos } from "./equipoSegunContratos.js";
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
