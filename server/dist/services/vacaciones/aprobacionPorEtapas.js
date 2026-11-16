import { Types } from "mongoose";
import { Vacation } from "../../models/Vacation.js";
import { User } from "../../models/User.js";
import { Project } from "../../models/Project.js";
import { aprobadoresDe, esCoordinadorDeLaCadena, etapaDe, nivelQueFalta, puedeAprobarEtapa } from "../../compartido/vacaciones/etapaDeAprobacion.js";
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
const periodo = (v) => `${fechaCorta(isoDia(v.startDate))} al ${fechaCorta(isoDia(v.endDate))}`;
const isoDia = (d) => new Date(d).toISOString().slice(0, 10);
const tituloNivel = { supervisor: "supervisor", coordinador: "coordinador" };
/** Avisa a quienes tienen que aprobar el nivel en que quedó. No lanza (ver `notificar`). */
async function avisarAlNivel(v, nivel, excepto) {
    const persona = await User.findById(v.userId).select("firstName lastName metadata.fullName").lean();
    await notificar({
        tenantId: v.tenantId,
        destinatarios: aprobadoresDe(v.cadena, nivel),
        type: NOVEDAD_VACACION_PARA_APROBAR,
        title: "Vacaciones para aprobar",
        message: `${nombreDePersona(persona)} pidió vacaciones del ${periodo(v)} (${v.daysRequested} días). Te toca aprobarlas como ${tituloNivel[nivel]}.`,
        refId: v._id,
        excepto,
    });
}
/**
 * Después de cada paso: si falta un nivel, se le avisa; si no falta ninguno, se pre-aprueba y pasa a la
 * bandeja del admin. `actorId` es quien aprobó el último paso (null si nació sin jerarquía).
 */
export async function avanzar(v, tenantObjectId, actorId) {
    const falta = nivelQueFalta(v);
    if (falta === "admin")
        return preAprobarVacacion(v, actorId, tenantObjectId);
    await avisarAlNivel(v, falta, actorId);
    return v;
}
/** Al crearla: la foto de quién aprueba cada nivel, y el primer paso. */
export async function iniciarAprobacion(v, tenantObjectId) {
    const cadena = await cadenaDeAprobacion(tenantObjectId, String(v.userId));
    v.cadena = cadena;
    await v.save();
    return avanzar(v, tenantObjectId, null);
}
/** Aprueba el paso en que está, si le toca a esta persona. */
export async function aprobarEtapa(v, userId, tenantObjectId) {
    const nivel = puedeAprobarEtapa(v, userId);
    if (!nivel)
        throw new ErrorVacacion(etapaDe(v) ? "Esta solicitud no espera tu aprobación" : "Esta solicitud ya no está pendiente", 403);
    const proyecto = (v.cadena?.proyectos || []).find((p) => ((nivel === "supervisor" ? p.supervisores : p.coordinadores) || []).some((u) => String(u) === userId));
    v.aprobaciones = { ...(v.aprobaciones?.toObject?.() ?? v.aprobaciones ?? {}), [nivel]: { userId: new Types.ObjectId(userId), projectId: proyecto?.projectId, at: new Date() } };
    await v.save();
    return avanzar(v, tenantObjectId, userId);
}
/**
 * Rechaza: lo usa el supervisor o coordinador en su paso y el admin en cualquier momento. Devuelve el
 * saldo y avisa a quien la pidió.
 */
export async function rechazarVacacion(v, rechazo) {
    if (!["pending", "pre_approved", "approved"].includes(v.status))
        throw new ErrorVacacion("Solo las solicitudes pendientes, preaprobadas o aprobadas pueden ser rechazadas");
    const motivo = (rechazo.motivo || "").trim();
    v.status = "rejected";
    v.rejectedAt = new Date();
    v.rechazo = { userId: new Types.ObjectId(rechazo.userId), nivel: rechazo.nivel, motivo: motivo || undefined, at: new Date() };
    if (motivo)
        v.managerComment = motivo;
    await v.save();
    await adjustBalanceOnRequestChange(v.tenantId, v.userId, v.startDate.getFullYear(), v.daysRequested, "reject");
    // Si era parte de una propuesta de la campaña de goce, la persona vuelve a elegir esos días.
    if (v.campaniaId)
        await import("./campaniaVacaciones.js").then((m) => m.alSalirDeLaCampania(v, motivo || "Rechazada")).catch((e) => console.error("[CAMPANIA] rechazo:", e?.message || e));
    await notificar({
        tenantId: v.tenantId,
        destinatarios: [String(v.userId)],
        type: "vacation",
        title: "Solicitud de Vacaciones Rechazada",
        message: `Tu solicitud de vacaciones N°: ${v.vacationNumber} ha sido rechazada.${motivo ? ` Motivo: ${motivo}` : ""}`,
        refId: v._id,
    });
    return v;
}
/**
 * LA APROBACIÓN FINAL DEL ADMIN (lo que hacía `PUT /:id/approve`, 15/11/2026: lo usa también la campaña de
 * goce al confirmar lo que asigna la empresa). Espera una `pre_approved`. Firma, saldo y aviso como siempre.
 */
export async function aprobarComoAdmin(vacation, approverId) {
    if (vacation.status !== "pre_approved")
        throw new ErrorVacacion(vacation.status === "pending" ? "Todavía espera la aprobación del supervisor o del coordinador" : "Solo las solicitudes preaprobadas pueden ser aprobadas");
    vacation.status = "approved";
    vacation.approvedBy = new Types.ObjectId(approverId);
    vacation.approvedAt = new Date();
    const requiresSignature = vacation.rules?.requiereFirma || false;
    vacation.requiresSignature = requiresSignature;
    if (requiresSignature) {
        vacation.signatureStatus = "sent";
        vacation.signatureSentAt = new Date();
    }
    await vacation.save();
    await adjustBalanceOnRequestChange(vacation.tenantId, vacation.userId, vacation.startDate.getFullYear(), vacation.daysRequested, "approve");
    await notificar({
        tenantId: vacation.tenantId,
        destinatarios: [String(vacation.userId)],
        type: "vacation",
        title: requiresSignature ? "Documento enviado para firma" : "Solicitud de vacaciones aprobada",
        message: requiresSignature ? `Tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido aprobada. Revisá tu casilla de email para firmar el documento.` : `Tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido aprobada.`,
        linkUrl: "/vacations",
        refId: vacation._id,
    });
    return vacation;
}
export async function rechazarEtapa(v, userId, motivo) {
    const nivel = puedeAprobarEtapa(v, userId);
    if (!nivel)
        throw new ErrorVacacion("Esta solicitud no espera tu aprobación", 403);
    return rechazarVacacion(v, { userId, nivel, motivo });
}
/** ¿Ya se le recordó hoy al supervisor? (uno por día, para no llenarle la campanita). */
export const recordadaHoy = (v, hoy = hoyArgentina()) => (v.recordatorios || []).some((r) => r?.at && new Date(r.at).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }) === hoy);
/** El coordinador le pide al supervisor que apruebe. No aprueba por él (decisión del usuario). */
export async function recordarAlSupervisor(v, userId) {
    if (etapaDe(v) !== "supervisor")
        throw new ErrorVacacion("Esta solicitud ya no espera al supervisor");
    if (!esCoordinadorDeLaCadena(v, userId))
        throw new ErrorVacacion("Sólo el coordinador del proyecto puede pedir la aprobación", 403);
    if (recordadaHoy(v))
        throw new ErrorVacacion("Ya se le avisó hoy al supervisor", 429);
    const [persona, coordinador] = await Promise.all([User.findById(v.userId).select("firstName lastName metadata.fullName").lean(), User.findById(userId).select("firstName lastName metadata.fullName").lean()]);
    await notificar({
        tenantId: v.tenantId,
        destinatarios: aprobadoresDe(v.cadena, "supervisor"),
        type: NOVEDAD_VACACION_RECORDATORIO,
        title: "Te piden aprobar vacaciones",
        message: `${nombreDePersona(coordinador)} te pide que revises las vacaciones de ${nombreDePersona(persona)} del ${periodo(v)}.`,
        refId: v._id,
        excepto: userId,
    });
    v.recordatorios = [...(v.recordatorios || []), { porUserId: new Types.ObjectId(userId), at: new Date() }];
    await v.save();
    return v;
}
/**
 * LA BANDEJA «APROBACIONES» DE LA APP.
 *   · `paraAprobar`: lo que espera MI aprobación (supervisor o coordinador, en su paso).
 *   · `esperandoSupervisor`: sólo para el coordinador, lo de sus proyectos que todavía no aprobó el supervisor.
 */
export async function bandejaDeAprobaciones(tenantObjectId, userId) {
    const yo = new Types.ObjectId(userId);
    const candidatas = await Vacation.find({ tenantId: tenantObjectId, status: "pending", $or: [{ "cadena.proyectos.supervisores": yo }, { "cadena.proyectos.coordinadores": yo }] })
        .select("vacationNumber userId userName startDate endDate daysRequested reason createdAt status cadena aprobaciones recordatorios")
        .sort({ startDate: 1 })
        .lean();
    const paraAprobar = [];
    const esperando = [];
    for (const v of candidatas) {
        if (puedeAprobarEtapa(v, userId))
            paraAprobar.push(v);
        else if (etapaDe(v) === "supervisor" && esCoordinadorDeLaCadena(v, userId))
            esperando.push(v);
    }
    const todas = [...paraAprobar, ...esperando];
    const idsProyecto = [...new Set(todas.flatMap((v) => (v.cadena?.proyectos || []).map((p) => String(p.projectId))))].map((id) => new Types.ObjectId(id));
    const idsPersona = [...new Set(todas.flatMap((v) => [String(v.userId), v.aprobaciones?.supervisor?.userId ? String(v.aprobaciones.supervisor.userId) : ""]).filter(Boolean))].map((id) => new Types.ObjectId(id));
    const [proyectos, personas] = await Promise.all([
        idsProyecto.length ? Project.find({ _id: { $in: idsProyecto } }).select("name").lean() : [],
        idsPersona.length ? User.find({ _id: { $in: idsPersona } }).select("firstName lastName metadata.fullName").lean() : [],
    ]);
    const nombreProyecto = new Map(proyectos.map((p) => [String(p._id), String(p.name || "")]));
    const nombre = new Map(personas.map((p) => [String(p._id), nombreDePersona(p)]));
    // De cada solicitud, sólo los proyectos donde esta persona aprueba (los demás no son asunto suyo).
    const aItem = (v) => ({
        _id: String(v._id),
        vacationNumber: v.vacationNumber,
        persona: { _id: String(v.userId), nombre: nombre.get(String(v.userId)) || v.userName },
        proyectos: (v.cadena?.proyectos || []).filter((p) => [...(p.supervisores || []), ...(p.coordinadores || [])].some((u) => String(u) === userId)).map((p) => nombreProyecto.get(String(p.projectId)) || ""),
        startDate: v.startDate,
        endDate: v.endDate,
        daysRequested: v.daysRequested,
        reason: v.reason,
        createdAt: v.createdAt,
        etapa: etapaDe(v),
        aprobadoPorSupervisor: v.aprobaciones?.supervisor?.userId ? nombre.get(String(v.aprobaciones.supervisor.userId)) || null : null,
        recordadaHoy: recordadaHoy(v),
    });
    return { paraAprobar: paraAprobar.map(aItem), esperandoSupervisor: esperando.map(aItem) };
}
/** Cuántas esperan MI aprobación (el número de la tarjeta). No cuenta lo que espera al supervisor. */
export async function contarParaAprobar(tenantObjectId, userId) {
    const yo = new Types.ObjectId(userId);
    const candidatas = await Vacation.find({ tenantId: tenantObjectId, status: "pending", $or: [{ "cadena.proyectos.supervisores": yo }, { "cadena.proyectos.coordinadores": yo }] })
        .select("status cadena aprobaciones")
        .lean();
    return candidatas.filter((v) => puedeAprobarEtapa(v, userId)).length;
}
