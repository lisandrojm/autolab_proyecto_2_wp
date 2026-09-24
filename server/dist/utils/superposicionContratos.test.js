/**
 * Superposición de lo que se pide con lo que la persona ya tiene (ver `superposicionContratos.ts`).
 * Calendario de referencia: el lunes 7/9/2026 y el lunes 14/9/2026.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { horariosSePisan, superposiciones } from "./superposicionContratos.js";
const HOY = "2026-09-24";
const LU_VI = [1, 2, 3, 4, 5];
const pedido = { desde: "2026-10-01", hasta: "2026-10-31", dias: LU_VI, inTime: "10:00", outTime: "18:00", shiftIds: ["sOficina"] };
const contrato = (x) => ({ origen: "contrato", proyectoNombre: "LN+", desde: "2026-09-01", hasta: "2026-12-31", dias: LU_VI, inTime: "10:00", outTime: "18:00", ...x });
test("horariosSePisan: tocarse en el borde no es pisarse; los turnos que cruzan la medianoche también cuentan", () => {
    assert.equal(horariosSePisan({ inTime: "06:00", outTime: "12:00" }, { inTime: "12:00", outTime: "18:00" }), false);
    assert.equal(horariosSePisan({ inTime: "10:00", outTime: "18:00" }, { inTime: "17:00", outTime: "20:00" }), true);
    // Noche 18 a 00 y trasnoche 00 a 06: se tocan a medianoche, no se pisan.
    assert.equal(horariosSePisan({ inTime: "18:00", outTime: "00:00" }, { inTime: "00:00", outTime: "06:00" }), false);
    // 22 a 06 pisa a la trasnoche 00 a 06 (del día siguiente) y a la noche 18 a 00.
    assert.equal(horariosSePisan({ inTime: "22:00", outTime: "06:00" }, { inTime: "00:00", outTime: "06:00" }), true);
    assert.equal(horariosSePisan({ inTime: "22:00", outTime: "06:00" }, { inTime: "18:00", outTime: "00:00" }), true);
    assert.equal(horariosSePisan({ inTime: "10:00", outTime: "18:00" }, { inTime: "", outTime: "" }), null);
});
test("mismos días y horario en otro proyecto: aviso de HORARIO, vigente", () => {
    const [s] = superposiciones(pedido, [contrato({})], HOY);
    assert.equal(s.tipo, "horario");
    assert.equal(s.vigente, true);
    assert.deepEqual(s.sinDatos, []);
    assert.match(s.mensaje, /contrato vigente en LN\+/);
});
test("también en el MISMO proyecto (el chequeo viejo sólo miraba otros): se avisa igual", () => {
    const r = superposiciones(pedido, [contrato({ proyectoNombre: "PRODUCTORA" })], HOY);
    assert.equal(r.length, 1);
    assert.equal(r[0].tipo, "horario");
});
test("mismo turno aunque el contrato no traiga horario: HORARIO, «mismo turno»", () => {
    const [s] = superposiciones(pedido, [contrato({ inTime: "", outTime: "", shiftIds: ["sOficina"] })], HOY);
    assert.equal(s.tipo, "horario");
    assert.deepEqual(s.sinDatos, []);
    assert.match(s.mensaje, /mismo turno/);
});
test("fechas cruzadas en otro horario: aviso de FECHAS", () => {
    const [s] = superposiciones(pedido, [contrato({ inTime: "18:00", outTime: "00:00" })], HOY);
    assert.equal(s.tipo, "fechas");
    assert.match(s.mensaje, /en otro horario/);
});
test("fechas cruzadas en otros días de la semana: aviso de FECHAS aunque el horario sea el mismo", () => {
    const [s] = superposiciones(pedido, [contrato({ dias: [0, 6] })], HOY);
    assert.equal(s.tipo, "fechas");
    assert.match(s.mensaje, /otros días de la semana/);
});
test("períodos que no se tocan: nada", () => {
    assert.deepEqual(superposiciones(pedido, [contrato({ desde: "2026-06-01", hasta: "2026-09-30" })], HOY), []);
    // Una renovación arranca el día después de la baja: no se superpone con el contrato que renueva.
    assert.deepEqual(superposiciones({ ...pedido, desde: "2026-10-01" }, [contrato({ hasta: "2026-09-30" })], HOY), []);
});
test("contrato sin baja (tiempo indeterminado) se superpone con todo lo que venga después", () => {
    const [s] = superposiciones(pedido, [contrato({ hasta: "" })], HOY);
    assert.equal(s.tipo, "horario");
    assert.match(s.mensaje, /sin fecha de baja/);
});
test("pedido de tiempo indeterminado contra un contrato futuro", () => {
    const r = superposiciones({ ...pedido, hasta: "" }, [contrato({ desde: "2027-03-01", hasta: "2027-03-31" })], HOY);
    assert.equal(r.length, 1);
    assert.equal(r[0].vigente, false);
    assert.match(r[0].mensaje, /^Tiene un contrato en/);
});
test("jornada por días sueltos: sólo cuentan esos días", () => {
    const jornada = { desde: "2026-09-26", hasta: "2026-09-27", fechas: ["2026-09-26", "2026-09-27"], dias: [], inTime: "10:00", outTime: "18:00" };
    // Sábado 26 y domingo 27 contra un Lu–Vi: se cruzan los períodos, no los días.
    assert.equal(superposiciones(jornada, [contrato({})], HOY)[0].tipo, "fechas");
    // Contra un contrato que trabaja los sábados: horario.
    assert.equal(superposiciones(jornada, [contrato({ dias: [6] })], HOY)[0].tipo, "horario");
});
test("sin días o sin horario cargados: se avisa como posible y se dice qué faltó", () => {
    const [s] = superposiciones(pedido, [contrato({ dias: [], inTime: "", outTime: "" })], HOY);
    assert.equal(s.tipo, "horario");
    assert.deepEqual(s.sinDatos, ["dias", "horario"]);
    assert.match(s.mensaje, /sin días cargados y sin horario cargado/);
});
test("otra solicitud pendiente de la misma persona también se avisa", () => {
    const [s] = superposiciones(pedido, [contrato({ origen: "solicitud", proyectoNombre: "Frame | PRODUCTORA" })], HOY);
    assert.equal(s.origen, "solicitud");
    assert.equal(s.vigente, false);
    assert.match(s.mensaje, /otra solicitud pendiente/);
});
test("lo grave primero: horario antes que fechas", () => {
    const r = superposiciones(pedido, [contrato({ inTime: "18:00", outTime: "00:00", desde: "2026-09-01" }), contrato({ desde: "2026-09-15", proyectoNombre: "Otro" })], HOY);
    assert.deepEqual(r.map((x) => x.tipo), ["horario", "fechas"]);
});
