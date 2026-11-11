import { Types } from "mongoose";
import { Vacation, type IVacation } from "../../models/Vacation.js";
import { VacationConfig } from "../../models/VacationConfig.js";
import { User } from "../../models/User.js";
import { UserProfile } from "../../models/UserProfile.js";
import { Project } from "../../models/Project.js";
import { Area } from "../../models/Area.js";
import { normalizarVentana, rangoPermitido, textoDeVentana, ventanaEfectiva, type VentanaEfectiva } from "../../compartido/ventanaGoce.js";
import { diasHasta, fechaCorta, sumarDias } from "../../compartido/planVacaciones/fechas.js";
import { hoyArgentina } from "../../utils/contratoVigencia.js";
import { Pdf } from "../../models/Pdf.js";
import { Tenant } from "../../models/Tenant.js";
import { UserVacationBalance } from "../../models/UserVacationBalance.js";
import { generateVacationPDF } from "../../utils/pdfGenerator.js";
import { violaSolapamiento, type VacacionVirtual } from "./solapamiento.js";

/**
 * CREAR Y PRE-APROBAR UNA VACACIÓN, PARA CUALQUIER PERSONA.
 *
 * Era el cuerpo de `POST /vacations` (la persona pide desde la app) y de `PUT /vacations/:id/pre-approve`
 * (RR.HH. la pre-aprueba y sale el PDF). Vive acá porque el plan de vacaciones por proyecto crea la
 * vacación de un tercero cuando el coordinador aprueba su bloque, y tiene que salir IGUAL que una
 * pedida a mano: mismo cálculo de días, mismo saldo, mismo snapshot de reglas, mismo PDF y mismo número.
 */

export class ErrorVacacion extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Mantiene al día el override de la grilla (`UserVacationBalance`) cuando una solicitud cambia de estado. */
export async function adjustBalanceOnRequestChange(tenantId: any, userId: any, year: number, days: number, type: "create" | "approve" | "reject" | "cancel" | "deliver" | "sign") {
  try {
    const override = await UserVacationBalance.findOne({ tenantId, userId, year });
    if (!override) return;

    let totalAnnual = override.totalAnnual ?? 0;
    let taken = override.taken ?? 0;
    let pending = override.pending ?? 0;
    let available = override.available ?? 0;

    if (type === "create") {
      pending += days;
      available = Math.max(0, available - days);
    } else if (type === "approve" || type === "sign" || type === "deliver") {
      // Move from pending to taken
      pending = Math.max(0, pending - days);
      taken += days;
    } else if (type === "reject" || type === "cancel") {
      if (pending >= days) {
        pending -= days;
      } else {
        const rest = days - pending;
        pending = 0;
        taken = Math.max(0, taken - rest);
      }
      available += days;
    }

    override.taken = taken;
    override.pending = pending;
    override.available = available;
    void totalAnnual;
    await override.save();
  } catch (error) {
    console.error("Error adjusting overridden user vacation balance:", error);
  }
}

/**
 * La configuración que rige para la persona, resuelta entre todos sus proyectos (regla de siempre
 * para multiproyecto): fraccionar gana si ALGUNO lo permite (y con el menor mínimo), y días hábiles
 * gana sobre corridos si ALGUNO los usa.
 *
 * LA VENTANA ANUAL DE GOCE (10/11/2026) sigue el mismo criterio —lo más flexible—: si ALGÚN proyecto
 * no tiene ventana, no se aplica; si todos la tienen, vale la unión. Y el Área de la persona, si tiene
 * configuración propia, manda sobre los proyectos (`areaNombre` es el `department` del perfil). La
 * cuenta está en `compartido/ventanaGoce.ts`; la app muestra la misma, pedida por `/profile/stats`.
 */
export async function configEfectivaDe(tenantId: any, user: any, globalConfig: any, opciones: { areaNombre?: string | null } = {}): Promise<{ permiteFraccionadas: boolean; minDiasFraccion: number; diasCorridos: boolean; ventanaGoce: VentanaEfectiva }> {
  let permiteFraccionadas = globalConfig.permiteFraccionadas;
  let minDiasFraccion = globalConfig.minDiasFraccion || 7;
  let diasCorridos = globalConfig.diasCorridos;
  let projects: any[] = [];
  if (user.projectIds && user.projectIds.length > 0) {
    projects = await Project.find({ _id: { $in: user.projectIds }, tenantId });
    const projectConfigs = projects.map((p: any) =>
      p.vacationConfig && !p.vacationConfig.useGlobalConfig
        ? { permiteFraccionadas: p.vacationConfig.permiteFraccionadas, minDiasFraccion: p.vacationConfig.minDiasFraccion, diasCorridos: p.vacationConfig.diasCorridos }
        : { permiteFraccionadas: globalConfig.permiteFraccionadas, minDiasFraccion: globalConfig.minDiasFraccion, diasCorridos: globalConfig.diasCorridos },
    );
    if (projectConfigs.length > 0) {
      permiteFraccionadas = projectConfigs.some((c) => c.permiteFraccionadas);
      if (permiteFraccionadas) {
        const mins = projectConfigs.filter((c) => c.permiteFraccionadas).map((c) => c.minDiasFraccion ?? globalConfig.minDiasFraccion ?? 7);
        minDiasFraccion = Math.min(...mins);
      }
      const corridosValues = projectConfigs.map((c) => c.diasCorridos ?? globalConfig.diasCorridos ?? true);
      diasCorridos = corridosValues.every((v) => v === true);
    }
  }
  const area: any = opciones.areaNombre ? await Area.findOne({ tenantId, name: opciones.areaNombre }).select("vacationConfig").lean() : null;
  const ventanaGoce = ventanaEfectiva({ global: normalizarVentana(globalConfig.ventanaGoce), area: area?.vacationConfig, proyectos: projects.map((p: any) => p.vacationConfig) });
  return { permiteFraccionadas, minDiasFraccion, diasCorridos, ventanaGoce };
}

/** El día "YYYY-MM-DD" de una fecha pedida: el que vino escrito si vino como texto (sin pasar por la zona horaria). */
const diaISO = (pedido: string | Date, fecha: Date): string => (typeof pedido === "string" && /^\d{4}-\d{2}-\d{2}/.test(pedido) ? pedido.slice(0, 10) : fecha.toISOString().slice(0, 10));

/** Cuántos días pide un rango: corridos inclusive, o hábiles de lunes a viernes (los feriados no se descuentan, como siempre). */
export function contarDias(start: Date, end: Date, diasCorridos: boolean): number {
  if (diasCorridos) return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
  let count = 0;
  const cur = new Date(start);
  const loopEnd = new Date(end);
  while (cur <= loopEnd) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export interface PedidoDeVacacion {
  tenantId: any;
  userId: string;
  startDate: string | Date;
  endDate: string | Date;
  reason?: string;
  /** Lo demás que vino en el body de la app (se guarda como antes, debajo de los campos calculados). */
  extra?: Record<string, unknown>;
  origen: "solicitud" | "plan";
  planVacacionesId?: Types.ObjectId | string;
  projectId?: Types.ObjectId | string;
  /** De qué año descuenta. Sin él, el año en que empieza. */
  periodoSaldo?: number;
  /** Bloques del plan que todavía no son vacaciones pero cuentan para las reglas de solapamiento. */
  vacacionesVirtuales?: VacacionVirtual[];
}

/**
 * Crea la vacación en `pending` con todas las validaciones del POST de siempre: fechas, que no se
 * pise con otra propia, reglas de solapamiento, días según la configuración efectiva, saldo (con el
 * override de la grilla si existe) y el snapshot de reglas. Lanza `ErrorVacacion` con el status.
 */
export async function crearVacacionParaPersona(o: PedidoDeVacacion): Promise<IVacation> {
  const { tenantId, userId } = o;
  const user: any = await User.findById(userId).populate("metadata.projects");
  if (!user) throw new ErrorVacacion("Usuario no encontrado", 404);
  const profile = await UserProfile.findOne({ userId, tenantId });
  const positionName = profile?.position || "Sin Cargo";
  const levelName = "Sin Nivel";
  const userName = user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : profile ? `${profile.firstName} ${profile.lastName}` : "Usuario";

  if (!o.startDate || !o.endDate) throw new ErrorVacacion("Fechas requeridas");
  const start = new Date(o.startDate);
  const end = new Date(o.endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new ErrorVacacion("Fechas inválidas");
  if (start > end) throw new ErrorVacacion("La fecha de inicio no puede ser posterior a la fecha de fin");

  const existingVacation = await Vacation.findOne({ tenantId, userId, status: { $nin: ["rejected", "cancelled"] }, $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }] });
  if (existingVacation) throw new ErrorVacacion(o.origen === "plan" ? "La persona ya tiene una solicitud de vacaciones activa en ese rango de fechas." : "Ya tienes una solicitud de vacaciones activa en este rango de fechas.");

  const choque = await violaSolapamiento(tenantId, String(userId), start, end, { vacacionesVirtuales: o.vacacionesVirtuales });
  if (choque.viola) throw new ErrorVacacion(choque.mensaje || "Conflicto de solapamiento.");

  const globalConfig = await VacationConfig.findOne({ tenantId });
  if (!globalConfig) throw new ErrorVacacion("No se encontró configuración global de vacaciones para este tenant");
  const efectiva = await configEfectivaDe(tenantId, user, globalConfig, { areaNombre: profile?.department });
  const desdeISO = diaISO(o.startDate, start);
  /*
    ANTICIPACIÓN MÍNIMA (10/11/2026). `anticipacionMinimaDias` se guardaba en el snapshot de reglas pero
    nadie la validaba. Sólo para lo que la persona pide desde la app: entre hoy (día argentino) y el
    primer día de vacaciones tienen que mediar al menos esos días. Un bloque del plan no pasa por acá:
    lo arma RR.HH. y lo aprueba el coordinador, que son quienes fijan esa regla.
  */
  const anticipacion = Math.floor(Number(globalConfig.anticipacionMinimaDias) || 0);
  if (o.origen === "solicitud" && anticipacion > 0) {
    const hoy = hoyArgentina();
    if (diasHasta(hoy, desdeISO) < anticipacion) {
      throw new ErrorVacacion(`Las vacaciones se piden con al menos ${anticipacion} ${anticipacion === 1 ? "día" : "días"} de anticipación: hoy, la primera fecha que se puede pedir es el ${fechaCorta(sumarDias(hoy, anticipacion))}.`);
    }
  }
  // Ventana anual de goce: el rango ENTERO tiene que caer adentro, venga de la app o de un bloque del plan.
  if (!rangoPermitido(desdeISO, diaISO(o.endDate, end), efectiva.ventanaGoce)) {
    throw new ErrorVacacion(`Las vacaciones solo pueden ${o.origen === "plan" ? "tomarse" : "solicitarse"} ${textoDeVentana(efectiva.ventanaGoce)}.`);
  }
  const daysRequested = contarDias(start, end, efectiva.diasCorridos);

  // Saldo: usados (entregadas o firmadas) y pendientes (todo lo demás activo); el override de la grilla manda si existe.
  const activeVacations = await Vacation.find({ tenantId, userId, status: { $nin: ["rejected", "cancelled"] } }).lean();
  let daysUsed = 0;
  let daysPending = 0;
  for (const v of activeVacations) {
    const isSigned = v.signatureStatus === "signed";
    const isDelivered = v.status === "delivered";
    const isNotRequired = v.signatureStatus === "not_required";
    const isApproved = v.status === "approved";
    if (isDelivered || isSigned || (isApproved && isNotRequired)) daysUsed += v.daysRequested;
    else daysPending += v.daysRequested;
  }
  const requestYear = o.periodoSaldo ?? start.getFullYear();
  const override = await UserVacationBalance.findOne({ tenantId, userId, year: requestYear }).lean();
  let totalAnnualDays = user.vacationDays?.totalDays || 0;
  let currentAvailable = totalAnnualDays - daysUsed - daysPending;
  if (override && override.available !== undefined) {
    currentAvailable = override.available;
    totalAnnualDays = override.totalAnnual ?? totalAnnualDays;
  }
  const newBalance = currentAvailable - daysRequested;

  const vacationData: any = {
    ...(o.extra || {}),
    tenantId,
    userId,
    userName,
    position: positionName,
    level: levelName,
    startDate: start,
    endDate: end,
    daysRequested,
    diasDeVacacionesAnuales: totalAnnualDays,
    balance: newBalance,
    reason: o.reason || "Solicitud de vacaciones",
    comments: o.reason,
    requiresSignature: globalConfig.requiereFirma,
    origen: o.origen,
    planVacacionesId: o.planVacacionesId ? new Types.ObjectId(String(o.planVacacionesId)) : undefined,
    projectId: o.projectId ? new Types.ObjectId(String(o.projectId)) : undefined,
    periodoSaldo: o.periodoSaldo,
    rules: {
      diasAnuales: totalAnnualDays,
      diasBeneficio: globalConfig.diasBeneficio,
      maxDiasGozados: globalConfig.maxDiasGozados,
      permiteArrastre: globalConfig.permiteArrastre,
      maxDiasArrastre: globalConfig.maxDiasArrastre,
      vencimientoArrastreDias: globalConfig.vencimientoArrastreDias,
      maxDiasHabiles: globalConfig.maxDiasHabiles,
      anticipacionMinimaDias: globalConfig.anticipacionMinimaDias,
      permiteFraccionadas: efectiva.permiteFraccionadas,
      minDiasFraccion: efectiva.minDiasFraccion,
      diasCorridos: efectiva.diasCorridos,
      ventanaGoce: efectiva.ventanaGoce,
      requiereFirma: globalConfig.requiereFirma,
      pdfId: globalConfig.pdfId,
    },
  };
  const newVacation = new Vacation(vacationData);
  await newVacation.save();
  await adjustBalanceOnRequestChange(tenantId, userId, requestYear, daysRequested, "create");
  return newVacation;
}

/**
 * `pending` → `pre_approved`, y el PDF de pre-aprobación con la plantilla del snapshot (`rules.pdfId`)
 * o, si no hay, la plantilla activa de código «vacaciones». Un problema con el PDF no deshace la
 * pre-aprobación: se loguea y la vacación queda sin `pdfPreAprobacionUrl` (se puede regenerar).
 */
export async function preAprobarVacacion(vacation: IVacation, actorId: string, tenantObjectId: any): Promise<IVacation> {
  if (vacation.status !== "pending") throw new ErrorVacacion("Solo las solicitudes pendientes pueden ser preaprobadas");
  vacation.status = "pre_approved";
  vacation.preApprovedBy = new Types.ObjectId(actorId);
  vacation.preApprovedAt = new Date();
  await vacation.save();

  let templateId: any = vacation.rules?.pdfId;
  if (!templateId || String(templateId).trim() === "") {
    const defaultTemplate = await Pdf.findOne({ tenantId: tenantObjectId, code: { $regex: /^vacaciones$/i }, isActive: true });
    if (defaultTemplate) templateId = String(defaultTemplate._id);
    else console.warn("[VACATIONS] Default 'vacaciones' template NOT found for tenant:", String(tenantObjectId));
  }
  if (templateId && String(templateId).trim() !== "") {
    try {
      const template = await Pdf.findOne({ _id: templateId, tenantId: tenantObjectId, isActive: true });
      if (!template) console.error("[VACATIONS] Template NOT found or inactive for ID:", templateId);
      else {
        const user = typeof vacation.userId === "object" && "firstName" in (vacation.userId as any) ? (vacation.userId as any) : await User.findById(vacation.userId);
        if (!user) console.error("[VACATIONS] User NOT found for vacation:", vacation._id);
        else {
          const tenant = await Tenant.findById(tenantObjectId);
          const tenantName = tenant?.name || tenant?.slug || "Organización";
          const result = await generateVacationPDF(vacation as any, template, user, String(tenantObjectId), tenantName, vacation.vacationNumber);
          if (result.success && result.pdfUrl) {
            vacation.pdfPreAprobacionUrl = result.pdfUrl;
            await vacation.save();
          } else console.error("[VACATIONS] Error generating PDF for vacation:", result.error);
        }
      }
    } catch (pdfError) {
      console.error("[VACATIONS] Exception during PDF generation:", pdfError);
    }
  }
  return vacation;
}
