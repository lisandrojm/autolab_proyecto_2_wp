import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoDeNoInvitar, normalizarTiposContrato, resumenDeInvitables, alertasDeInvitacion, alertasDeLanzamiento, contarDiasTramo, estadoVisible, hastaParaDias, normalizarConfigCampania, sugerirTramoUnico, validarOtorgamiento, validarPropuesta, ventanaDeLaTemporada } from "./campania.js";

/** Dos tipos del catálogo (`contratos`): la campaña elige por su `_id`, no por el número de FRAME. */
const TI = "6a6a6d75bcadd1748056908d";
const PF = "6a6a6d74bcadd17480569075";

const VENTANA = { desde: "2026-11-01", hasta: "2027-04-30" };
const base = { ventana: VENTANA, hoy: "2026-11-15", avisoDias: 30, minPorTramo: 7, diasCorridos: true };

test("config: lo que falta o viene mal cae al de por defecto", () => {
  assert.deepEqual(normalizarConfigCampania(undefined), { activa: false, plazoParaDefinirDias: 14, avisoMinimoDias: 30, minDiasPorTramo: 7, tiposContratoInvitar: [] });
  assert.deepEqual(normalizarConfigCampania({ activa: true, plazoParaDefinirDias: "20", avisoMinimoDias: -3, minDiasPorTramo: 0 }), { activa: true, plazoParaDefinirDias: 20, avisoMinimoDias: 30, minDiasPorTramo: 7, tiposContratoInvitar: [] });
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

test("lanzamiento: el aviso recorta el primer inicio posible", () => {
  const a = alertasDeLanzamiento({ hoy: "2026-11-15", plazoDias: 14, avisoDias: 30, ventana: VENTANA });
  assert.ok(a.some((x) => x.codigo === "inicio_recortado"));
});

test("propuesta: un tramo con todos los días, bien", () => {
  assert.deepEqual(validarPropuesta({ ...base, tramos: [{ desde: "2027-01-04", hasta: "2027-01-17" }], diasDisponibles: 14 }), []);
});

test("propuesta: fraccionada en dos de 7, bien; con un tramo corto, error", () => {
  assert.deepEqual(validarPropuesta({ ...base, tramos: [{ desde: "2027-01-04", hasta: "2027-01-10" }, { desde: "2027-02-01", hasta: "2027-02-07" }], diasDisponibles: 14 }), []);
  const e = validarPropuesta({ ...base, tramos: [{ desde: "2027-01-04", hasta: "2027-01-12" }, { desde: "2027-02-01", hasta: "2027-02-05" }], diasDisponibles: 14 });
  assert.ok(e.some((m) => /menos de 7/.test(m)));
});

test("propuesta: fuera de la ventana, aviso insuficiente, suma distinta, tramos que se pisan", () => {
  assert.ok(validarPropuesta({ ...base, tramos: [{ desde: "2027-04-25", hasta: "2027-05-08" }], diasDisponibles: 14 }).some((m) => /ventana/.test(m)));
  assert.ok(validarPropuesta({ ...base, tramos: [{ desde: "2026-11-20", hasta: "2026-12-03" }], diasDisponibles: 14 }).some((m) => /avisar con 30/.test(m)));
  assert.ok(validarPropuesta({ ...base, tramos: [{ desde: "2027-01-04", hasta: "2027-01-13" }], diasDisponibles: 14 }).some((m) => /faltan repartir 4/.test(m)));
  assert.ok(validarPropuesta({ ...base, tramos: [{ desde: "2027-01-04", hasta: "2027-01-12" }, { desde: "2027-01-10", hasta: "2027-01-16" }], diasDisponibles: 14 }).some((m) => /se pisan/.test(m)));
});

test("propuesta: respeta la ventana de la persona (su área o proyecto)", () => {
  const ventanaPersona = { enabled: true, tramos: [{ inicio: "12-01", fin: "02-28" }] };
  assert.ok(validarPropuesta({ ...base, ventanaPersona, tramos: [{ desde: "2027-03-01", hasta: "2027-03-14" }], diasDisponibles: 14 }).some((m) => /tu ventana/.test(m)));
  assert.deepEqual(validarPropuesta({ ...base, ventanaPersona, tramos: [{ desde: "2027-01-04", hasta: "2027-01-17" }], diasDisponibles: 14 }), []);
});

test("otorgamiento: aviso que no llega y fin después del cierre", () => {
  assert.deepEqual(validarOtorgamiento({ hoy: "2026-11-15", desde: "2027-01-04", hasta: "2027-01-17", avisoDias: 30, ventana: VENTANA }), []);
  assert.ok(validarOtorgamiento({ hoy: "2026-12-20", desde: "2027-01-04", hasta: "2027-01-17", avisoDias: 30, ventana: VENTANA }).some((m) => /aviso no llega/.test(m)));
  assert.ok(validarOtorgamiento({ hoy: "2026-11-15", desde: "2027-04-25", hasta: "2027-05-08", avisoDias: 30, ventana: VENTANA }).some((m) => /cierre de la ventana/.test(m)));
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
  assert.ok(b.some((x) => x.codigo === "aviso_insuficiente"));
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

test("tipos: sin selección se invita a todos (la población de siempre)", () => {
  assert.equal(motivoDeNoInvitar({ tipoContratoId: INDETERMINADO, seleccion: [], deshabilitados: [] }), null);
  assert.equal(motivoDeNoInvitar({ tipoContratoId: null, seleccion: [], deshabilitados: [] }), null);
  assert.deepEqual(resumenDeInvitables(POBLACION, [], []), { invitar: 79, tipoDeshabilitado: 0, tipoNoIncluido: 0, sinContrato: 0 });
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
  assert.deepEqual(resumenDeInvitables(POBLACION, [], [EVENTUAL]), { invitar: 69, tipoDeshabilitado: 10, tipoNoIncluido: 0, sinContrato: 0 });
});

test("tipos: la vista previa da lo mismo que decidir persona por persona (lo que hace el lanzamiento)", () => {
  const personas: (string | null)[] = [...POBLACION.porTipo.flatMap((t) => Array(t.personas).fill(t.id)), ...Array(POBLACION.sinContrato).fill(null)];
  for (const seleccion of [[], [INDETERMINADO], [PLAZO_FIJO, EVENTUAL], [INDETERMINADO, PLAZO_FIJO, EVENTUAL]]) {
    const reales = personas.filter((tipoContratoId) => !motivoDeNoInvitar({ tipoContratoId, seleccion, deshabilitados: [EVENTUAL] })).length;
    assert.equal(resumenDeInvitables(POBLACION, seleccion, [EVENTUAL]).invitar, reales);
  }
});
