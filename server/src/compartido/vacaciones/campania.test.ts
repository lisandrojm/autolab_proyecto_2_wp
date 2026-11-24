import { test } from "node:test";
import assert from "node:assert/strict";
import { armarTurnos, erroresDePropuesta, erroresDelTramo, estadoDelTurno, minimoDelTramo, normalizarDiasDeInicio, textoDiasDeInicio, motivoDeNoInvitar, normalizarTiposContrato, resumenDeInvitables, alertasDeInvitacion, alertasDeLanzamiento, contarDiasTramo, estadoVisible, hastaParaDias, normalizarConfigCampania, sugerirTramoUnico, validarOtorgamiento, validarPropuesta, ventanaDeLaTemporada } from "./campania.js";

/** Dos tipos del catálogo (`contratos`): la campaña elige por su `_id`, no por el número de FRAME. */
const TI = "6a6a6d75bcadd1748056908d";
const PF = "6a6a6d74bcadd17480569075";

const VENTANA = { desde: "2026-11-01", hasta: "2027-04-30" };
const base = { ventana: VENTANA, hoy: "2026-11-15", avisoDias: 30, minPorTramo: 7, diasCorridos: true };

test("config: lo que falta o viene mal cae al de por defecto", () => {
  assert.deepEqual(normalizarConfigCampania(undefined), { activa: false, plazoParaDefinirDias: 14, avisoMinimoDias: 30, minDiasPorTramo: 7, tiposContratoInvitar: [], diasDeInicio: [] });
  assert.deepEqual(normalizarConfigCampania({ activa: true, plazoParaDefinirDias: "20", avisoMinimoDias: -3, minDiasPorTramo: 0 }), { activa: true, plazoParaDefinirDias: 20, avisoMinimoDias: 30, minDiasPorTramo: 7, tiposContratoInvitar: [], diasDeInicio: [] });
  assert.deepEqual(normalizarConfigCampania({ tiposContratoInvitar: [PF, 3, TI, null, "x", PF] }).tiposContratoInvitar, [TI, PF].sort());
});

test("días: corridos o de lunes a viernes", () => {
  // 16/11/2026 es lunes.
  assert.equal(contarDiasTramo({ desde: "2026-11-16", hasta: "2026-11-29" }, true), 14);
  assert.equal(contarDiasTramo({ desde: "2026-11-16", hasta: "2026-11-29" }, false), 10);
  assert.equal(hastaParaDias("2026-11-16", 10, false), "2026-11-27");
  assert.equal(hastaParaDias("2026-11-16", 14, true), "2026-11-29");
});

test("temporada: la que está en curso o la próxima", () => {
  const tramo = { inicio: "11-01", fin: "04-30" };
  assert.deepEqual(ventanaDeLaTemporada("2026-09-15", tramo), { desde: "2026-11-01", hasta: "2027-04-30" });
  assert.deepEqual(ventanaDeLaTemporada("2027-01-15", tramo), { desde: "2026-11-01", hasta: "2027-04-30" });
  assert.deepEqual(ventanaDeLaTemporada("2027-05-02", tramo), { desde: "2027-11-01", hasta: "2028-04-30" });
  assert.deepEqual(ventanaDeLaTemporada("2026-05-02", { inicio: "06-01", fin: "08-31" }), { desde: "2026-06-01", hasta: "2026-08-31" });
});

test("lanzamiento a tiempo: sin error", () => {
  const a = alertasDeLanzamiento({ hoy: "2026-09-15", plazoDias: 14, avisoDias: 30, ventana: VENTANA, diasMasLargo: 21 });
  assert.equal(a.filter((x) => x.nivel === "error").length, 0);
});

test("lanzamiento tarde: el que no elige no llega a otorgarse en término", () => {
  const a = alertasDeLanzamiento({ hoy: "2027-03-20", plazoDias: 14, avisoDias: 30, ventana: VENTANA, diasMasLargo: 14 });
  const error = a.find((x) => x.codigo === "no_llega");
  assert.ok(error);
  assert.match(error!.mensaje, /tarde|a más tardar/);
});

test("lanzamiento: el aviso ya no recorta lo que elige la persona", () => {
  const a = alertasDeLanzamiento({ hoy: "2026-11-15", plazoDias: 14, avisoDias: 30, ventana: VENTANA });
  assert.ok(!a.some((x) => x.codigo === "inicio_recortado"));
});

test("propuesta: un tramo con todos los días, bien", () => {
  assert.deepEqual(validarPropuesta({ ...base, tramos: [{ desde: "2027-01-04", hasta: "2027-01-17" }], diasDisponibles: 14 }), []);
});

test("propuesta: fraccionada en dos de 7, bien; con un tramo corto, error", () => {
  assert.deepEqual(validarPropuesta({ ...base, tramos: [{ desde: "2027-01-04", hasta: "2027-01-10" }, { desde: "2027-02-01", hasta: "2027-02-07" }], diasDisponibles: 14 }), []);
  const e = validarPropuesta({ ...base, tramos: [{ desde: "2027-01-04", hasta: "2027-01-08" }, { desde: "2027-02-01", hasta: "2027-02-09" }], diasDisponibles: 14 });
  assert.ok(e.some((m) => /menos de 7/.test(m)));
});

test("propuesta: fuera de la ventana, ya empezada, suma distinta, tramos que se pisan", () => {
  assert.ok(validarPropuesta({ ...base, tramos: [{ desde: "2027-04-25", hasta: "2027-05-08" }], diasDisponibles: 14 }).some((m) => /ventana/.test(m)));
  // El aviso no rige para lo que elige la persona: puede empezar mañana, pero no hoy.
  assert.deepEqual(validarPropuesta({ ...base, tramos: [{ desde: "2026-11-16", hasta: "2026-11-29" }], diasDisponibles: 14 }), []);
  assert.ok(validarPropuesta({ ...base, tramos: [{ desde: "2026-11-15", hasta: "2026-11-28" }], diasDisponibles: 14 }).some((m) => /empieza hoy/.test(m)));
  assert.ok(validarPropuesta({ ...base, tramos: [{ desde: "2027-01-04", hasta: "2027-01-13" }], diasDisponibles: 14 }).some((m) => /faltan repartir 4/.test(m)));
  assert.ok(validarPropuesta({ ...base, tramos: [{ desde: "2027-01-04", hasta: "2027-01-12" }, { desde: "2027-01-10", hasta: "2027-01-16" }], diasDisponibles: 14 }).some((m) => /se pisan/.test(m)));
});

test("propuesta: respeta la ventana de la persona (su área o proyecto)", () => {
  const ventanaPersona = { enabled: true, tramos: [{ inicio: "12-01", fin: "02-28" }] };
  assert.ok(validarPropuesta({ ...base, ventanaPersona, tramos: [{ desde: "2027-03-01", hasta: "2027-03-14" }], diasDisponibles: 14 }).some((m) => /tu ventana/.test(m)));
  assert.deepEqual(validarPropuesta({ ...base, ventanaPersona, tramos: [{ desde: "2027-01-04", hasta: "2027-01-17" }], diasDisponibles: 14 }), []);
});

test("otorgamiento: el aviso sólo para lo que asigna la empresa; fin después del cierre", () => {
  const o = { hoy: "2026-12-20", desde: "2027-01-04", hasta: "2027-01-17", avisoDias: 30, ventana: VENTANA };
  assert.deepEqual(validarOtorgamiento({ ...o, hoy: "2026-11-15", porLaEmpresa: true }), []);
  assert.ok(validarOtorgamiento({ ...o, porLaEmpresa: true }).some((m) => /aviso no llega/.test(m)));
  // Lo propuso la persona: se aprueba aunque falten menos de 30 días; sólo no puede haber empezado.
  assert.deepEqual(validarOtorgamiento({ ...o, porLaEmpresa: false }), []);
  assert.ok(validarOtorgamiento({ ...o, hoy: "2027-01-05", porLaEmpresa: false }).some((m) => /ya pasó/.test(m)));
  assert.ok(validarOtorgamiento({ ...o, hoy: "2026-11-15", desde: "2027-04-25", hasta: "2027-05-08", porLaEmpresa: false }).some((m) => /cierre de la ventana/.test(m)));
});

test("sugerencia: primer tramo único libre desde hoy + aviso", () => {
  const t = sugerirTramoUnico({ dias: 14, ventana: VENTANA, desdeMinimo: "2026-12-15", diasCorridos: true });
  assert.deepEqual(t, { desde: "2026-12-15", hasta: "2026-12-28" });
});

test("sugerencia: salta los días bloqueados y sigue continuo", () => {
  const bloqueadas = ["2026-12-20", "2026-12-21"];
  const t = sugerirTramoUnico({ dias: 14, ventana: VENTANA, desdeMinimo: "2026-12-15", diasCorridos: true, bloqueadas });
  assert.deepEqual(t, { desde: "2026-12-22", hasta: "2027-01-04" });
});

test("sugerencia: con días hábiles arranca un día hábil; sin lugar, null", () => {
  // 19/12/2026 es sábado: arranca el lunes 21.
  const t = sugerirTramoUnico({ dias: 10, ventana: VENTANA, desdeMinimo: "2026-12-19", diasCorridos: false });
  assert.equal(t?.desde, "2026-12-21");
  assert.equal(sugerirTramoUnico({ dias: 14, ventana: VENTANA, desdeMinimo: "2027-04-25", diasCorridos: true }), null);
});

test("estado visible y alertas de seguimiento", () => {
  const otorgado = [{ desde: "2027-01-04", hasta: "2027-01-17" }];
  assert.equal(estadoVisible("aprobado_notificado", otorgado, "2026-12-01"), "aprobado_notificado");
  assert.equal(estadoVisible("aprobado_notificado", otorgado, "2027-01-10"), "en_curso");
  assert.equal(estadoVisible("asignado_por_empresa_notificado", otorgado, "2027-02-01"), "gozado");
  const a = alertasDeInvitacion({ estado: "invitado", fechaLimite: "2026-11-16", invitadoAt: "2026-11-02", hoy: "2026-11-15", avisoDias: 30 });
  assert.deepEqual(a.map((x) => x.codigo).sort(), ["limite_por_vencer", "sin_acuse"]);
  const b = alertasDeInvitacion({ estado: "propuso_fechas", fechaLimite: "2026-11-29", tramos: [{ desde: "2026-12-10", hasta: "2026-12-23" }], hoy: "2026-11-15", avisoDias: 30 });
  assert.ok(!b.some((x) => x.codigo === "aviso_insuficiente"));
  const pronto = alertasDeInvitacion({ estado: "propuso_fechas", fechaLimite: "2026-11-29", tramos: [{ desde: "2026-11-20", hasta: "2026-12-03" }], hoy: "2026-11-15", avisoDias: 30 });
  assert.ok(pronto.some((x) => x.codigo === "empieza_pronto"));
});

/* ─────────────────────────── A quién se invita, por tipo de contrato ─────────────────────────── */

const INDETERMINADO = TI;
const PLAZO_FIJO = PF;
const EVENTUAL = "6a6a6d75bcadd17480569096"; // deshabilitado en «Visibilidad por tipo de Contrato»
const POBLACION = { porTipo: [{ id: INDETERMINADO, nombre: "Tiempo Indeterminado", personas: 40 }, { id: PLAZO_FIJO, nombre: "Plazo fijo 6x6", personas: 25 }, { id: EVENTUAL, nombre: "Eventual", personas: 10 }], sinContrato: 4 };

test("tipos: la lista se guarda como ids del catálogo, sin repetir y ordenada; los números viejos de FRAME se descartan", () => {
  assert.deepEqual(normalizarTiposContrato([PF, TI.toUpperCase(), PF, "", null, "abc", true, 4, "0"]), [TI, PF].sort());
  assert.deepEqual(normalizarTiposContrato(undefined), []);
  assert.deepEqual(normalizarTiposContrato("1,2"), []);
});

test("tipos: sin selección se invita a todos los tipos, pero nunca a quien no tiene contrato vigente", () => {
  assert.equal(motivoDeNoInvitar({ tipoContratoId: INDETERMINADO, seleccion: [], deshabilitados: [] }), null);
  assert.equal(motivoDeNoInvitar({ tipoContratoId: null, seleccion: [], deshabilitados: [] }), "sin_contrato_vigente");
  assert.deepEqual(resumenDeInvitables(POBLACION, [], []), { invitar: 75, tipoDeshabilitado: 0, tipoNoIncluido: 0, sinContrato: 4 });
});

test("tipos: con un solo tipo, sólo quien tiene el contrato vigente de cómputo de ese tipo", () => {
  assert.equal(motivoDeNoInvitar({ tipoContratoId: PLAZO_FIJO, seleccion: [PLAZO_FIJO], deshabilitados: [] }), null);
  assert.equal(motivoDeNoInvitar({ tipoContratoId: INDETERMINADO, seleccion: [PLAZO_FIJO], deshabilitados: [] }), "tipo_no_incluido");
  assert.deepEqual(resumenDeInvitables(POBLACION, [PLAZO_FIJO], []), { invitar: 25, tipoDeshabilitado: 0, tipoNoIncluido: 50, sinContrato: 4 });
});

test("tipos: con selección, quien no tiene contrato vigente en su empresa de cómputo queda afuera", () => {
  assert.equal(motivoDeNoInvitar({ tipoContratoId: null, seleccion: [INDETERMINADO], deshabilitados: [] }), "sin_contrato_vigente");
});

test("tipos: uno deshabilitado nunca se invita, ni tildado ni sin selección", () => {
  assert.equal(motivoDeNoInvitar({ tipoContratoId: EVENTUAL, seleccion: [EVENTUAL], deshabilitados: [EVENTUAL] }), "tipo_deshabilitado");
  assert.equal(motivoDeNoInvitar({ tipoContratoId: EVENTUAL, seleccion: [], deshabilitados: [EVENTUAL] }), "tipo_deshabilitado");
  assert.deepEqual(resumenDeInvitables(POBLACION, [INDETERMINADO, EVENTUAL], [EVENTUAL]), { invitar: 40, tipoDeshabilitado: 10, tipoNoIncluido: 25, sinContrato: 4 });
  assert.deepEqual(resumenDeInvitables(POBLACION, [], [EVENTUAL]), { invitar: 65, tipoDeshabilitado: 10, tipoNoIncluido: 0, sinContrato: 4 });
});

test("tipos: la vista previa da lo mismo que decidir persona por persona (lo que hace el lanzamiento)", () => {
  const personas: (string | null)[] = [...POBLACION.porTipo.flatMap((t) => Array(t.personas).fill(t.id)), ...Array(POBLACION.sinContrato).fill(null)];
  for (const seleccion of [[], [INDETERMINADO], [PLAZO_FIJO, EVENTUAL], [INDETERMINADO, PLAZO_FIJO, EVENTUAL]]) {
    const reales = personas.filter((tipoContratoId) => !motivoDeNoInvitar({ tipoContratoId, seleccion, deshabilitados: [EVENTUAL] })).length;
    assert.equal(resumenDeInvitables(POBLACION, seleccion, [EVENTUAL]).invitar, reales);
  }
});

test("fraccionar: en orden de fecha, cada tramo con el mínimo salvo el último si quedan menos", () => {
  const p = (diasDisponibles: number, ...tramos: [string, string][]) => validarPropuesta({ ...base, diasDisponibles, tramos: tramos.map(([desde, hasta]) => ({ desde, hasta })) });
  // 10 días: 7 + 3 está bien; 3 + 7 no (el primero tiene que tener 7).
  assert.deepEqual(p(10, ["2027-01-04", "2027-01-10"], ["2027-02-01", "2027-02-03"]), []);
  assert.ok(p(10, ["2027-01-04", "2027-01-06"], ["2027-02-01", "2027-02-07"]).some((m) => /tramo 1 tiene menos de 7/.test(m)));
  // El orden es el de las fechas, no el de carga: 3 (en febrero) + 7 (en enero) está bien.
  assert.deepEqual(p(10, ["2027-02-01", "2027-02-03"], ["2027-01-04", "2027-01-10"]), []);
  // 14 días: 8 + 6 está bien (después del primero quedan 6); 7 + 3 + 4 no (con 7 que quedan, el segundo lleva 7).
  assert.deepEqual(p(14, ["2027-01-04", "2027-01-11"], ["2027-02-01", "2027-02-06"]), []);
  assert.ok(p(14, ["2027-01-04", "2027-01-10"], ["2027-02-01", "2027-02-03"], ["2027-03-01", "2027-03-04"]).some((m) => /tramo 2 tiene menos de 7/.test(m)));
  // 17 días: 7 + 7 + 3 está bien.
  assert.deepEqual(p(17, ["2027-01-04", "2027-01-10"], ["2027-02-01", "2027-02-07"], ["2027-03-01", "2027-03-03"]), []);
  // 10 días: 7 + 2 + 1 no (con 3 que quedan, van juntos).
  assert.ok(p(10, ["2027-01-04", "2027-01-10"], ["2027-02-01", "2027-02-02"], ["2027-03-01", "2027-03-01"]).some((m) => /quedan 3/.test(m)));
});

test("fraccionar: con menos del mínimo en total no se fracciona; un solo tramo, bien", () => {
  assert.ok(validarPropuesta({ ...base, diasDisponibles: 5, tramos: [{ desde: "2027-01-04", hasta: "2027-01-05" }, { desde: "2027-02-01", hasta: "2027-02-03" }] }).some((m) => /no se puede fraccionar/.test(m)));
  assert.deepEqual(validarPropuesta({ ...base, diasDisponibles: 5, tramos: [{ desde: "2027-01-04", hasta: "2027-01-08" }] }), []);
});

test("días de inicio: se guardan sin repetir y los siete son cualquier día", () => {
  assert.deepEqual(normalizarDiasDeInicio([5, 1, 1, 9, "2", null]), [1, 2, 5]);
  assert.deepEqual(normalizarDiasDeInicio([0, 1, 2, 3, 4, 5, 6]), []);
  assert.deepEqual(normalizarDiasDeInicio([0, 1]), [1, 0]);
  assert.deepEqual(normalizarDiasDeInicio("x"), []);
  assert.equal(textoDiasDeInicio([]), "cualquier día");
  assert.equal(textoDiasDeInicio([1]), "los lunes");
  assert.equal(textoDiasDeInicio([1, 5]), "los lunes o viernes");
  assert.equal(textoDiasDeInicio([6, 1, 3]), "los lunes, miércoles o sábados");
  assert.deepEqual(normalizarConfigCampania({ diasDeInicio: [1] }).diasDeInicio, [1]);
});

test("días de inicio: la propuesta y la sugerencia empiezan un día permitido", () => {
  // 04/01/2027 es lunes; 05/01, martes.
  assert.deepEqual(validarPropuesta({ ...base, diasDeInicio: [1], tramos: [{ desde: "2027-01-04", hasta: "2027-01-17" }], diasDisponibles: 14 }), []);
  assert.ok(validarPropuesta({ ...base, diasDeInicio: [1], tramos: [{ desde: "2027-01-05", hasta: "2027-01-18" }], diasDisponibles: 14 }).some((m) => /empieza un martes.*sólo los lunes/.test(m)));
  // 15/12/2026 es martes: la sugerencia arranca el lunes 21.
  assert.equal(sugerirTramoUnico({ dias: 14, ventana: VENTANA, desdeMinimo: "2026-12-15", diasCorridos: true, diasDeInicio: [1] })?.desde, "2026-12-21");
});

test("turnos: la más antigua primero, uno cada N días, recortado a la fecha límite", () => {
  const miembros = [
    { invitacionId: "b", nombre: "Beto", antiguedadDias: 400 },
    { invitacionId: "a", nombre: "Ana", antiguedadDias: 2000 },
    { invitacionId: "c", nombre: "Carla", antiguedadDias: 400, ingreso: "2020-01-01" },
  ];
  const t = armarTurnos({ grupo: "g", reglaId: "r", regla: "Animador 2D", miembros, base: "2026-11-23", diasPorTurno: 3, fechaLimite: "2026-11-27" });
  assert.deepEqual([...t.values()].map((x) => [x.orden, x.desde, x.recortado]), [[1, "2026-11-23", false], [2, "2026-11-26", false], [3, "2026-11-27", true]]);
  assert.equal(t.get("a")?.orden, 1);
  assert.equal(t.get("c")?.orden, 2); // empata con Beto en antigüedad, ingresó antes
  assert.deepEqual(t.get("b")?.delante, ["a", "c"]);
  assert.equal(armarTurnos({ grupo: "g", reglaId: "r", regla: "", miembros: [miembros[0]], base: "2026-11-23", diasPorTurno: 3, fechaLimite: "" }).size, 0);
});

test("turnos: abierto por fecha o porque las de adelante ya eligieron", () => {
  const t = armarTurnos({ grupo: "g", reglaId: "r", regla: "Animador 2D", miembros: [{ invitacionId: "a", nombre: "A", antiguedadDias: 9 }, { invitacionId: "b", nombre: "B", antiguedadDias: 1 }], base: "2026-11-23", diasPorTurno: 3, fechaLimite: "2026-12-18" });
  const deB = [t.get("b")!];
  assert.deepEqual(estadoDelTurno(deB, "2026-11-24", () => false), { abierto: false, desde: "2026-11-26", esperando: 1, orden: 2, de: 2, regla: "Animador 2D" });
  assert.equal(estadoDelTurno(deB, "2026-11-24", (id) => id === "a").abierto, true);
  assert.equal(estadoDelTurno(deB, "2026-11-26", () => false).abierto, true);
  assert.equal(estadoDelTurno([t.get("a")!], "2026-11-23", () => false).abierto, true);
  assert.equal(estadoDelTurno([], "2026-11-23", () => false).abierto, true);
});

test("errores con código y tramo: el calendario muestra sólo los del tramo que se está eligiendo", () => {
  // 14 días, lunes: tramo 1 de 4 (corto), tramo 2 de 7 que se pisa con el 3, tramo 3 empieza un martes.
  const e = erroresDePropuesta({ ...base, diasDeInicio: [1], diasDisponibles: 14, tramos: [{ desde: "2027-01-04", hasta: "2027-01-07" }, { desde: "2027-02-01", hasta: "2027-02-07" }, { desde: "2027-02-02", hasta: "2027-02-08" }] });
  assert.deepEqual(e.map((x) => [x.codigo, x.tramo ?? x.tramos]), [["dia_inicio", 2], ["minimo", 0], ["se_pisan", [1, 2]], ["sobran", undefined]]);
  assert.deepEqual(erroresDelTramo(e, 0).map((x) => x.codigo), ["minimo"]);
  assert.deepEqual(erroresDelTramo(e, 1).map((x) => x.codigo), ["se_pisan"]);
  assert.deepEqual(erroresDelTramo(e, 2).map((x) => x.codigo), ["dia_inicio", "se_pisan"]);
  // Los mensajes son los mismos que validarPropuesta.
  assert.deepEqual(validarPropuesta({ ...base, diasDisponibles: 14, tramos: [{ desde: "2027-01-04", hasta: "2027-01-07" }] }), e.filter((x) => x.codigo === "faltan" || x.codigo === "sobran").length ? ["Te faltan repartir 10 día(s): tenés 14."] : []);
  // Con menos del mínimo en total, «no se puede fraccionar» apunta a todos los tramos.
  const nf = erroresDePropuesta({ ...base, diasDisponibles: 5, tramos: [{ desde: "2027-01-04", hasta: "2027-01-05" }, { desde: "2027-02-01", hasta: "2027-02-03" }] });
  assert.deepEqual(nf.find((x) => x.codigo === "no_fraccionar")?.tramos, [0, 1]);
  assert.equal(erroresDelTramo(nf, 1).length, 1);
  assert.deepEqual(erroresDePropuesta({ ...base, diasDisponibles: 14, tramos: [] }).map((x) => x.codigo), ["sin_tramos"]);
});

test("mínimo del tramo, para avisarlo en el calendario antes de confirmar", () => {
  const m = (desde: string, otros: [string, string][], diasDisponibles = 10) => minimoDelTramo({ desde, otros: otros.map(([a, b]) => ({ desde: a, hasta: b })), diasDisponibles, minPorTramo: 7, diasCorridos: true });
  // Un solo tramo: no se fracciona, nada que avisar. Sin inicio, tampoco.
  assert.equal(m("2027-01-04", []), 0);
  assert.equal(m("", [["2027-01-04", "2027-01-10"]]), 0);
  // 10 días: con 7 ya elegidos en enero, el tramo de febrero lleva los 3 que quedan; uno antes de enero lleva 7.
  assert.equal(m("2027-02-01", [["2027-01-04", "2027-01-10"]]), 3);
  assert.equal(m("2026-12-07", [["2027-01-04", "2027-01-10"]]), 7);
  // 17 días: 7 + 7 ya elegidos, el tercero lleva 3; con 5 en total no se fracciona: van los 5 juntos.
  assert.equal(m("2027-03-01", [["2027-01-04", "2027-01-10"], ["2027-02-01", "2027-02-07"]], 17), 3);
  assert.equal(m("2027-02-01", [["2027-01-04", "2027-01-05"]], 5), 5);
  // Los otros tramos incompletos no cuentan.
  assert.equal(m("2027-02-01", [["", ""]]), 0);
});
