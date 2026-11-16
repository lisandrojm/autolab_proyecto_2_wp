import { test } from "node:test";
import assert from "node:assert/strict";
import { alertasDeInvitacion, alertasDeLanzamiento, contarDiasTramo, estadoVisible, hastaParaDias, normalizarConfigCampania, sugerirTramoUnico, validarOtorgamiento, validarPropuesta, ventanaDeLaTemporada } from "./campania.js";

const VENTANA = { desde: "2026-11-01", hasta: "2027-04-30" };
const base = { ventana: VENTANA, hoy: "2026-11-15", avisoDias: 30, minPorTramo: 7, diasCorridos: true };

test("config: lo que falta o viene mal cae al de por defecto", () => {
  assert.deepEqual(normalizarConfigCampania(undefined), { activa: false, plazoParaDefinirDias: 14, avisoMinimoDias: 30, minDiasPorTramo: 7 });
  assert.deepEqual(normalizarConfigCampania({ activa: true, plazoParaDefinirDias: "20", avisoMinimoDias: -3, minDiasPorTramo: 0 }), { activa: true, plazoParaDefinirDias: 20, avisoMinimoDias: 30, minDiasPorTramo: 7 });
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
