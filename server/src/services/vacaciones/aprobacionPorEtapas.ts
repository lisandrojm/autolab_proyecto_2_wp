import { Types } from "mongoose";
import { Vacation, type IVacation } from "../../models/Vacation.js";
import { User } from "../../models/User.js";
import { Project } from "../../models/Project.js";
import { aprobadoresDe, esCoordinadorDeLaCadena, etapaDe, nivelQueFalta, puedeAprobarEtapa, type Nivel } from "../../compartido/vacaciones/etapaDeAprobacion.js";
import { fechaCorta } from "../../compartido/planVacaciones/fechas.js";
import { hoyArgentina } from "../../utils/contratoVigencia.js";
import { nombreDePersona, notificar, NOVEDAD_VACACION_PARA_APROBAR, NOVEDAD_VACACION_RECORDATORIO } from "../novedadesNotificaciones.js";
import { cadenaDeAprobacion } from "./cadenaDeAprobacion.js";
import { ErrorVacacion, adjustBalanceOnRequestChange, preAprobarVacacion } from "./crearVacacion.js";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * LA SOLICITUD SUBE POR LA JERARQUÍA (15/11/2026)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Supervisor → Coordinador → Admin. Las reglas puras (qué nivel falta, quién puede aprobarlo) están en
 * `compartido/vacaciones/etapaDeAprobacion.ts`; acá se guardan las aprobaciones, se avisa al siguiente y,
 * cuando no falta nadie, se pre-aprueba (`pre_approved` = «la jerarquía terminó, espera al admin»).
 *
 * El admin YA NO PRE-APRUEBA: sólo aprueba lo que llegó a `pre_approved` (y rechaza cuando quiera).
 */

const periodo = (v: IVacation) => `${fechaCorta(isoDia(v.startDate))} al ${fechaCorta(isoDia(v.endDate))}`;
const isoDia = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const tituloNivel: Record<Nivel, string> = { supervisor: "supervisor", coordinador: "coordinador" };

/** Avisa a quienes tienen que aprobar el nivel en que quedó. No lanza (ver `notificar`). */
async function avisarAlNivel(v: IVacation, nivel: Nivel, excepto?: string | null) {
  const persona: any = await User.findById(v.userId).select("firstName lastName metadata.fullName").lean();
  await notificar({
    tenantId: v.tenantId,
    destinatarios: aprobadoresDe(v.cadena as any, nivel),
    type: NOVEDAD_VACACION_PARA_APROBAR,
    title: "Vacaciones para aprobar",
    message: `${nombreDePersona(persona)} pidió vacaciones del ${periodo(v)} (${v.daysRequested} días). Te toca aprobarlas como ${tituloNivel[nivel]}.`,
    refId: v._id as any,
    excepto,
  });
}

/**
 * Después de cada paso: si falta un nivel, se le avisa; si no falta ninguno, se pre-aprueba y pasa a la
 * bandeja del admin. `actorId` es quien aprobó el último paso (null si nació sin jerarquía).
 */
export async function avanzar(v: IVacation, tenantObjectId: any, actorId: string | null): Promise<IVacation> {
  const falta = nivelQueFalta(v as any);
  if (falta === "admin") return preAprobarVacacion(v, actorId, tenantObjectId);
  await avisarAlNivel(v, falta, actorId);
  return v;
}

/** Al crearla: la foto de quién aprueba cada nivel, y el primer paso. */
export async function iniciarAprobacion(v: IVacation, tenantObjectId: any): Promise<IVacation> {
  const cadena = await cadenaDeAprobacion(tenantObjectId, String(v.userId));
  v.cadena = cadena as any;
  await v.save();
  return avanzar(v, tenantObjectId, null);
}

/** Aprueba el paso en que está, si le toca a esta persona. */
export async function aprobarEtapa(v: IVacation, userId: string, tenantObjectId: any): Promise<IVacation> {
  const nivel = puedeAprobarEtapa(v as any, userId);
  if (!nivel) throw new ErrorVacacion(etapaDe(v as any) ? "Esta solicitud no espera tu aprobación" : "Esta solicitud ya no está pendiente", 403);
  const proyecto = (v.cadena?.proyectos || []).find((p) => ((nivel === "supervisor" ? p.supervisores : p.coordinadores) || []).some((u) => String(u) === userId));
  v.aprobaciones = { ...((v.aprobaciones as any)?.toObject?.() ?? v.aprobaciones ?? {}), [nivel]: { userId: new Types.ObjectId(userId), projectId: proyecto?.projectId, at: new Date() } } as any;
  await v.save();
  return avanzar(v, tenantObjectId, userId);
}

/**
 * Rechaza: lo usa el supervisor o coordinador en su paso y el admin en cualquier momento. Devuelve el
 * saldo y avisa a quien la pidió.
 */
export async function rechazarVacacion(v: IVacation, rechazo: { userId: string; nivel: Nivel | "admin"; motivo?: string }): Promise<IVacation> {
  if (!["pending", "pre_approved", "approved"].includes(v.status)) throw new ErrorVacacion("Solo las solicitudes pendientes, preaprobadas o aprobadas pueden ser rechazadas");
  const motivo = (rechazo.motivo || "").trim();
  v.status = "rejected";
  v.rejectedAt = new Date();
  v.rechazo = { userId: new Types.ObjectId(rechazo.userId), nivel: rechazo.nivel, motivo: motivo || undefined, at: new Date() } as any;
  if (motivo) v.managerComment = motivo;
  await v.save();
  await adjustBalanceOnRequestChange(v.tenantId, v.userId, v.startDate.getFullYear(), v.daysRequested, "reject");
  await notificar({
    tenantId: v.tenantId,
    destinatarios: [String(v.userId)],
    type: "vacation",
    title: "Solicitud de Vacaciones Rechazada",
    message: `Tu solicitud de vacaciones N°: ${v.vacationNumber} ha sido rechazada.${motivo ? ` Motivo: ${motivo}` : ""}`,
    refId: v._id as any,
  });
  return v;
}

export async function rechazarEtapa(v: IVacation, userId: string, motivo?: string): Promise<IVacation> {
  const nivel = puedeAprobarEtapa(v as any, userId);
  if (!nivel) throw new ErrorVacacion("Esta solicitud no espera tu aprobación", 403);
  return rechazarVacacion(v, { userId, nivel, motivo });
}

/** ¿Ya se le recordó hoy al supervisor? (uno por día, para no llenarle la campanita). */
export const recordadaHoy = (v: Pick<IVacation, "recordatorios">, hoy = hoyArgentina()): boolean => (v.recordatorios || []).some((r) => r?.at && new Date(r.at).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }) === hoy);

/** El coordinador le pide al supervisor que apruebe. No aprueba por él (decisión del usuario). */
export async function recordarAlSupervisor(v: IVacation, userId: string): Promise<IVacation> {
  if (etapaDe(v as any) !== "supervisor") throw new ErrorVacacion("Esta solicitud ya no espera al supervisor");
  if (!esCoordinadorDeLaCadena(v as any, userId)) throw new ErrorVacacion("Sólo el coordinador del proyecto puede pedir la aprobación", 403);
  if (recordadaHoy(v)) throw new ErrorVacacion("Ya se le avisó hoy al supervisor", 429);
  const [persona, coordinador]: any[] = await Promise.all([User.findById(v.userId).select("firstName lastName metadata.fullName").lean(), User.findById(userId).select("firstName lastName metadata.fullName").lean()]);
  await notificar({
    tenantId: v.tenantId,
    destinatarios: aprobadoresDe(v.cadena as any, "supervisor"),
    type: NOVEDAD_VACACION_RECORDATORIO,
    title: "Te piden aprobar vacaciones",
    message: `${nombreDePersona(coordinador)} te pide que revises las vacaciones de ${nombreDePersona(persona)} del ${periodo(v)}.`,
    refId: v._id as any,
    excepto: userId,
  });
  v.recordatorios = [...(v.recordatorios || []), { porUserId: new Types.ObjectId(userId), at: new Date() }] as any;
  await v.save();
  return v;
}

export interface ItemDeAprobacion {
  _id: string;
  vacationNumber: string;
  persona: { _id: string; nombre: string };
  proyectos: string[];
  startDate: Date;
  endDate: Date;
  daysRequested: number;
  reason?: string;
  createdAt: Date;
  etapa: Nivel;
  aprobadoPorSupervisor?: string | null;
  recordadaHoy: boolean;
}

/**
 * LA BANDEJA «APROBACIONES» DE LA APP.
 *   · `paraAprobar`: lo que espera MI aprobación (supervisor o coordinador, en su paso).
 *   · `esperandoSupervisor`: sólo para el coordinador, lo de sus proyectos que todavía no aprobó el supervisor.
 */
export async function bandejaDeAprobaciones(tenantObjectId: any, userId: string): Promise<{ paraAprobar: ItemDeAprobacion[]; esperandoSupervisor: ItemDeAprobacion[] }> {
  const yo = new Types.ObjectId(userId);
  const candidatas: any[] = await Vacation.find({ tenantId: tenantObjectId, status: "pending", $or: [{ "cadena.proyectos.supervisores": yo }, { "cadena.proyectos.coordinadores": yo }] })
    .select("vacationNumber userId userName startDate endDate daysRequested reason createdAt status cadena aprobaciones recordatorios")
    .sort({ startDate: 1 })
    .lean();
  const paraAprobar: any[] = [];
  const esperando: any[] = [];
  for (const v of candidatas) {
    if (puedeAprobarEtapa(v, userId)) paraAprobar.push(v);
    else if (etapaDe(v) === "supervisor" && esCoordinadorDeLaCadena(v, userId)) esperando.push(v);
  }
  const todas = [...paraAprobar, ...esperando];
  const idsProyecto = [...new Set(todas.flatMap((v) => (v.cadena?.proyectos || []).map((p: any) => String(p.projectId))))].map((id) => new Types.ObjectId(id));
  const idsPersona = [...new Set(todas.flatMap((v) => [String(v.userId), v.aprobaciones?.supervisor?.userId ? String(v.aprobaciones.supervisor.userId) : ""]).filter(Boolean))].map((id) => new Types.ObjectId(id));
  const [proyectos, personas]: any[][] = await Promise.all([
    idsProyecto.length ? Project.find({ _id: { $in: idsProyecto } }).select("name").lean() : [],
    idsPersona.length ? User.find({ _id: { $in: idsPersona } }).select("firstName lastName metadata.fullName").lean() : [],
  ]);
  const nombreProyecto = new Map(proyectos.map((p) => [String(p._id), String(p.name || "")]));
  const nombre = new Map(personas.map((p) => [String(p._id), nombreDePersona(p)]));
  // De cada solicitud, sólo los proyectos donde esta persona aprueba (los demás no son asunto suyo).
  const aItem = (v: any): ItemDeAprobacion => ({
    _id: String(v._id),
    vacationNumber: v.vacationNumber,
    persona: { _id: String(v.userId), nombre: nombre.get(String(v.userId)) || v.userName },
    proyectos: (v.cadena?.proyectos || []).filter((p: any) => [...(p.supervisores || []), ...(p.coordinadores || [])].some((u: any) => String(u) === userId)).map((p: any) => nombreProyecto.get(String(p.projectId)) || ""),
    startDate: v.startDate,
    endDate: v.endDate,
    daysRequested: v.daysRequested,
    reason: v.reason,
    createdAt: v.createdAt,
    etapa: etapaDe(v) as Nivel,
    aprobadoPorSupervisor: v.aprobaciones?.supervisor?.userId ? nombre.get(String(v.aprobaciones.supervisor.userId)) || null : null,
    recordadaHoy: recordadaHoy(v),
  });
  return { paraAprobar: paraAprobar.map(aItem), esperandoSupervisor: esperando.map(aItem) };
}

/** Cuántas esperan MI aprobación (el número de la tarjeta). No cuenta lo que espera al supervisor. */
export async function contarParaAprobar(tenantObjectId: any, userId: string): Promise<number> {
  const yo = new Types.ObjectId(userId);
  const candidatas: any[] = await Vacation.find({ tenantId: tenantObjectId, status: "pending", $or: [{ "cadena.proyectos.supervisores": yo }, { "cadena.proyectos.coordinadores": yo }] })
    .select("status cadena aprobaciones")
    .lean();
  return candidatas.filter((v) => puedeAprobarEtapa(v, userId)).length;
}
