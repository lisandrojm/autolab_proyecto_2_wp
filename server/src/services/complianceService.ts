import { Types } from "mongoose";
import { Project } from "../models/Project.js";
import { Shift } from "../models/Shift.js";
import { Area } from "../models/Area.js";
import { User } from "../models/User.js";
import { Holiday } from "../models/Holiday.js";
import { Request } from "../models/Request.js";
import { ActivityLogGeneralConfig } from "../models/ActivityLogGeneralConfig.js";
import { expandExpectedDates, eachDateStr, holidayToDateStr, todayStr, computeOpenWindow, ScheduleType } from "../utils/scheduleDates.js";

export interface ComplianceParams {
  from: string;
  to: string;
  projectId?: string;
  coordinatorId?: string;
  areaId?: string;
  shiftId?: string;
}

/**
 * Cumplimiento de un coordinador en UN proyecto. Nota de modelado: las novedades reales
 * se cargan **una por (coordinador, proyecto, día)** (el `areaId`/`shiftId` del registro
 * suele venir NULL y cubre todos los turnos que coordina ese día). Por eso el cumplimiento
 * se calcula por día de proyecto, no por (área, turno). `areas`/`turnos` son informativos.
 */
export interface ProjectCompliance {
  projectId: string;
  projectName: string;
  areas: string[];
  turnos: string[];
  /** Turnos con sus días (0=Dom..6=Sáb) para saber cuáles corren en cada fecha faltante. */
  turnosInfo: { name: string; days: number[] }[];
  expectedDates: string[];
  submittedDates: string[];
  /** Todas las esperadas sin enviar (incluye las que todavía se pueden cargar). */
  missingDates: string[];
  /** Subconjunto de missingDates que AÚN se puede cargar (dentro de "Días Permitidos"). */
  pendingDates: string[];
  /** Nº de novedad (reportNumber) por fecha enviada, ej. { "2026-07-01": "DEM-REG-000353" }. */
  reportsByDate: Record<string, string>;
}

export interface CoordinatorCompliance {
  userId: string;
  name: string;
  expectedCount: number;
  submittedCount: number;
  missingCount: number;
  missingDates: string[];
  projects: ProjectCompliance[];
}

export interface MissingCell {
  userId: string;
  name: string;
  projectId: string;
  projectName: string;
  /** Áreas/turnos que coordina (informativo), ej. "Técnica · Mañana, Tarde". */
  label: string;
}

export interface CalendarDayCompliance {
  date: string;
  /** "pending" = falta pero todavía se puede cargar (azul); "missing" = vencida (rojo). */
  status: "complete" | "partial" | "pending" | "missing" | "none";
  expected: number;
  submitted: number;
  missing: number;
  /** Cuántas de las faltantes todavía se pueden cargar. */
  pending: number;
  missingCells: MissingCell[];
}

export interface ComplianceResponse {
  from: string;
  to: string;
  generatedAt: string;
  totals: {
    expected: number;
    submitted: number;
    missing: number;
    compliancePct: number;
    coordinatorsBehind: number;
  };
  coordinators: CoordinatorCompliance[];
  calendar: CalendarDayCompliance[];
}

const idStr = (v: any): string => (v && typeof v === "object" ? String(v._id || v) : String(v));

export async function computeCompliance(tenantId: Types.ObjectId, params: ComplianceParams): Promise<ComplianceResponse> {
  const today = todayStr();
  const from = params.from;
  const to = params.to > today ? today : params.to; // clamp a hoy

  // 1. Proyectos con asignaciones + schedule.
  const projectFilter: any = { tenantId };
  if (params.projectId) projectFilter._id = params.projectId;
  // OJO: traer activityLogConfig COMPLETO (no sólo .schedule): necesitamos useGlobalConfig
  // y allowedPastDays para resolver la ventana de "Días Permitidos" por proyecto.
  const projects = await Project.find(projectFilter)
    .select("name coordinatorAssignments activityLogConfig")
    .lean();

  // 2. Catálogos de referencia + config global de "Días Permitidos".
  const [shifts, areas, holidayDocs, generalConfig] = await Promise.all([
    Shift.find({ tenantId }).select("name days").lean(),
    Area.find({ tenantId }).select("name").lean(),
    Holiday.find({ tenantId, date: { $gte: new Date(from + "T00:00:00Z"), $lte: new Date(to + "T23:59:59Z") } }).select("date").lean(),
    ActivityLogGeneralConfig.getOrCreateDefault(tenantId),
  ]);
  const shiftById = new Map<string, any>(shifts.map((s: any) => [String(s._id), s]));
  const areaById = new Map<string, any>(areas.map((a: any) => [String(a._id), a]));
  const holidaySet = new Set<string>(holidayDocs.map((h: any) => holidayToDateStr(h.date)));

  // 3. Agrupar asignaciones por (coordinador, proyecto). La novedad es 1 por día/proyecto,
  //    así que la unidad de cumplimiento es (coordinador, proyecto, día).
  interface Group {
    userId: string;
    projectId: string;
    projectName: string;
    scheduleType?: ScheduleType;
    scheduleDays?: number[];
    areaIds: Set<string>;
    shiftIds: Set<string>;
    shiftDaysUnion: Set<number>;
    expected: string[];
  }
  const groups = new Map<string, Group>();
  // Ventana de carga abierta por proyecto (según "Días Permitidos": global u override del proyecto).
  const openWindowByProject = new Map<string, Set<string>>();

  for (const p of projects as any[]) {
    const schedule = p.activityLogConfig?.schedule || {};
    // Mismo criterio que projects.ts/resolveProjectGlobalConfig: si no está en false, hereda el global.
    const cfg = p.activityLogConfig || {};
    const allowedPastDays = cfg.useGlobalConfig !== false ? generalConfig.allowedPastDays : (cfg.allowedPastDays ?? generalConfig.allowedPastDays);
    openWindowByProject.set(
      String(p._id),
      computeOpenWindow({ scheduleType: schedule.type as ScheduleType | undefined, scheduleDays: schedule.days, allowedPastDays, today }),
    );

    for (const a of p.coordinatorAssignments || []) {
      const userId = idStr(a.userId);
      const areaId = idStr(a.areaId);
      const shiftId = idStr(a.shiftId);
      if (!userId || !areaId || !shiftId) continue;
      if (params.coordinatorId && userId !== params.coordinatorId) continue;
      if (params.areaId && areaId !== params.areaId) continue;
      if (params.shiftId && shiftId !== params.shiftId) continue;

      const key = `${userId}|${String(p._id)}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          userId,
          projectId: String(p._id),
          projectName: p.name || "—",
          scheduleType: schedule.type as ScheduleType | undefined,
          scheduleDays: schedule.days,
          areaIds: new Set(),
          shiftIds: new Set(),
          shiftDaysUnion: new Set(),
          expected: [],
        };
        groups.set(key, g);
      }
      g.areaIds.add(areaId);
      g.shiftIds.add(shiftId);
      const shift = shiftById.get(shiftId);
      if (Array.isArray(shift?.days)) shift.days.forEach((d: number) => g!.shiftDaysUnion.add(d));
    }
  }

  // Días esperados por grupo (schedule ∩ unión de días de sus turnos − feriados).
  for (const g of groups.values()) {
    g.expected = expandExpectedDates({
      from,
      to,
      scheduleType: g.scheduleType,
      scheduleDays: g.scheduleDays,
      shiftDays: g.shiftDaysUnion.size ? [...g.shiftDaysUnion] : undefined,
      holidays: holidaySet,
      excludeFuture: true,
      today,
    });
  }

  const coordIds = new Set<string>([...groups.values()].map((g) => g.userId));

  // Nombres de coordinadores.
  const users = await User.find({ _id: { $in: [...coordIds].filter((id) => Types.ObjectId.isValid(id)) } })
    .select("firstName lastName email")
    .lean();
  const userById = new Map<string, any>(users.map((u: any) => [String(u._id), u]));
  const nameOf = (userId: string): string => {
    const u = userById.get(userId);
    if (!u) return "—";
    return `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "—";
  };
  const labelOf = (g: Group): string => {
    const areasStr = [...g.areaIds].map((id) => areaById.get(id)?.name).filter(Boolean).join(", ") || "(sin área)";
    const turnosStr = [...g.shiftIds].map((id) => shiftById.get(id)?.name).filter(Boolean).join(", ") || "(sin turno)";
    return `${areasStr} · ${turnosStr}`;
  };

  // 4. Novedades enviadas (una query). Match tolerante por (user, proyecto, fecha):
  //    los registros suelen tener area/shift NULL y cubren el día completo del coordinador.
  const userIdList = [...coordIds].filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
  const projIdList = [...new Set([...groups.values()].map((g) => g.projectId))].filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
  const submitted = userIdList.length && projIdList.length
    ? await Request.find({ tenantId, userId: { $in: userIdList }, projectId: { $in: projIdList }, date: { $gte: from, $lte: to } })
        .select("userId projectId date reportNumber")
        .lean()
    : [];
  const submittedByUserProj = new Map<string, Set<string>>();
  // Nº de novedad por (user|proj|fecha) para mostrarlo en el calendario.
  const reportNumberByKey = new Map<string, string>();
  for (const r of submitted as any[]) {
    const key = `${idStr(r.userId)}|${idStr(r.projectId)}`;
    if (!submittedByUserProj.has(key)) submittedByUserProj.set(key, new Set());
    submittedByUserProj.get(key)!.add(String(r.date));
    if (r.reportNumber) reportNumberByKey.set(`${key}|${String(r.date)}`, String(r.reportNumber));
  }

  // 5. Left-join por grupo + agregación por coordinador y por día.
  const coordMap = new Map<string, CoordinatorCompliance>();
  const dayMap = new Map<string, CalendarDayCompliance>();
  for (const d of eachDateStr(from, to)) {
    dayMap.set(d, { date: d, status: "none", expected: 0, submitted: 0, missing: 0, pending: 0, missingCells: [] });
  }

  for (const g of groups.values()) {
    const submittedSet = submittedByUserProj.get(`${g.userId}|${g.projectId}`) || new Set<string>();
    const submittedDates = g.expected.filter((d) => submittedSet.has(d));
    const submittedLookup = new Set(submittedDates);
    const missingDates = g.expected.filter((d) => !submittedLookup.has(d));
    // Faltantes que todavía se pueden cargar (dentro de la ventana del proyecto).
    const openWindow = openWindowByProject.get(g.projectId) || new Set<string>();
    const pendingDates = missingDates.filter((d) => openWindow.has(d));
    const pendingLookup = new Set(pendingDates);

    if (!coordMap.has(g.userId)) {
      coordMap.set(g.userId, { userId: g.userId, name: nameOf(g.userId), expectedCount: 0, submittedCount: 0, missingCount: 0, missingDates: [], projects: [] });
    }
    const c = coordMap.get(g.userId)!;
    c.expectedCount += g.expected.length;
    c.submittedCount += submittedDates.length;
    c.missingCount += missingDates.length;
    c.missingDates.push(...missingDates);
    c.projects.push({
      projectId: g.projectId,
      projectName: g.projectName,
      areas: [...g.areaIds].map((id) => areaById.get(id)?.name || "(sin área)"),
      turnos: [...g.shiftIds].map((id) => shiftById.get(id)?.name || "(sin turno)"),
      turnosInfo: [...g.shiftIds].map((id) => ({
        name: shiftById.get(id)?.name || "(sin turno)",
        days: Array.isArray(shiftById.get(id)?.days) ? shiftById.get(id).days : [],
      })),
      expectedDates: g.expected,
      submittedDates,
      missingDates,
      pendingDates,
      reportsByDate: Object.fromEntries(
        submittedDates
          .map((d) => [d, reportNumberByKey.get(`${g.userId}|${g.projectId}|${d}`)])
          .filter(([, n]) => !!n) as [string, string][],
      ),
    });

    const label = labelOf(g);
    for (const d of g.expected) {
      const day = dayMap.get(d);
      if (!day) continue;
      day.expected += 1;
      if (submittedLookup.has(d)) {
        day.submitted += 1;
      } else {
        day.missing += 1;
        if (pendingLookup.has(d)) day.pending += 1;
        day.missingCells.push({ userId: g.userId, name: nameOf(g.userId), projectId: g.projectId, projectName: g.projectName, label });
      }
    }
  }

  const coordinators = [...coordMap.values()]
    .map((c) => ({ ...c, missingDates: [...new Set(c.missingDates)].sort() }))
    .sort((a, b) => b.missingCount - a.missingCount || a.name.localeCompare(b.name));

  const calendar = [...dayMap.values()].map((day) => {
    let status: CalendarDayCompliance["status"] = "none";
    if (day.expected === 0) status = "none";
    else if (day.missing === 0) status = "complete";
    // Nada enviado pero TODAS las faltantes todavía se pueden cargar → pendiente (azul).
    else if (day.submitted === 0 && day.pending === day.missing) status = "pending";
    else if (day.submitted === 0) status = "missing";
    else status = "partial";
    return { ...day, status };
  });

  const expected = coordinators.reduce((s, c) => s + c.expectedCount, 0);
  const submittedTotal = coordinators.reduce((s, c) => s + c.submittedCount, 0);
  const missing = coordinators.reduce((s, c) => s + c.missingCount, 0);
  const coordinatorsBehind = coordinators.filter((c) => c.missingCount > 0).length;

  return {
    from,
    to,
    generatedAt: new Date().toISOString(),
    totals: {
      expected,
      submitted: submittedTotal,
      missing,
      compliancePct: expected > 0 ? Math.round((submittedTotal / expected) * 1000) / 10 : 0,
      coordinatorsBehind,
    },
    coordinators,
    calendar,
  };
}
