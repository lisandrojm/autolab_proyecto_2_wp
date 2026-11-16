import { Types } from "mongoose";
import { CampaniaVacaciones, InvitacionVacaciones, type ICampaniaVacaciones, type IInvitacionVacaciones } from "../../models/CampaniaVacaciones.js";
import { Vacation, type IVacation } from "../../models/Vacation.js";
import { VacationConfig } from "../../models/VacationConfig.js";
import { UserProfile } from "../../models/UserProfile.js";
import { Notification } from "../../models/Notification.js";
import { hoyArgentina } from "../../utils/contratoVigencia.js";
import { diasHasta, fechaCorta, sumarDias } from "../../compartido/planVacaciones/fechas.js";
import { normalizarVentana, rangoPermitido } from "../../compartido/ventanaGoce.js";
import {
  ETIQUETA_ESTADO,
  OTORGADOS,
  PUEDE_PROPONER,
  RESUELTOS,
  alertasDeInvitacion,
  alertasDeLanzamiento,
  contarDiasTramo,
  estadoVisible,
  fechaLimite as calcularFechaLimite,
  normalizarConfigCampania,
  primerInicioPosible,
  sugerirTramoUnico,
  validarOtorgamiento,
  validarPropuesta,
  ventanaDeLaTemporada,
  type Tramo,
} from "../../compartido/vacaciones/campania.js";
import { NOVEDAD_CAMPANIA_INVITACION, NOVEDAD_CAMPANIA_RECORDATORIO, NOVEDAD_VACACION_OTORGADA, notificar } from "../novedadesNotificaciones.js";
import { saldosDeVacaciones } from "./saldos.js";
import { ErrorVacacion, adjustBalanceOnRequestChange, configsEfectivasEnLote, crearVacacionParaPersona, preAprobarVacacion } from "./crearVacacion.js";
import { aprobarComoAdmin, iniciarAprobacion } from "./aprobacionPorEtapas.js";
import { fechasBloqueadas } from "./solapamiento.js";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CAMPAÑA DE GOCE DE VACACIONES (15/11/2026): el circuito
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  1. El admin crea la campaña (borrador) y ve las alertas de plazo; al lanzarla se invita a cada
 *     persona activa con días disponibles, con fecha límite (hoy + plazo).
 *  2. La persona acusa recibo y propone uno o más tramos desde la app: cada tramo es una `Vacation`
 *     (`origen: "campania"`) que sube por la jerarquía Supervisor → Coordinador → Admin.
 *  3. Al aprobar el admin el último tramo, queda el aviso por escrito (los PDF) y la persona acusa recibo.
 *  4. Si no eligió a tiempo, el barrido la marca vencida y el sistema le sugiere UN TRAMO ÚNICO; el admin
 *     lo mueve si quiere y lo confirma: se otorga y se notifica igual. NUNCA se paga en lugar de gozar.
 *
 * Las reglas puras están en `compartido/vacaciones/campania.ts`.
 */

const iso = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const oid = (x: unknown) => new Types.ObjectId(String(x));
const paso = (accion: string, porUserId?: string | null, detalle?: string) => ({ accion, porUserId: porUserId && Types.ObjectId.isValid(porUserId) ? oid(porUserId) : null, at: new Date(), detalle });
const ventanaDe = (c: Pick<ICampaniaVacaciones, "ventanaDesde" | "ventanaHasta">) => ({ desde: c.ventanaDesde, hasta: c.ventanaHasta });
const periodoTexto = (t: Tramo) => `del ${fechaCorta(t.desde)} al ${fechaCorta(t.hasta)}`;

/** El texto del aviso por escrito del otorgamiento (queda guardado en la invitación, junto con los PDF). */
function textoDeOtorgamiento(c: ICampaniaVacaciones, nombre: string, tramos: (Tramo & { dias: number })[], asignadaPorEmpresa: boolean): string {
  const detalle = tramos.map((t) => `${periodoTexto(t)} (${t.dias} días)`).join("; ");
  return (
    `${nombre}: se le comunica el otorgamiento de sus vacaciones anuales del período ${c.anio}, ${detalle}.` +
    (asignadaPorEmpresa ? " No habiendo elegido fechas dentro del plazo de la campaña, la empresa las fija en un tramo único." : " Corresponden a las fechas que usted propuso.") +
    ` Esta comunicación se cursa por escrito con al menos ${c.avisoMinimoDias} días de anticipación al inicio (LCT, art. 154).`
  );
}

/* ─────────────────────────── Carga ─────────────────────────── */

export async function cargarCampania(tid: Types.ObjectId, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ErrorVacacion("Campaña inválida", 400);
  const c = await CampaniaVacaciones.findOne({ _id: id, tenantId: tid });
  if (!c) throw new ErrorVacacion("Campaña no encontrada", 404);
  return c;
}

async function cargarInvitacion(tid: Types.ObjectId, campaniaId: string, invId: string) {
  if (!Types.ObjectId.isValid(invId)) throw new ErrorVacacion("Invitación inválida", 400);
  const inv = await InvitacionVacaciones.findOne({ _id: invId, tenantId: tid, campaniaId });
  if (!inv) throw new ErrorVacacion("Invitación no encontrada", 404);
  return inv;
}

/** Los días que le quedan HOY del año de la campaña (cambian si pidió vacaciones por otra vía). */
async function diasAhora(tid: Types.ObjectId, userId: string, anio: number): Promise<number> {
  const [f] = await saldosDeVacaciones(String(tid), tid, anio, { userIds: [userId] });
  return Math.max(0, Number(f?.display?.available ?? 0));
}

/* ─────────────────────────── Admin ─────────────────────────── */

export async function crearCampania(tid: Types.ObjectId, actorId: string, body: { nombre?: string }) {
  const config: any = await VacationConfig.findOne({ tenantId: tid }).lean();
  const cfg = normalizarConfigCampania(config?.campania);
  if (!cfg.activa) throw new ErrorVacacion("La campaña de goce está desactivada: activala en Configuración › Vacaciones › Campaña de goce.");
  const hoy = hoyArgentina();
  const ventana = ventanaDeLaTemporada(hoy, normalizarVentana(config?.ventanaGoce));
  const anio = Number(ventana.desde.slice(0, 4));
  const abierta = await CampaniaVacaciones.findOne({ tenantId: tid, anio, estado: { $ne: "cerrada" } }).select("nombre").lean();
  if (abierta) throw new ErrorVacacion(`Ya hay una campaña abierta para la temporada ${anio}: «${abierta.nombre}».`);
  const campania = await CampaniaVacaciones.create({
    tenantId: tid,
    anio,
    nombre: (body.nombre || "").trim() || `Vacaciones ${anio}/${String(anio + 1).slice(2)}`,
    ventanaDesde: ventana.desde,
    ventanaHasta: ventana.hasta,
    plazoParaDefinirDias: cfg.plazoParaDefinirDias,
    avisoMinimoDias: cfg.avisoMinimoDias,
    minDiasPorTramo: cfg.minDiasPorTramo,
    estado: "borrador",
    creadaPor: oid(actorId),
  });
  return { campania, alertas: alertasDeLanzamiento({ hoy, plazoDias: cfg.plazoParaDefinirDias, avisoDias: cfg.avisoMinimoDias, ventana }) };
}

export async function listarCampanias(tid: Types.ObjectId): Promise<any[]> {
  const [campanias, conteos] = await Promise.all([
    CampaniaVacaciones.find({ tenantId: tid }).sort({ createdAt: -1 }).lean(),
    InvitacionVacaciones.aggregate([{ $match: { tenantId: tid } }, { $group: { _id: { c: "$campaniaId", e: "$estado" }, n: { $sum: 1 } } }]),
  ]);
  const porCampania = new Map<string, { total: number; resueltas: number }>();
  for (const r of conteos) {
    const k = String(r._id.c);
    const acc = porCampania.get(k) || { total: 0, resueltas: 0 };
    acc.total += r.n;
    if (RESUELTOS.includes(r._id.e)) acc.resueltas += r.n;
    porCampania.set(k, acc);
  }
  return campanias.map((c) => ({ ...c, invitaciones: porCampania.get(String(c._id)) || { total: 0, resueltas: 0 } }));
}

/** Las fechas otorgadas (o en camino) de una invitación: lo propuesto, o lo asignado por la empresa. */
const fechasDe = (inv: Pick<IInvitacionVacaciones, "tramos" | "asignacion">): Tramo[] => (inv.asignacion?.vacationId && inv.asignacion.desde ? [{ desde: inv.asignacion.desde, hasta: inv.asignacion.hasta }] : (inv.tramos || []).map((t) => ({ desde: t.desde, hasta: t.hasta })));

/** El tablero: la campaña, cada invitación con su estado visible y sus alertas, y cuántas hay en cada estado. */
export async function tablero(tid: Types.ObjectId, id: string): Promise<{ campania: any; invitaciones: any[]; conteos: Record<string, number>; alertas: any[]; hoy: string }> {
  const c = await cargarCampania(tid, id);
  const hoy = hoyArgentina();
  const invitaciones = await InvitacionVacaciones.find({ tenantId: tid, campaniaId: c._id }).sort({ nombre: 1 }).lean();
  // El estado de cada tramo propuesto (pendiente en la jerarquía, aprobado, rechazado), para la tabla.
  const idsVac = invitaciones.flatMap((i) => [...(i.tramos || []).map((t) => t.vacationId), i.asignacion?.vacationId]).filter(Boolean);
  const vacaciones = idsVac.length ? await Vacation.find({ _id: { $in: idsVac } }).select("status startDate endDate daysRequested pdfPreAprobacionUrl signatureStatus").lean() : [];
  const vacPorId = new Map(vacaciones.map((v: any) => [String(v._id), v]));
  const conteos: Record<string, number> = {};
  const filas = invitaciones.map((i) => {
    const visible = estadoVisible(i.estado, fechasDe(i), hoy);
    conteos[visible] = (conteos[visible] || 0) + 1;
    return {
      ...i,
      estadoVisible: visible,
      etiquetaEstado: ETIQUETA_ESTADO[visible],
      alertas: alertasDeInvitacion({ estado: i.estado, fechaLimite: i.fechaLimite, acuseInvitacionAt: i.acuseInvitacionAt, invitadoAt: i.invitadoAt, tramos: i.tramos, hoy, avisoDias: c.avisoMinimoDias }),
      tramos: (i.tramos || []).map((t) => ({ ...t, vacacion: t.vacationId ? vacPorId.get(String(t.vacationId)) || null : null })),
      vacacionAsignada: i.asignacion?.vacationId ? vacPorId.get(String(i.asignacion.vacationId)) || null : null,
    };
  });
  const alertas = c.estado === "borrador" ? alertasDeLanzamiento({ hoy, plazoDias: c.plazoParaDefinirDias, avisoDias: c.avisoMinimoDias, ventana: ventanaDe(c) }) : [];
  return { campania: c.toObject(), invitaciones: filas, conteos, alertas, hoy };
}

/**
 * LANZAR: una invitación por persona ACTIVA con días disponibles del año de la campaña (la misma cuenta
 * que Gestión por Usuario, que ya descuenta lo pendiente: un bloque del plan por proyecto no se invita
 * dos veces). Fecha límite = hoy + plazo. Avisa a cada una por la campanita.
 */
export async function lanzarCampania(tid: Types.ObjectId, id: string, actorId: string) {
  const c = await cargarCampania(tid, id);
  if (c.estado !== "borrador") throw new ErrorVacacion("La campaña ya se lanzó.");
  const hoy = hoyArgentina();
  const limite = calcularFechaLimite(hoy, c.plazoParaDefinirDias);
  const config: any = await VacationConfig.findOne({ tenantId: tid }).lean();

  const saldos = await saldosDeVacaciones(String(tid), tid, c.anio);
  const candidatos = saldos.filter((f: any) => f.metadata?.activo === true && Number(f.display?.available) > 0);
  const ya = new Set((await InvitacionVacaciones.find({ tenantId: tid, campaniaId: c._id }).select("userId").lean()).map((i) => String(i.userId)));
  const nuevos = candidatos.filter((f: any) => !ya.has(String(f.userId)));

  const perfiles = nuevos.length ? await UserProfile.find({ tenantId: tid, userId: { $in: nuevos.map((f: any) => oid(f.userId)) } }).select("userId department").lean() : [];
  const areaDe = new Map(perfiles.map((p: any) => [String(p.userId), p.department || null]));
  const configs = await configsEfectivasEnLote(tid, nuevos.map((f: any) => ({ userId: String(f.userId), projectIds: f.projectIds || [], areaNombre: areaDe.get(String(f.userId)) })), config || {});

  const docs = nuevos.map((f: any) => {
    const ef = configs.get(String(f.userId));
    const dias = Math.round(Number(f.display.available));
    return {
      tenantId: tid,
      campaniaId: c._id,
      userId: oid(f.userId),
      nombre: `${f.firstName || ""} ${f.lastName || ""}`.trim() || f.email || "",
      diasDisponibles: dias,
      diasCorridos: ef ? ef.diasCorridos : !!config?.diasCorridos,
      ventanaPersona: ef?.ventanaGoce?.enabled ? ef.ventanaGoce : { enabled: false, tramos: [] },
      fechaLimite: limite,
      estado: "invitado",
      invitadoAt: new Date(),
      historial: [paso("invitado", actorId, `Invitado a elegir ${dias} días entre el ${fechaCorta(c.ventanaDesde)} y el ${fechaCorta(c.ventanaHasta)}, hasta el ${fechaCorta(limite)}.`)],
    };
  });
  if (docs.length) await InvitacionVacaciones.insertMany(docs, { ordered: false });

  c.estado = "lanzada";
  c.fechaLimite = limite;
  c.lanzadaPor = oid(actorId);
  c.lanzadaAt = new Date();
  await c.save();

  // Un aviso por persona (cada uno dice sus días): un solo insertMany, no 1.500 viajes a la base.
  if (docs.length) {
    await Notification.insertMany(
      docs.map((d) => ({
        tenantId: tid,
        userId: d.userId,
        type: NOVEDAD_CAMPANIA_INVITACION,
        title: "Elegí tus vacaciones",
        message: `Tenés ${d.diasDisponibles} días de vacaciones para gozar entre el ${fechaCorta(c.ventanaDesde)} y el ${fechaCorta(c.ventanaHasta)}. Elegí tus fechas desde la app hasta el ${fechaCorta(limite)}; si no, la empresa te las asigna.`,
        refId: c._id,
        isRead: false,
      })),
      { ordered: false },
    ).catch((e) => console.error("[CAMPANIA] avisos de invitación:", e?.message || e));
  }

  const diasMasLargo = docs.reduce((m, d) => Math.max(m, d.diasDisponibles), 0);
  return { invitadas: docs.length, alertas: alertasDeLanzamiento({ hoy, plazoDias: c.plazoParaDefinirDias, avisoDias: c.avisoMinimoDias, ventana: ventanaDe(c), diasMasLargo }) };
}

/** Recordatorio a quienes todavía pueden elegir (no propusieron). `automatico`: lo manda el barrido. */
export async function recordar(tid: Types.ObjectId, c: ICampaniaVacaciones, actorId: string | null, filtro: Record<string, unknown> = {}) {
  const invs = await InvitacionVacaciones.find({ tenantId: tid, campaniaId: c._id, estado: { $in: PUEDE_PROPONER }, ...filtro }).select("userId fechaLimite diasDisponibles").lean();
  if (invs.length === 0) return { recordadas: 0 };
  await Notification.insertMany(
    invs.map((i) => ({
      tenantId: tid,
      userId: i.userId,
      type: NOVEDAD_CAMPANIA_RECORDATORIO,
      title: "Todavía no elegiste tus vacaciones",
      message: `Tenés hasta el ${fechaCorta(i.fechaLimite)} para elegir tus ${i.diasDisponibles} días. Si no, la empresa te asigna las fechas.`,
      refId: c._id,
      isRead: false,
    })),
    { ordered: false },
  ).catch((e) => console.error("[CAMPANIA] recordatorio:", e?.message || e));
  await InvitacionVacaciones.updateMany({ _id: { $in: invs.map((i) => i._id) } }, { $push: { recordatorios: { at: new Date(), porUserId: actorId && Types.ObjectId.isValid(actorId) ? oid(actorId) : null, automatico: !actorId }, historial: paso(actorId ? "recordatorio" : "recordatorio_automatico", actorId) } } as any);
  return { recordadas: invs.length };
}

/**
 * EL TRAMO ÚNICO SUGERIDO para quien venció sin elegir: con los días que le quedan HOY, desde hoy +
 * aviso, dentro de la ventana (la de la campaña y la suya), sin tocar días bloqueados por los topes de
 * solapamiento ni sus otras vacaciones. Si ya no le quedan días, queda «sin días pendientes».
 */
export async function sugerirAsignacion(tid: Types.ObjectId, c: ICampaniaVacaciones, inv: IInvitacionVacaciones) {
  const hoy = hoyArgentina();
  const dias = await diasAhora(tid, String(inv.userId), c.anio);
  if (dias <= 0) {
    inv.estado = "sin_dias_pendientes";
    inv.asignacion = null;
    inv.historial.push(paso("sin_dias_pendientes", null, "No le quedan días de este período: no hay nada que asignar."));
    await inv.save();
    return inv;
  }
  const [bloqueos, propias] = await Promise.all([
    fechasBloqueadas(tid, String(inv.userId)).catch(() => [] as { date: string }[]),
    Vacation.find({ tenantId: tid, userId: inv.userId, status: { $nin: ["rejected", "cancelled"] } }).select("startDate endDate").lean(),
  ]);
  const bloqueadas = new Set(bloqueos.map((b) => b.date));
  for (const v of propias) for (let d = iso(v.startDate), guarda = 0; d <= iso(v.endDate) && guarda < 400; d = sumarDias(d, 1), guarda++) bloqueadas.add(d);
  const t = sugerirTramoUnico({ dias, ventana: ventanaDe(c), desdeMinimo: primerInicioPosible(hoy, c.avisoMinimoDias), diasCorridos: inv.diasCorridos, ventanaPersona: inv.ventanaPersona?.enabled ? (inv.ventanaPersona as any) : null, bloqueadas });
  inv.asignacion = t
    ? { desde: t.desde, hasta: t.hasta, dias, sugeridaAt: new Date(), problema: null }
    : { desde: "", hasta: "", dias, sugeridaAt: new Date(), problema: `No entra un tramo continuo de ${dias} días antes del cierre de la ventana (${fechaCorta(c.ventanaHasta)}) respetando el aviso y los topes del área. Elegí las fechas a mano.` };
  inv.historial.push(paso("sugerida", null, t ? `Sugerido ${periodoTexto(t)} (${dias} días).` : inv.asignacion.problema || ""));
  await inv.save();
  return inv;
}

/** Sugiere a todos los vencidos que todavía no tienen la asignación confirmada. */
export async function sugerirAsignaciones(tid: Types.ObjectId, id: string) {
  const c = await cargarCampania(tid, id);
  const invs = await InvitacionVacaciones.find({ tenantId: tid, campaniaId: c._id, estado: "vencido_sin_definir" });
  let sugeridas = 0;
  for (const inv of invs) {
    if (inv.asignacion?.vacationId) continue;
    await sugerirAsignacion(tid, c, inv);
    sugeridas++;
  }
  return { sugeridas };
}

/** El admin mueve el tramo sugerido: tiene que seguir siendo UNO, con todos los días, y llegar con el aviso. */
export async function editarAsignacion(tid: Types.ObjectId, id: string, invId: string, t: Tramo, actorId: string) {
  const c = await cargarCampania(tid, id);
  const inv = await cargarInvitacion(tid, id, invId);
  if (inv.estado !== "vencido_sin_definir") throw new ErrorVacacion("Sólo se asigna a quien venció sin elegir.");
  const dias = inv.asignacion?.dias || (await diasAhora(tid, String(inv.userId), c.anio));
  const tiene = contarDiasTramo(t, inv.diasCorridos);
  if (tiene !== dias) throw new ErrorVacacion(`El tramo tiene ${tiene} días y tiene que tener ${dias}: la empresa asigna un tramo único con todos los días (no puede fraccionar sin acuerdo).`);
  const errores = validarOtorgamiento({ hoy: hoyArgentina(), desde: t.desde, hasta: t.hasta, avisoDias: c.avisoMinimoDias, ventana: ventanaDe(c) });
  if (inv.ventanaPersona?.enabled && !rangoPermitido(t.desde, t.hasta, inv.ventanaPersona as any)) errores.push("Se sale de la ventana de goce de su área o proyecto.");
  if (errores.length) throw new ErrorVacacion(errores.join(" "));
  inv.asignacion = { desde: t.desde, hasta: t.hasta, dias, sugeridaAt: inv.asignacion?.sugeridaAt, editadaPor: oid(actorId), problema: null };
  inv.historial.push(paso("asignacion_editada", actorId, `${periodoTexto(t)} (${dias} días).`));
  await inv.save();
  return inv;
}

/**
 * CONFIRMAR LO QUE ASIGNA LA EMPRESA: crea la vacación (tramo único), la pre-aprueba (sale el PDF, que es
 * el aviso por escrito) y la aprueba; queda la notificación en la invitación y se avisa a la persona.
 */
async function confirmarUna(tid: Types.ObjectId, c: ICampaniaVacaciones, inv: IInvitacionVacaciones, actorId: string) {
  if (inv.estado !== "vencido_sin_definir") throw new ErrorVacacion("Sólo se confirma la asignación de quien venció sin elegir.");
  const a = inv.asignacion;
  if (!a?.desde || !a?.hasta) throw new ErrorVacacion("Todavía no tiene fechas asignadas: sugerilas o cargalas a mano.");
  const errores = validarOtorgamiento({ hoy: hoyArgentina(), desde: a.desde, hasta: a.hasta, avisoDias: c.avisoMinimoDias, ventana: ventanaDe(c) });
  if (errores.length) throw new ErrorVacacion(errores.join(" "));
  const v = await crearVacacionParaPersona({
    tenantId: tid,
    userId: String(inv.userId),
    startDate: `${a.desde}T00:00:00.000Z`,
    endDate: `${a.hasta}T00:00:00.000Z`,
    reason: "Vacaciones asignadas por la empresa (campaña de goce)",
    origen: "campania",
    campaniaId: c._id as any,
    asignadaPorEmpresa: true,
    periodoSaldo: c.anio,
  });
  await preAprobarVacacion(v, actorId, tid);
  await aprobarComoAdmin(v, actorId);
  const texto = textoDeOtorgamiento(c, inv.nombre, [{ desde: a.desde, hasta: a.hasta, dias: v.daysRequested }], true);
  inv.asignacion = { ...(a as any).toObject?.() ?? a, confirmadaPor: oid(actorId), confirmadaAt: new Date(), vacationId: v._id as any };
  inv.estado = "asignado_por_empresa_notificado";
  inv.notificacion = { enviadaAt: new Date(), texto, pdfUrls: v.pdfPreAprobacionUrl ? [v.pdfPreAprobacionUrl] : [] };
  inv.historial.push(paso("asignacion_confirmada", actorId, `Otorgadas ${periodoTexto(a)} y notificadas por escrito.`));
  await inv.save();
  await notificar({ tenantId: tid, destinatarios: [String(inv.userId)], type: NOVEDAD_VACACION_OTORGADA, title: "Tus vacaciones fueron asignadas", message: `${texto} Entrá a «Elegí tus vacaciones» para acusar recibo.`, refId: c._id as any });
  return inv;
}

export async function confirmarAsignaciones(tid: Types.ObjectId, id: string, invIds: string[] | undefined, actorId: string) {
  const c = await cargarCampania(tid, id);
  const filtro: any = { tenantId: tid, campaniaId: c._id, estado: "vencido_sin_definir", "asignacion.desde": { $nin: [null, ""] } };
  if (invIds?.length) filtro._id = { $in: invIds.filter((x) => Types.ObjectId.isValid(x)).map(oid) };
  const invs = await InvitacionVacaciones.find(filtro);
  const fallas: { invitacionId: string; nombre: string; error: string }[] = [];
  let confirmadas = 0;
  for (const inv of invs) {
    try {
      await confirmarUna(tid, c, inv, actorId);
      confirmadas++;
    } catch (e: any) {
      fallas.push({ invitacionId: String(inv._id), nombre: inv.nombre, error: e?.message || "No se pudo confirmar" });
    }
  }
  return { confirmadas, fallas };
}

/** No se cierra «perdiendo» días: todos otorgados con aviso, o sin días que otorgar (art. 157). */
export async function cerrarCampania(tid: Types.ObjectId, id: string, actorId: string) {
  const c = await cargarCampania(tid, id);
  if (c.estado === "cerrada") return c;
  const pendientes = await InvitacionVacaciones.countDocuments({ tenantId: tid, campaniaId: c._id, estado: { $nin: RESUELTOS } });
  if (pendientes > 0) throw new ErrorVacacion(`Quedan ${pendientes} persona(s) sin el otorgamiento notificado. La obligación de otorgar las vacaciones es de la empresa: asignales las fechas antes de cerrar.`);
  c.estado = "cerrada";
  c.cerradaPor = oid(actorId);
  c.cerradaAt = new Date();
  await c.save();
  return c;
}

/** El reporte del período: quién tiene días sin gozar, cuántos, y cómo está la notificación. CSV con «;» (Excel en castellano). */
export async function reporteCsv(tid: Types.ObjectId, id: string): Promise<{ nombre: string; csv: string }> {
  const { campania, invitaciones } = await tablero(tid, id);
  const f = (d?: Date | string | null) => (d ? new Date(d).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : "");
  const celda = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const filas = [
    ["Colaborador", "Días a otorgar", "Estado", "Fecha límite", "Invitado", "Acusó recibo de la invitación", "Fechas", "Asignadas por la empresa", "Aviso escrito enviado", "Acusó recibo del aviso"],
    ...invitaciones.map((i: any) => [
      i.nombre,
      i.asignacion?.dias || i.diasDisponibles,
      i.etiquetaEstado,
      fechaCorta(i.fechaLimite),
      f(i.invitadoAt),
      f(i.acuseInvitacionAt),
      fechasDe(i).map(periodoTexto).join(" · "),
      i.estado === "asignado_por_empresa_notificado" ? "Sí" : "",
      f(i.notificacion?.enviadaAt),
      f(i.acuseOtorgamientoAt),
    ]),
  ];
  return { nombre: `campania-vacaciones-${campania.anio}.csv`, csv: "﻿" + filas.map((r) => r.map(celda).join(";")).join("\r\n") };
}

/* ─────────────────────────── La persona ─────────────────────────── */

/** Su invitación de la campaña lanzada (la más nueva), o null. */
async function invitacionActivaDe(tid: Types.ObjectId, userId: string) {
  const lanzadas = await CampaniaVacaciones.find({ tenantId: tid, estado: "lanzada" }).select("_id").lean();
  if (lanzadas.length === 0) return null;
  return InvitacionVacaciones.findOne({ tenantId: tid, userId: oid(userId), campaniaId: { $in: lanzadas.map((c) => c._id) } }).sort({ createdAt: -1 });
}

/** Lo que muestra «Elegí tus vacaciones» en la app. `pendienteDeAccion`: si la tarjeta tiene que estar a la vista. */
export async function miInvitacion(tid: Types.ObjectId, userId: string) {
  const inv = await invitacionActivaDe(tid, userId);
  if (!inv) return null;
  const c = await CampaniaVacaciones.findById(inv.campaniaId).lean();
  if (!c) return null;
  const hoy = hoyArgentina();
  const idsVac = [...(inv.tramos || []).map((t) => t.vacationId), inv.asignacion?.vacationId].filter(Boolean);
  const vacaciones = idsVac.length ? await Vacation.find({ _id: { $in: idsVac } }).select("status startDate endDate daysRequested pdfPreAprobacionUrl").lean() : [];
  const puedeProponer = PUEDE_PROPONER.includes(inv.estado) && hoy <= inv.fechaLimite;
  const diasDisponibles = puedeProponer ? await diasAhora(tid, userId, c.anio) : inv.diasDisponibles;
  const otorgada = OTORGADOS.includes(inv.estado);
  const { historial: _h, ...resto } = inv.toObject();
  return {
    invitacion: resto,
    campania: { _id: c._id, nombre: c.nombre, anio: c.anio, ventanaDesde: c.ventanaDesde, ventanaHasta: c.ventanaHasta, avisoMinimoDias: c.avisoMinimoDias, minDiasPorTramo: c.minDiasPorTramo, fechaLimite: inv.fechaLimite },
    estadoVisible: estadoVisible(inv.estado, fechasDe(inv), hoy),
    diasDisponibles,
    diasParaLaFechaLimite: diasHasta(hoy, inv.fechaLimite),
    puedeProponer,
    primerInicioPosible: primerInicioPosible(hoy, c.avisoMinimoDias),
    vacaciones,
    pendienteDeAccion: puedeProponer || inv.estado === "propuso_fechas" || inv.estado === "vencido_sin_definir" || (otorgada && !inv.acuseOtorgamientoAt),
    hoy,
  };
}

async function invitacionParaAccion(tid: Types.ObjectId, userId: string) {
  const inv = await invitacionActivaDe(tid, userId);
  if (!inv) throw new ErrorVacacion("No tenés una invitación activa para elegir vacaciones.", 404);
  return inv;
}

/** El acuse de recibo de la invitación: fecha y hora, una sola vez. */
export async function acusarInvitacion(tid: Types.ObjectId, userId: string) {
  const inv = await invitacionParaAccion(tid, userId);
  if (!inv.acuseInvitacionAt) {
    inv.acuseInvitacionAt = new Date();
    if (inv.estado === "invitado") inv.estado = "acuso_recibo";
    inv.historial.push(paso("acuse_invitacion", userId, "Acusó recibo de la invitación."));
    await inv.save();
  }
  return miInvitacion(tid, userId);
}

/**
 * LA PROPUESTA: valida con las reglas de la campaña (ventana, aviso, tramo mínimo al fraccionar, que
 * sume todos los días) y crea una vacación por tramo, que sube por la jerarquía. Si una no se puede
 * crear (solapamiento con su equipo), no queda ninguna: se propone todo junto o nada.
 */
export async function proponerFechas(tid: Types.ObjectId, userId: string, tramos: Tramo[]) {
  const inv = await invitacionParaAccion(tid, userId);
  const c = await CampaniaVacaciones.findById(inv.campaniaId);
  if (!c) throw new ErrorVacacion("La campaña ya no existe.", 404);
  const hoy = hoyArgentina();
  if (!PUEDE_PROPONER.includes(inv.estado)) throw new ErrorVacacion(inv.estado === "propuso_fechas" ? "Ya propusiste tus fechas: esperá la aprobación." : "Ya no se pueden proponer fechas en esta campaña.");
  if (hoy > inv.fechaLimite) throw new ErrorVacacion(`El plazo para elegir venció el ${fechaCorta(inv.fechaLimite)}: la empresa te asigna las fechas.`);
  const limpios = (Array.isArray(tramos) ? tramos : []).map((t) => ({ desde: String(t?.desde || "").slice(0, 10), hasta: String(t?.hasta || "").slice(0, 10) }));
  const dias = await diasAhora(tid, userId, c.anio);
  const errores = validarPropuesta({ tramos: limpios, diasDisponibles: dias, ventana: ventanaDe(c), ventanaPersona: inv.ventanaPersona?.enabled ? (inv.ventanaPersona as any) : null, hoy, avisoDias: c.avisoMinimoDias, minPorTramo: c.minDiasPorTramo, diasCorridos: inv.diasCorridos });
  if (errores.length) throw new ErrorVacacion(errores.join(" "));

  const creadas: IVacation[] = [];
  try {
    for (const t of limpios) {
      creadas.push(
        await crearVacacionParaPersona({ tenantId: tid, userId, startDate: `${t.desde}T00:00:00.000Z`, endDate: `${t.hasta}T00:00:00.000Z`, reason: "Vacaciones elegidas en la campaña de goce", origen: "campania", campaniaId: c._id as any, periodoSaldo: c.anio }),
      );
    }
  } catch (e) {
    // Todo o nada: se deshacen las que alcanzaron a crearse (y su movimiento de saldo).
    for (const v of creadas) {
      await Vacation.deleteOne({ _id: v._id }).catch(() => undefined);
      await adjustBalanceOnRequestChange(v.tenantId, v.userId, v.startDate.getFullYear(), v.daysRequested, "cancel").catch(() => undefined);
    }
    throw e;
  }
  for (const v of creadas) await iniciarAprobacion(v, tid).catch((e) => console.error("[CAMPANIA] iniciar aprobación:", e?.message || e));

  // Lo que siga en juego de una propuesta anterior (tramos aprobados) se conserva; se suman los nuevos.
  const anteriores = (inv.tramos || []).filter((t) => t.vacationId);
  inv.tramos = [...anteriores, ...creadas.map((v) => ({ desde: iso(v.startDate), hasta: iso(v.endDate), dias: v.daysRequested, vacationId: v._id as any }))] as any;
  inv.estado = "propuso_fechas";
  inv.propuestaAt = new Date();
  inv.rechazo = null;
  if (!inv.acuseInvitacionAt) {
    inv.acuseInvitacionAt = new Date();
    inv.historial.push(paso("acuse_invitacion", userId, "Acuse implícito: propuso fechas."));
  }
  inv.historial.push(paso("propuso", userId, limpios.map(periodoTexto).join("; ")));
  await inv.save();
  return miInvitacion(tid, userId);
}

/** El acuse de recibo del aviso por escrito del otorgamiento. */
export async function acusarOtorgamiento(tid: Types.ObjectId, userId: string) {
  const inv = await invitacionParaAccion(tid, userId);
  if (!OTORGADOS.includes(inv.estado)) throw new ErrorVacacion("Todavía no hay vacaciones otorgadas para acusar recibo.");
  if (!inv.acuseOtorgamientoAt) {
    inv.acuseOtorgamientoAt = new Date();
    inv.historial.push(paso("acuse_otorgamiento", userId, "Acusó recibo del aviso por escrito del otorgamiento."));
    await inv.save();
  }
  return miInvitacion(tid, userId);
}

/* ─────────────────────────── Enganches con aprobar / rechazar / cancelar ─────────────────────────── */

/** Antes de que el admin apruebe una vacación de la campaña: ¿llega el aviso y termina dentro de la ventana? */
export async function erroresDeOtorgamiento(v: IVacation): Promise<string[]> {
  if (!v.campaniaId) return [];
  const c = await CampaniaVacaciones.findById(v.campaniaId).lean();
  if (!c) return [];
  return validarOtorgamiento({ hoy: hoyArgentina(), desde: iso(v.startDate), hasta: iso(v.endDate), avisoDias: c.avisoMinimoDias, ventana: ventanaDe(c) });
}

/** Aprobada una vacación de la campaña: si ya están aprobados todos los tramos de la propuesta, queda otorgada y notificada. */
export async function alAprobarseEnLaCampania(v: IVacation) {
  if (!v.campaniaId || v.asignadaPorEmpresa) return;
  const inv = await InvitacionVacaciones.findOne({ campaniaId: v.campaniaId, userId: v.userId });
  const c = await CampaniaVacaciones.findById(v.campaniaId);
  if (!inv || !c || inv.estado !== "propuso_fechas") return;
  inv.historial.push(paso("tramo_aprobado", v.approvedBy ? String(v.approvedBy) : null, `${periodoTexto({ desde: iso(v.startDate), hasta: iso(v.endDate) })}.`));
  const ids = (inv.tramos || []).map((t) => t.vacationId).filter(Boolean);
  const vacs = await Vacation.find({ _id: { $in: ids } }).select("status startDate endDate daysRequested pdfPreAprobacionUrl").lean();
  const enJuego = vacs.filter((x: any) => !["rejected", "cancelled"].includes(x.status));
  if (enJuego.length > 0 && enJuego.every((x: any) => ["approved", "delivered"].includes(x.status))) {
    const tramos = enJuego.map((x: any) => ({ desde: iso(x.startDate), hasta: iso(x.endDate), dias: x.daysRequested }));
    const texto = textoDeOtorgamiento(c, inv.nombre, tramos, false);
    inv.estado = "aprobado_notificado";
    inv.notificacion = { enviadaAt: new Date(), texto, pdfUrls: enJuego.map((x: any) => x.pdfPreAprobacionUrl).filter(Boolean) };
    inv.historial.push(paso("otorgado", v.approvedBy ? String(v.approvedBy) : null, "Otorgadas y notificadas por escrito."));
    await inv.save();
    await notificar({ tenantId: inv.tenantId, destinatarios: [String(inv.userId)], type: NOVEDAD_VACACION_OTORGADA, title: "Tus vacaciones fueron otorgadas", message: `${texto} Entrá a «Elegí tus vacaciones» para acusar recibo.`, refId: c._id as any });
    return;
  }
  await inv.save();
}

/**
 * Rechazada o cancelada una vacación de la campaña: si la había propuesto la persona, vuelve a elegir esos
 * días (los demás tramos siguen); si la había asignado la empresa, vuelve a quedar para asignar.
 */
export async function alSalirDeLaCampania(v: IVacation, motivo: string) {
  if (!v.campaniaId) return;
  const inv = await InvitacionVacaciones.findOne({ campaniaId: v.campaniaId, userId: v.userId });
  if (!inv) return;
  const periodo = periodoTexto({ desde: iso(v.startDate), hasta: iso(v.endDate) });
  if (v.asignadaPorEmpresa) {
    inv.estado = "vencido_sin_definir";
    inv.asignacion = null;
    inv.notificacion = null;
    inv.historial.push(paso("asignacion_anulada", null, `${motivo}: ${periodo}. Hay que volver a asignarle las fechas.`));
  } else {
    inv.tramos = (inv.tramos || []).filter((t) => String(t.vacationId) !== String(v._id)) as any;
    inv.estado = "rechazada";
    inv.rechazo = { motivo, at: new Date() };
    inv.notificacion = null;
    inv.historial.push(paso("tramo_rechazado", null, `${motivo}: ${periodo}. Vuelve a elegir esos días.`));
  }
  await inv.save();
}

/* ─────────────────────────── El barrido ─────────────────────────── */

/**
 * Lo que hace el reloj en cada campaña lanzada: la fecha límite vencida pasa a «venció sin elegir» y se
 * le sugiere el tramo único; 2 días antes del vencimiento, un recordatorio automático (uno solo).
 */
export async function barrerCampania(c: ICampaniaVacaciones) {
  const tid = c.tenantId as Types.ObjectId;
  const hoy = hoyArgentina();
  const vencidas = await InvitacionVacaciones.find({ tenantId: tid, campaniaId: c._id, estado: { $in: PUEDE_PROPONER }, fechaLimite: { $lt: hoy } });
  for (const inv of vencidas) {
    inv.estado = "vencido_sin_definir";
    inv.historial.push(paso("vencido", null, `No eligió fechas hasta el ${fechaCorta(inv.fechaLimite)}: la empresa le asigna un tramo único.`));
    await inv.save();
    await sugerirAsignacion(tid, c, inv).catch((e) => console.error("[CAMPANIA] sugerir:", e?.message || e));
  }
  const enDosDias = sumarDias(hoy, 2);
  const r = await recordar(tid, c, null, { fechaLimite: { $gte: hoy, $lte: enDosDias }, "recordatorios.automatico": { $ne: true } });
  return { vencidas: vencidas.length, recordadas: r.recordadas };
}
