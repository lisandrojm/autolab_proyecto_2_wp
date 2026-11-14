import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filasPorContrato, idReal, novedadesASuFila } from "./filasPorContrato";

const PERSONA = "6a2eb9e66109de7346cca1ce";
const AREA = "696e0b00ee864e3d5ceec5a2";
const MANANA = "69d2f99b0b595a5123cc2894";
const TARDE = "69b76751f674acf80d873b18";
// Lo que manda el server para quien tiene un Servicios Adicional a la Tarde (el que rige) y un plazo fijo a la Mañana.
const porContrato = [
  { claves: [`${AREA}::${TARDE}`], nombreContrato: "Servicios Adicional", fechaAlta: "2026-11-01", horaInicio: "12:00", horaFin: "18:00" },
  { claves: [`${AREA}::${MANANA}`], nombreContrato: "Plazo fijo 6x6", fechaAlta: "2026-11-01", horaInicio: "06:00", horaFin: "12:00" },
];
const todo = () => true;
const sinTurnos = () => undefined;

describe("una fila por contrato en el reporte de asistencia", () => {
  it("«Todas las áreas»: una fila a la Tarde y otra a la Mañana, cada una con el horario de su contrato", () => {
    const filas = filasPorContrato(PERSONA, porContrato, todo, sinTurnos);
    assert.deepEqual(
      filas.map((f) => [f.id, f.turnoDeFila]),
      [
        [`${PERSONA}@${AREA}::${TARDE}`, { areaId: AREA, shiftId: TARDE, startTime: "12:00", endTime: "18:00" }],
        [`${PERSONA}@${AREA}::${MANANA}`, { areaId: AREA, shiftId: MANANA, startTime: "06:00", endTime: "12:00" }],
      ],
    );
    assert.equal(filas[1].contrato.nombreContrato, "Plazo fijo 6x6");
  });
  it("eligiendo sólo la Mañana: una fila, con el MISMO id que tenía en «Todas»", () => {
    const filas = filasPorContrato(PERSONA, porContrato, (k) => k.endsWith(MANANA), sinTurnos);
    assert.deepEqual(filas.map((f) => f.id), [`${PERSONA}@${AREA}::${MANANA}`]);
  });
  it("sin varios contratos (lo de siempre), o ninguno en lo que se reporta → [] y la persona va una vez", () => {
    assert.deepEqual(filasPorContrato(PERSONA, undefined, todo, sinTurnos), []);
    assert.deepEqual(filasPorContrato(PERSONA, [porContrato[0]], todo, sinTurnos), []);
    assert.deepEqual(filasPorContrato(PERSONA, porContrato, () => false, sinTurnos), []);
  });
  it("el contrato sin horario toma el del turno; con la sede en la clave, el turno se lee igual", () => {
    const [fila] = filasPorContrato(PERSONA, [{ claves: [`${AREA}::${MANANA}::s3`] }, porContrato[0]], todo, (id) => (id === MANANA ? { startTime: "07:00", endTime: "13:00" } : undefined));
    assert.deepEqual(fila.turnoDeFila, { areaId: AREA, shiftId: MANANA, startTime: "07:00", endTime: "13:00" });
    assert.equal(fila.id, `${PERSONA}@${AREA}::${MANANA}::s3`);
  });
  it("idReal: la persona, venga de una fila propia o no", () => {
    assert.equal(idReal(`${PERSONA}@${AREA}::${MANANA}`), PERSONA);
    assert.equal(idReal(PERSONA), PERSONA);
    assert.equal(idReal(undefined), "");
  });
});

describe("al editar un parte guardado, cada novedad vuelve a su fila", () => {
  const filas = [{ id: "otra" }, ...filasPorContrato(PERSONA, porContrato, todo, sinTurnos)];
  it("por el turno de la fila guardada; si no lo dice, por el horario; si tampoco, a la primera", () => {
    const r = novedadesASuFila(
      [
        { employeeId: PERSONA, filaShiftId: MANANA, n: 1 },
        { employeeId: PERSONA, filaScheduleIn: "06:00", n: 2 },
        { employeeId: PERSONA, n: 3 },
        { employeeId: "otra", n: 4 },
      ],
      filas,
    )!;
    assert.deepEqual(r.map((x) => x.employeeId), [`${PERSONA}@${AREA}::${MANANA}`, `${PERSONA}@${AREA}::${MANANA}`, `${PERSONA}@${AREA}::${TARDE}`, "otra"]);
  });
  it("nada que mover → null (las que ya están en su fila no se tocan; sin filas propias tampoco)", () => {
    assert.equal(novedadesASuFila([{ employeeId: `${PERSONA}@${AREA}::${MANANA}` }, { employeeId: "otra" }], filas), null);
    assert.equal(novedadesASuFila([{ employeeId: PERSONA }], [{ id: PERSONA }]), null);
  });
});
