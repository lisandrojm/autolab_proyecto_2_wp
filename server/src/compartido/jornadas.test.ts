/**
 * EL CÁLCULO DE JORNADAS E IMPORTES DE UNA SOLICITUD, TAL COMO ESTÁ HOY.
 *
 * Nacieron como red de seguridad ANTES de mover el módulo del frontend al server (commit a1a92e1f,
 * contra el código original) y siguen pasando igual: moverlo no cambió un solo número. Es el cálculo
 * que comparten el alta individual y el alta masiva de plantillas de equipo.
 *
 * Los valores esperados se pueden verificar a mano con un calendario:
 *  - septiembre 2026 empieza en martes y tiene 30 días → 22 días hábiles Lu–Vi;
 *  - febrero 2026 empieza en domingo y tiene 28 → exactamente 20 Lu–Vi;
 *  - octubre 2026 empieza en jueves y tiene 31 → 22 Lu–Vi.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { anclaDesdeJornada, derivarImportes, mesesParaImportes, diasCorridos, erroresDeJornadas, hayAjuste, importePorJornada, jornadasCalculadasDelPedido, jornadasDelCalendario, mesesEquivalentes, periodoDeCalculo, DatosJornadas } from "./jornadas.js";

const LU_VI = [1, 2, 3, 4, 5];
const cerca = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("diasCorridos: ambos extremos inclusive; null si falta una fecha o el fin es anterior", () => {
  assert.equal(diasCorridos("2026-09-01", "2026-09-01"), 1);
  assert.equal(diasCorridos("2026-09-01", "2026-09-30"), 30);
  assert.equal(diasCorridos("2026-09-30", "2026-09-01"), null);
  assert.equal(diasCorridos("", "2026-09-01"), null);
});

test("jornadasDelCalendario: cuenta los días marcados que caen en el período", () => {
  // Lunes 7 a domingo 13: una semana entera.
  assert.equal(jornadasDelCalendario("2026-09-07", "2026-09-13", LU_VI), 5);
  assert.equal(jornadasDelCalendario("2026-09-01", "2026-09-30", LU_VI), 22);
  assert.equal(jornadasDelCalendario("2026-02-01", "2026-02-28", LU_VI), 20);
  // Semana cortada (jueves 10 a martes 15): jue, vie, lun, mar. `semanas × días` daría otra cosa.
  assert.equal(jornadasDelCalendario("2026-09-10", "2026-09-15", LU_VI), 4);
  // Sólo sábados de septiembre: 5, 12, 19, 26.
  assert.equal(jornadasDelCalendario("2026-09-01", "2026-09-30", [6]), 4);
  assert.equal(jornadasDelCalendario("2026-09-01", "2026-09-30", []), null);
  assert.equal(jornadasDelCalendario("2026-09-30", "2026-09-01", LU_VI), null);
});

test("periodoDeCalculo: a plazo es el del contrato; indeterminado, el mes completo del alta", () => {
  assert.deepEqual(periodoDeCalculo("2026-09-10", "2026-10-05", false), { desde: "2026-09-10", hasta: "2026-10-05" });
  assert.deepEqual(periodoDeCalculo("2026-02-10", undefined, true), { desde: "2026-02-01", hasta: "2026-02-28" });
  assert.deepEqual(periodoDeCalculo("2028-02-10", undefined, true), { desde: "2028-02-01", hasta: "2028-02-29" });
  assert.deepEqual(periodoDeCalculo("", undefined, true), { desde: "", hasta: "" });
});

test("mesesEquivalentes: un mes completo vale 1 tenga los hábiles que tenga", () => {
  cerca(mesesEquivalentes("2026-09-01", "2026-09-30", LU_VI), 1);
  cerca(mesesEquivalentes("2026-02-01", "2026-02-28", LU_VI), 1);
  cerca(mesesEquivalentes("2026-09-01", "2026-10-31", LU_VI), 2);
  // 1 al 15 de septiembre: 11 de sus 22 hábiles.
  cerca(mesesEquivalentes("2026-09-01", "2026-09-15", LU_VI), 11 / 22);
  // Del 21 de septiembre al 2 de octubre: 8/22 + 2/22.
  cerca(mesesEquivalentes("2026-09-21", "2026-10-02", LU_VI), 8 / 22 + 2 / 22);
  assert.equal(mesesEquivalentes("2026-09-01", "2026-09-30", []), 0);
  assert.equal(mesesEquivalentes(undefined, "2026-09-30", LU_VI), 0);
});

test("derivarImportes: con el mensual de ancla, el total es mensual × meses y la jornada total ÷ jornadas", () => {
  const i = derivarImportes({ ancla: { unidad: "mensual", valor: 22000 }, jornada: null, mesesEq: 1, jornadas: 22, diasSemana: 5 });
  cerca(i.mensual, 22000);
  cerca(i.total, 22000);
  cerca(i.jornada, 1000);
  cerca(i.semana, 5000);
});

test("derivarImportes: con el total de ancla, el mensual es total ÷ meses", () => {
  const i = derivarImportes({ ancla: { unidad: "total", valor: 11000 }, jornada: null, mesesEq: 0.5, jornadas: 11, diasSemana: 5 });
  cerca(i.total, 11000);
  cerca(i.mensual, 22000);
  cerca(i.jornada, 1000);
});

test("derivarImportes: sin ancla parte de la jornada", () => {
  const i = derivarImportes({ ancla: null, jornada: 100, mesesEq: 0.5, jornadas: 10, diasSemana: 5 });
  cerca(i.jornada, 100);
  cerca(i.total, 1000);
  cerca(i.mensual, 2000);
  cerca(i.semana, 500);
});

test("derivarImportes: nunca divide por 0; lo que no se puede calcular queda en null", () => {
  const sinMeses = derivarImportes({ ancla: { unidad: "mensual", valor: 1000 }, jornada: null, mesesEq: 0, jornadas: 10, diasSemana: 5 });
  assert.equal(sinMeses.total, null);
  assert.equal(sinMeses.jornada, null);
  assert.equal(sinMeses.semana, null);
  const sinJornadas = derivarImportes({ ancla: null, jornada: 100, mesesEq: 1, jornadas: 0, diasSemana: 0 });
  assert.equal(sinJornadas.total, null);
  assert.equal(sinJornadas.mensual, null);
  assert.equal(sinJornadas.semana, null);
  assert.deepEqual(derivarImportes({ ancla: null, jornada: null, mesesEq: 1, jornadas: 10, diasSemana: 5 }), { jornada: null, semana: null, mensual: null, total: null });
});

test("anclaDesdeJornada: editar la jornada fija el mensual que le corresponde", () => {
  assert.deepEqual(anclaDesdeJornada(100, 10, 0.5), { unidad: "mensual", valor: 2000 });
  assert.equal(anclaDesdeJornada(100, 0, 0.5), null);
  assert.equal(anclaDesdeJornada(100, 10, 0), null);
  // Ida y vuelta: la jornada que sale del ancla es la misma que entró.
  const ancla = anclaDesdeJornada(1234.56, 22, 1)!;
  cerca(derivarImportes({ ancla, jornada: null, mesesEq: 1, jornadas: 22, diasSemana: 5 }).jornada, 1234.56);
});

const base: DatosJornadas = { desde: "2026-09-01", hasta: "2026-09-30", diasPorSemana: "5", dias: LU_VI, rotativos: false, jornadas: "22", calculadas: 22, ajustado: false, motivo: "", nota: "" };

test("erroresDeJornadas: un formulario que cierra no tiene errores", () => {
  assert.deepEqual(erroresDeJornadas(base), {});
});

test("erroresDeJornadas: los días marcados tienen que coincidir con los días por semana", () => {
  assert.ok(erroresDeJornadas({ ...base, dias: [1, 2, 3] }).dias);
  assert.ok(erroresDeJornadas({ ...base, diasPorSemana: "8" }).diasPorSemana);
  assert.ok(erroresDeJornadas({ ...base, desde: "2026-09-30", hasta: "2026-09-01" }).fechas);
  // Con días rotativos los marcados no cuentan.
  assert.equal(erroresDeJornadas({ ...base, rotativos: true, dias: [1] }).dias, undefined);
});

test("erroresDeJornadas: rotativos se cargan a mano, con tope en los días corridos", () => {
  assert.deepEqual(erroresDeJornadas({ ...base, rotativos: true, jornadas: "30" }), {});
  assert.ok(erroresDeJornadas({ ...base, rotativos: true, jornadas: "31" }).jornadas);
  assert.ok(erroresDeJornadas({ ...base, rotativos: true, jornadas: "0" }).jornadas);
});

test("hayAjuste / erroresDeJornadas: pisar el calendario exige motivo, y «Otro» una nota", () => {
  const ajustado = { ...base, ajustado: true, jornadas: "20" };
  assert.equal(hayAjuste(ajustado), true);
  assert.equal(hayAjuste({ ...ajustado, jornadas: "22" }), false);
  assert.ok(erroresDeJornadas(ajustado).motivo);
  assert.deepEqual(erroresDeJornadas({ ...ajustado, motivo: "jornada_caida" }), {});
  assert.ok(erroresDeJornadas({ ...ajustado, motivo: "otro", nota: "corto" }).nota);
  assert.deepEqual(erroresDeJornadas({ ...ajustado, motivo: "otro", nota: "llovió dos días" }), {});
});

test("importePorJornada: (básico + adicional + presentismo) ÷ jornadas del tipo × multiplicador", () => {
  // El caso del pedido (06/10/2026): G10 del 634/11 con «Jornada», 22 jornadas y ×1,5.
  const g10 = { sueldoBasico: 734833.55, sueldoAdicional: 154315.05, presentismo: 88914.86, sueldoBruto: 978063.46 };
  assert.equal(importePorJornada(g10, 1.5, 22), 66686.15);
  // Sin multiplicador (0, vacío) = 1; sin jornadas en el tipo = 30.
  assert.equal(importePorJornada(g10, 0, 22), 44457.43);
  assert.equal(importePorJornada(g10, null, null), 32602.12);
  assert.equal(importePorJornada({ sueldoBasico: 22000, sueldoAdicional: 0, presentismo: 0 }, 1.5, 22), 1500);
  // Sin los tres componentes, el bruto (que es su suma).
  assert.equal(importePorJornada({ sueldoBruto: 30000 }, 1, 30), 1000);
  assert.equal(importePorJornada(undefined, 1.5, 22), 0);
});

test("jornadasCalculadasDelPedido: por días sueltos son los días marcados, no los de la semana del período", () => {
  // Martes 1 y martes 15: dos jornadas, aunque el período (1 al 15) tenga tres martes.
  assert.equal(jornadasCalculadasDelPedido({ porDiasSueltos: true, fechas: ["2026-09-01", "2026-09-15"], rotativos: false, desde: "2026-09-01", hasta: "2026-09-15", dias: [2] }), 2);
  assert.equal(jornadasCalculadasDelPedido({ porDiasSueltos: true, fechas: [], rotativos: false, desde: "", hasta: "", dias: [] }), null);
  assert.equal(jornadasCalculadasDelPedido({ porDiasSueltos: false, fechas: [], rotativos: true, desde: "2026-09-01", hasta: "2026-09-30", dias: [1, 2, 3, 4, 5] }), null);
  assert.equal(jornadasCalculadasDelPedido({ porDiasSueltos: false, fechas: [], rotativos: false, desde: "2026-09-01", hasta: "2026-09-30", dias: [1, 2, 3, 4, 5] }), 22);
});

test("mesesEquivalentes con días sueltos: cuenta los días marcados, no todo el período", () => {
  // Octubre 2026 tiene 5 viernes (2, 9, 16, 23, 30). Marcados el 2, el 9 y el 23: 3 de 5, no 4 de 5.
  const fechas = ["2026-10-02", "2026-10-09", "2026-10-23"];
  cerca(mesesEquivalentes("2026-10-02", "2026-10-23", [5], fechas), 0.6);
  cerca(mesesEquivalentes("2026-10-02", "2026-10-23", [5]), 0.8);
  // Con el mensual como ancla, la jornada es la de un mes de viernes: mensual ÷ 5.
  const importes = derivarImportes({ ancla: { unidad: "mensual", valor: 1000 }, jornada: null, mesesEq: mesesEquivalentes("2026-10-02", "2026-10-23", [5], fechas), jornadas: 3, diasSemana: 1 });
  cerca(importes.jornada!, 200);
  cerca(importes.total!, 600);
  cerca(importes.semana!, 200);
});

test("jornadas fijadas por el tipo de contrato: mandan sobre el calendario, salvo con días sueltos", () => {
  // Octubre 2026 de lunes a sábado da 27; un plazo fijo de 30 son 30.
  assert.equal(jornadasCalculadasDelPedido({ porDiasSueltos: false, fechas: [], rotativos: false, desde: "2026-10-01", hasta: "2026-10-31", dias: [1, 2, 3, 4, 5, 6] }), 27);
  assert.equal(jornadasCalculadasDelPedido({ porDiasSueltos: false, fechas: [], rotativos: false, desde: "2026-10-01", hasta: "2026-10-31", dias: [1, 2, 3, 4, 5, 6], jornadasDelTipo: 30 }), 30);
  assert.equal(jornadasCalculadasDelPedido({ porDiasSueltos: false, fechas: [], rotativos: true, desde: "2026-10-01", hasta: "2026-10-31", dias: [], jornadasDelTipo: "30" }), 30);
  // Días sueltos: cada día marcado es una jornada, aunque el tipo diga 22.
  assert.equal(jornadasCalculadasDelPedido({ porDiasSueltos: true, fechas: ["2026-10-02", "2026-10-09"], rotativos: false, desde: "", hasta: "", dias: [], jornadasDelTipo: 22 }), 2);
  // Vacío o 0 en el tipo: se calcula.
  assert.equal(jornadasCalculadasDelPedido({ porDiasSueltos: false, fechas: [], rotativos: true, desde: "", hasta: "", dias: [], jornadasDelTipo: 0 }), null);
});

test("erroresDeJornadas: sin fechas no se envía, aunque las jornadas estén cargadas a mano", () => {
  assert.match(erroresDeJornadas({ ...base, desde: "", hasta: "", ajustado: true, calculadas: null, jornadas: "30" }).fechas || "", /inicio/);
  assert.match(erroresDeJornadas({ ...base, hasta: "" }).fechas || "", /fin/);
});

test("mesesParaImportes: con jornadas en el tipo, el mensual es jornada × esas jornadas (no × los meses del calendario)", () => {
  // «Jornada» (22 por mes), un día suelto: antes el mensual salía jornada × 4 (un día = un cuarto de mes).
  const meses = mesesParaImportes(0.25, 1, 22);
  const i = derivarImportes({ ancla: null, jornada: 66686.15, mesesEq: meses, jornadas: 1, diasSemana: 1 });
  assert.equal(Number(i.mensual!.toFixed(2)), 1467095.3);
  assert.equal(Number(i.total!.toFixed(2)), 66686.15);
  // Editar el mensual: la jornada sale de dividirlo por las 22, no por los días del período.
  const j = derivarImportes({ ancla: { unidad: "mensual", valor: 1467095.3 }, jornada: null, mesesEq: mesesParaImportes(0.25, 1, 22), jornadas: 1, diasSemana: 1 });
  assert.equal(Number(j.jornada!.toFixed(2)), 66686.15);
  // Sin jornadas en el tipo, los meses del período.
  assert.equal(mesesParaImportes(0.5, 11, null), 0.5);
  assert.equal(mesesParaImportes(0.5, 0, 22), 0.5);
});
