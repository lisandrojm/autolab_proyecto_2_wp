import { Types } from "mongoose";
import { Project } from "../models/Project.js";
import { Shift } from "../models/Shift.js";
import { Area } from "../models/Area.js";
import { User } from "../models/User.js";
import { Holiday } from "../models/Holiday.js";
import { Request } from "../models/Request.js";
import { expandExpectedDates, eachDateStr, holidayToDateStr, todayStr } from "../utils/scheduleDates.js";
const idStr = (v) => (v && typeof v === "object" ? String(v._id || v) : String(v));
export async function computeCompliance(tenantId, params) {
    const today = todayStr();
    const from = params.from;
    const to = params.to > today ? today : params.to; // clamp a hoy
    // 1. Proyectos con asignaciones + schedule.
    const projectFilter = { tenantId };
    if (params.projectId)
        projectFilter._id = params.projectId;
    const projects = await Project.find(projectFilter)
        .select("name coordinatorAssignments activityLogConfig.schedule")
        .lean();
    // 2. Catálogos de referencia.
    const [shifts, areas, holidayDocs] = await Promise.all([
        Shift.find({ tenantId }).select("name days").lean(),
        Area.find({ tenantId }).select("name").lean(),
        Holiday.find({ tenantId, date: { $gte: new Date(from + "T00:00:00Z"), $lte: new Date(to + "T23:59:59Z") } }).select("date").lean(),
    ]);
    const shiftById = new Map(shifts.map((s) => [String(s._id), s]));
    const areaById = new Map(areas.map((a) => [String(a._id), a]));
    const holidaySet = new Set(holidayDocs.map((h) => holidayToDateStr(h.date)));
    const groups = new Map();
    for (const p of projects) {
        const schedule = p.activityLogConfig?.schedule || {};
        for (const a of p.coordinatorAssignments || []) {
            const userId = idStr(a.userId);
            const areaId = idStr(a.areaId);
            const shiftId = idStr(a.shiftId);
            if (!userId || !areaId || !shiftId)
                continue;
            if (params.coordinatorId && userId !== params.coordinatorId)
                continue;
            if (params.areaId && areaId !== params.areaId)
                continue;
            if (params.shiftId && shiftId !== params.shiftId)
                continue;
            const key = `${userId}|${String(p._id)}`;
            let g = groups.get(key);
            if (!g) {
                g = {
                    userId,
                    projectId: String(p._id),
                    projectName: p.name || "—",
                    scheduleType: schedule.type,
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
            if (Array.isArray(shift?.days))
                shift.days.forEach((d) => g.shiftDaysUnion.add(d));
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
    const coordIds = new Set([...groups.values()].map((g) => g.userId));
    // Nombres de coordinadores.
    const users = await User.find({ _id: { $in: [...coordIds].filter((id) => Types.ObjectId.isValid(id)) } })
        .select("firstName lastName email")
        .lean();
    const userById = new Map(users.map((u) => [String(u._id), u]));
    const nameOf = (userId) => {
        const u = userById.get(userId);
        if (!u)
            return "—";
        return `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "—";
    };
    const labelOf = (g) => {
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
    const submittedByUserProj = new Map();
    // Nº de novedad por (user|proj|fecha) para mostrarlo en el calendario.
    const reportNumberByKey = new Map();
    for (const r of submitted) {
        const key = `${idStr(r.userId)}|${idStr(r.projectId)}`;
        if (!submittedByUserProj.has(key))
            submittedByUserProj.set(key, new Set());
        submittedByUserProj.get(key).add(String(r.date));
        if (r.reportNumber)
            reportNumberByKey.set(`${key}|${String(r.date)}`, String(r.reportNumber));
    }
    // 5. Left-join por grupo + agregación por coordinador y por día.
    const coordMap = new Map();
    const dayMap = new Map();
    for (const d of eachDateStr(from, to)) {
        dayMap.set(d, { date: d, status: "none", expected: 0, submitted: 0, missing: 0, missingCells: [] });
    }
    for (const g of groups.values()) {
        const submittedSet = submittedByUserProj.get(`${g.userId}|${g.projectId}`) || new Set();
        const submittedDates = g.expected.filter((d) => submittedSet.has(d));
        const submittedLookup = new Set(submittedDates);
        const missingDates = g.expected.filter((d) => !submittedLookup.has(d));
        if (!coordMap.has(g.userId)) {
            coordMap.set(g.userId, { userId: g.userId, name: nameOf(g.userId), expectedCount: 0, submittedCount: 0, missingCount: 0, missingDates: [], projects: [] });
        }
        const c = coordMap.get(g.userId);
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
            reportsByDate: Object.fromEntries(submittedDates
                .map((d) => [d, reportNumberByKey.get(`${g.userId}|${g.projectId}|${d}`)])
                .filter(([, n]) => !!n)),
        });
        const label = labelOf(g);
        for (const d of g.expected) {
            const day = dayMap.get(d);
            if (!day)
                continue;
            day.expected += 1;
            if (submittedLookup.has(d)) {
                day.submitted += 1;
            }
            else {
                day.missing += 1;
                day.missingCells.push({ userId: g.userId, name: nameOf(g.userId), projectId: g.projectId, projectName: g.projectName, label });
            }
        }
    }
    const coordinators = [...coordMap.values()]
        .map((c) => ({ ...c, missingDates: [...new Set(c.missingDates)].sort() }))
        .sort((a, b) => b.missingCount - a.missingCount || a.name.localeCompare(b.name));
    const calendar = [...dayMap.values()].map((day) => {
        let status = "none";
        if (day.expected === 0)
            status = "none";
        else if (day.missing === 0)
            status = "complete";
        else if (day.submitted === 0)
            status = "missing";
        else
            status = "partial";
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
