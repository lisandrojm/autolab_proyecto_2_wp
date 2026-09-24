/**
 * El plan de un lote de una plantilla de equipo (ver `planDeLote.ts`): cálculo, overrides y reglas.
 * Septiembre 2026: 22 días hábiles Lu–Vi. Categoría con neto 30.000 → 1.000 por jornada.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Contexto, erroresDelLote, IntegranteParaPlan, planDeLote, PlantillaParaPlan } from "./planDeLote.js";
import { armarPayloadDeSolicitud } from "../compartido/solicitudDeContratacion.js";

const LU_VI = [1, 2, 3, 4, 5];
const plantilla: PlantillaParaPlan = {
  projectId: "p1",
  empresaContratoId: "emp2030",
  convenioId: "conv634",
  contratoId: "c5x7",
  nombreContrato: "Plazo fijo 5x7",
  tipoImpositivo: "alta_temprana",
  areaShiftAssignments: [{ areaId: "a1", shiftIds: ["s1"] }],
  inTime: "10:00",
  outTime: "18:00",
  diasSemana: LU_VI,
  diasPorSemana: 5,
  diasRotativos: false,
  comentarios: "Equipo de siempre",
};
const integ = (id: string, x: Partial<IntegranteParaPlan> = {}): IntegranteParaPlan => ({ _id: `i${id}`, userId: `u${id}`, rolesFrame: ["rf1"], categoriaSatId: "cat1", ...x });

const ctx = (x: Partial<Contexto> = {}): Contexto => ({
  contrato: { modoFechas: "periodo", esTiempoIndeterminado: false, multiplicadorDiario: 0, horasPorJornada: 9 },
  hayContratos: true,
  convenioCct: "634/11",
  hayConvenios: true,
  categorias: new Map([
    ["cat1", { neto: 30000, convenio: "634/11", nombre: "Oro" }],
    ["cat2", { neto: 45000, convenio: "634/11", nombre: "Platino" }],
    ["catOtro", { neto: 30000, convenio: "131/75", nombre: "Otra" }],
  ]),
  personas: new Map([
    ["u1", { nombre: "Ana Uno", activo: true, esSolicitud: false }],
    ["u2", { nombre: "Beto Dos", activo: true, esSolicitud: false }],
    ["u3", { nombre: "Caro Tres", activo: true, esSolicitud: false }],
    ["uInactivo", { nombre: "Inactivo", activo: false, esSolicitud: false }],
  ]),
  equipo: new Set(["u1", "u2", "u3", "u9"]),
  motivos: new Set(["mVac"]),
  superposiciones: new Map(),
  ...x,
});
const SEPT = { desde: "2026-09-01", hasta: "2026-09-30" };

test("período: jornadas del calendario, importe de la escala, total = jornada × jornadas", () => {
  const { filas, totales } = planDeLote(plantilla, [integ("1"), integ("2")], SEPT, {}, ctx());
  assert.equal(filas[0].jornadas, 22);
  assert.equal(filas[0].origenImporte, "escala");
  assert.equal(filas[0].importes.jornada, 1000);
  assert.equal(filas[0].importes.total, 22000);
  assert.equal(filas[0].importes.mensual, 22000);
  assert.equal(filas[0].importes.semana, 5000);
  assert.deepEqual(filas[0].errores, []);
  assert.deepEqual(totales, { personas: 2, jornadas: 44, importe: 44000, conErrores: 0, conAdvertencias: 0 });
});

test("multiplicador del tipo de contrato: «Jornada» ×1,5 y por días sueltos", () => {
  const c = ctx({ contrato: { modoFechas: "dias", multiplicadorDiario: 1.5 } });
  const { filas } = planDeLote(plantilla, [integ("1")], { fechas: ["2026-09-24", "2026-09-25", "2026-09-26"] }, {}, c);
  assert.equal(filas[0].jornadas, 3);
  assert.equal(filas[0].importes.jornada, 1500);
  assert.equal(filas[0].importes.total, 4500);
  assert.equal(filas[0].datos!.startDate, "2026-09-24");
  assert.equal(filas[0].datos!.dueDate, "2026-09-26");
  // jue, vie, sáb
  assert.deepEqual(filas[0].datos!.diasSemana, [4, 5, 6]);
  assert.deepEqual(filas[0].datos!.fechasTrabajadas, ["2026-09-24", "2026-09-25", "2026-09-26"]);
});

test("días sueltos con huecos: martes 1 y 15 son 2 jornadas, no 3", () => {
  const c = ctx({ contrato: { modoFechas: "dias" } });
  const { filas } = planDeLote(plantilla, [integ("1")], { fechas: ["2026-09-15", "2026-09-01"] }, {}, c);
  assert.equal(filas[0].jornadas, 2);
  assert.equal(filas[0].datos!.workdaysCalculated, 2);
});

test("override de la plantilla: horario y categoría propios de un integrante", () => {
  const { filas } = planDeLote(plantilla, [integ("1", { inTime: "12:00", outTime: "20:00", categoriaSatId: "cat2" })], SEPT, {}, ctx());
  assert.equal(filas[0].inTime, "12:00");
  assert.equal(filas[0].datos!.inTime, "12:00");
  assert.equal(filas[0].importes.jornada, 1500);
});

test("override puntual: pisa a la plantilla SÓLO en esta contratación", () => {
  const i = integ("1", { dailyRateManual: 2000, escalaAlFijar: 1000 });
  const { filas } = planDeLote(plantilla, [i], SEPT, { i1: { dailyRate: 2500, inTime: "06:00", outTime: "12:00" } }, ctx());
  assert.equal(filas[0].origenImporte, "puntual");
  assert.equal(filas[0].importes.jornada, 2500);
  assert.equal(filas[0].inTime, "06:00");
  assert.equal(i.dailyRateManual, 2000, "la plantilla no se toca");
});

test("importe fijado a mano en la plantilla: se paga el fijado y, si la escala cambió, se avisa", () => {
  const igual = planDeLote(plantilla, [integ("1", { dailyRateManual: 1800, escalaAlFijar: 1000 })], SEPT, {}, ctx());
  assert.equal(igual.filas[0].origenImporte, "plantilla");
  assert.equal(igual.filas[0].importes.jornada, 1800);
  assert.deepEqual(igual.filas[0].advertencias, []);
  const cambio = planDeLote(plantilla, [integ("1", { dailyRateManual: 1800, escalaAlFijar: 900 })], SEPT, {}, ctx());
  assert.equal(cambio.filas[0].importes.jornada, 1800);
  assert.match(cambio.filas[0].advertencias[0], /antes \$ 900,00, ahora \$ 1\.000,00/);
});

test("excluido esta vez: no se valida, no suma, no sale", () => {
  const { filas, totales } = planDeLote(plantilla, [integ("1"), integ("uInactivo".slice(1), { userId: "uInactivo" })], SEPT, { iInactivo: { excluido: true } }, ctx());
  assert.equal(filas[1].excluido, true);
  assert.deepEqual(filas[1].errores, []);
  assert.equal(totales.personas, 1);
  assert.deepEqual(erroresDelLote({ filas, totales }), []);
});

test("persona inactiva o borrada: error", () => {
  const { filas } = planDeLote(plantilla, [integ("x", { userId: "uInactivo" }), integ("y", { userId: "uNoExiste" })], SEPT, {}, ctx());
  assert.ok(filas[0].errores.some((e) => /inactiva/.test(e)));
  assert.ok(filas[1].errores.some((e) => /no existe/.test(e)));
  assert.equal(filas[1].datos, null);
});

test("categoría de otro convenio o faltante: error «a completar»", () => {
  const { filas } = planDeLote(plantilla, [integ("1", { categoriaSatId: "catOtro" }), integ("2", { categoriaSatId: null })], SEPT, {}, ctx());
  assert.ok(filas[0].errores.some((e) => /131\/75.*634\/11.*a completar/.test(e)));
  assert.ok(filas[1].errores.some((e) => /Falta la categoría/.test(e)));
});

test("reemplazo: motivo y reemplazado obligatorios, y el reemplazado tiene que ser del equipo", () => {
  const sinNada = planDeLote(plantilla, [integ("1")], SEPT, { i1: { isReplacement: true } }, ctx()).filas[0].errores;
  assert.ok(sinNada.some((e) => /a quién reemplaza/.test(e)));
  assert.ok(sinNada.some((e) => /motivo/.test(e)));
  const deAfuera = planDeLote(plantilla, [integ("1")], SEPT, { i1: { isReplacement: true, replacedUserId: "uAjeno", motivoReemplazoId: "mVac" } }, ctx()).filas[0].errores;
  assert.ok(deAfuera.some((e) => /no es del equipo/.test(e)));
  const ok = planDeLote(plantilla, [integ("1")], SEPT, { i1: { isReplacement: true, replacedUserId: "u9", motivoReemplazoId: "mVac" } }, ctx()).filas[0];
  assert.deepEqual(ok.errores, []);
  assert.equal(ok.datos!.replacedUserId, "u9");
  assert.equal(ok.datos!.motivoReemplazoId, "mVac");
});

test("horario más largo que el que admite el contrato: error, igual que el formulario", () => {
  const { filas } = planDeLote(plantilla, [integ("1", { inTime: "08:00", outTime: "20:00" })], SEPT, {}, ctx());
  assert.ok(filas[0].errores.some((e) => /12 h.*hasta 9 h/.test(e)));
});

test("servicios: sin categoría ni convenio, con importe a mano obligatorio", () => {
  const serv = { ...plantilla, tipoImpositivo: "constancia_cuit" };
  const sinImporte = planDeLote(serv, [integ("1")], SEPT, {}, ctx()).filas[0];
  assert.ok(sinImporte.errores.some((e) => /servicio/.test(e)));
  const conImporte = planDeLote(serv, [integ("1", { dailyRateManual: 5000 })], SEPT, {}, ctx()).filas[0];
  assert.deepEqual(conImporte.errores, []);
  assert.equal(conImporte.datos!.esServicios, true);
});

test("fechas faltantes o al revés: error", () => {
  assert.ok(planDeLote(plantilla, [integ("1")], {}, {}, ctx()).filas[0].errores.some((e) => /fecha de inicio/.test(e)));
  assert.ok(planDeLote(plantilla, [integ("1")], { desde: "2026-09-30", hasta: "2026-09-01" }, {}, ctx()).filas[0].errores.some((e) => /anterior/.test(e)));
});

test("superposición: las de horario se marcan; son advertencias, no errores", () => {
  const sup = new Map([["u1", [{ tipo: "horario" as const, mensaje: "Tiene un contrato vigente en LN+ …" }]]]);
  const { filas, totales } = planDeLote(plantilla, [integ("1")], SEPT, {}, ctx({ superposiciones: sup }));
  assert.equal(filas[0].superposicionHorario, true);
  assert.deepEqual(filas[0].errores, []);
  assert.equal(totales.conAdvertencias, 1);
});

test("erroresDelLote: todos excluidos, errores o más de 50", () => {
  const todosAfuera = planDeLote(plantilla, [integ("1")], SEPT, { i1: { excluido: true } }, ctx());
  assert.ok(erroresDelLote(todosAfuera).some((e) => /todos excluidos/.test(e)));
  const conError = planDeLote(plantilla, [integ("1", { categoriaSatId: null })], SEPT, {}, ctx());
  assert.ok(erroresDelLote(conError).some((e) => /1 integrante tiene errores/.test(e)));
  const personas = new Map(Array.from({ length: 51 }, (_, i) => [`u${i}`, { nombre: `P${i}`, activo: true, esSolicitud: false }]));
  const muchos = planDeLote(plantilla, Array.from({ length: 51 }, (_, i) => integ(String(i))), SEPT, {}, ctx({ personas }));
  assert.ok(erroresDelLote(muchos).some((e) => /máximo por contratación es 50/.test(e)));
});

/*
  BULK == INDIVIDUAL. La solicitud que sale de una fila del lote, armada con `armarPayloadDeSolicitud`,
  es la que mandaría el formulario individual con los mismos datos cargados a mano. Se compara con lo que
  el formulario le pasaría a esa misma función (ver `solicitudDeContratacion.test.ts`, que prueba que esa
  función es exactamente el armado original del formulario).
*/
test("bulk == individual: la fila del lote produce el mismo payload que el formulario con los mismos datos", () => {
  const { filas } = planDeLote(plantilla, [integ("1")], SEPT, { i1: { isReplacement: true, replacedUserId: "u9", motivoReemplazoId: "mVac" } }, ctx());
  const T = 1790000000000;
  const delLote = armarPayloadDeSolicitud(filas[0].datos!, { ahora: T });
  const delFormulario = armarPayloadDeSolicitud(
    {
      fullName: "Ana Uno",
      projectIds: ["p1"],
      solicitudUserId: "u1",
      roleFrameIds: ["rf1"],
      esServicios: false,
      categoriaSatId: "cat1",
      startDate: "2026-09-01",
      dueDate: "2026-09-30",
      indeterminado: false,
      porDiasSueltos: false,
      workdaysCount: "22",
      workdaysCalculated: 22,
      ajusteJornadas: false,
      motivoAjuste: "",
      notaAjuste: "",
      diasPorSemana: "5",
      diasSemana: LU_VI,
      diasRotativos: false,
      fechasTrabajadas: [],
      inTime: "10:00",
      outTime: "18:00",
      empresaContratoId: "emp2030",
      convenioId: "conv634",
      dailyRate: "1000",
      isReplacement: true,
      empleado_id_reemplezado: "",
      replacedUserId: "u9",
      motivoReemplazoId: "mVac",
      comentarios: "Equipo de siempre",
      tipoImpositivo: "alta_temprana",
      contratoId: "c5x7",
      nombreContrato: "Plazo fijo 5x7",
      areaShiftAssignments: [{ areaId: "a1", shiftIds: ["s1"] }],
      esRenovacion: undefined,
      renovacionDe: undefined,
    },
    { ahora: T },
  );
  assert.deepStrictEqual(delLote, delFormulario);
});

test("puesto sin asignar: error hasta que se elige a alguien (sólo esta vez) o se excluye", () => {
  const puesto = integ("P", { userId: "" });
  const vacio = planDeLote(plantilla, [integ("1"), puesto], SEPT, {}, ctx());
  assert.ok(vacio.filas[1].errores.some((e) => /Falta la persona del puesto/.test(e)));
  assert.equal(vacio.filas[1].nombre, "Puesto sin asignar");
  assert.equal(vacio.filas[1].datos, null);

  const completado = planDeLote(plantilla, [integ("1"), puesto], SEPT, { iP: { userId: "u2" } }, ctx());
  assert.deepEqual(completado.filas[1].errores, []);
  assert.equal(completado.filas[1].nombre, "Beto Dos");
  assert.equal(completado.filas[1].datos!.solicitudUserId, "u2");
  assert.equal(completado.totales.personas, 2);

  const excluido = planDeLote(plantilla, [integ("1"), puesto], SEPT, { iP: { excluido: true } }, ctx());
  assert.deepEqual(excluido.filas[1].errores, []);
  assert.equal(excluido.totales.personas, 1);
});

test("la misma persona en dos puestos: error en los dos", () => {
  const { filas } = planDeLote(plantilla, [integ("1"), integ("P", { userId: "" })], SEPT, { iP: { userId: "u1" } }, ctx());
  assert.ok(filas[0].errores.some((e) => /más de un puesto/.test(e)));
  assert.ok(filas[1].errores.some((e) => /más de un puesto/.test(e)));
});
