/**
 * EL CÁLCULO DE JORNADAS E IMPORTES DE UNA SOLICITUD, TAL COMO ESTÁ HOY.
 *
 * Son la red de seguridad antes de mover este módulo al server para compartirlo con el alta masiva
 * (plantillas de equipo): si al moverlo cambia un solo número, estos tests lo dicen.
 *
 * Los valores esperados se pueden verificar a mano con un calendario:
 *  - septiembre 2026 empieza en martes y tiene 30 días → 22 días hábiles Lu–Vi;
 *  - febrero 2026 empieza en domingo y tiene 28 → exactamente 20 Lu–Vi;
 *  - octubre 2026 empieza en jueves y tiene 31 → 22 Lu–Vi.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { anclaDesdeJornada, derivarImportes, diasCorridos, erroresDeJornadas, hayAjuste, jornadasDelCalendario, mesesEquivalentes, periodoDeCalculo, DatosJornadas } from "./jornadas";
import { importePorJornadaDeCategoria } from "./seleccionConvenioCategoria";

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

test("importePorJornadaDeCategoria: neto ÷ 30 × multiplicador del tipo de contrato (sin multiplicador = 1)", () => {
  const categoria: any = { data: { neto: 30000 } };
  assert.equal(importePorJornadaDeCategoria(categoria), 1000);
  assert.equal(importePorJornadaDeCategoria(categoria, 1.5), 1500);
  assert.equal(importePorJornadaDeCategoria(categoria, 0), 1000);
  assert.equal(importePorJornadaDeCategoria(categoria, null), 1000);
  // Redondea a centavos DESPUÉS de multiplicar.
  assert.equal(importePorJornadaDeCategoria({ data: { neto: 1176624.4 } } as any, 1.5), 58831.22);
  assert.equal(importePorJornadaDeCategoria(undefined, 1.5), 0);
});
