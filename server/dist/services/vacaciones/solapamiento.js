import { Types } from "mongoose";
import { Vacation } from "../../models/Vacation.js";
import { VacationConfig } from "../../models/VacationConfig.js";
import { User } from "../../models/User.js";
import { UserProfile } from "../../models/UserProfile.js";
import { Area } from "../../models/Area.js";
import UserProject from "../../models/UserProject.js";
import { RoleFrame } from "../../models/RoleFrame.js";
/** La persona tal como la miran las reglas. `null` si no existe. */
export async function perfilDeSolapamiento(tenantId, userId) {
    const user = await User.findById(userId).populate("metadata.projects");
    if (!user)
        return null;
    let userAreaId = null;
    const profile = await UserProfile.findOne({ userId, tenantId });
    if (profile?.department) {
        const area = await Area.findOne({ tenantId, name: profile.department });
        if (area)
            userAreaId = String(area._id);
    }
    return { userId: String(userId), user, userAreaId, projectIds: user.projectIds || [] };
}
/**
 * Las reglas activas que le aplican a la persona, quedándose sólo con las MÁS ESPECÍFICAS («Specific
 * overrides General»): cada criterio fijado en la regla suma un punto, y sólo cuentan las de puntaje
 * máximo. Vacío si no hay configuración o ninguna le aplica.
 */
export async function reglasAplicables(tenantId, perfil) {
    const vacConfig = await VacationConfig.findOne({ tenantId });
    if (!vacConfig || !vacConfig.overlaps || vacConfig.overlaps.length === 0)
        return [];
    const aplicables = [];
    for (const rule of vacConfig.overlaps) {
        if (!rule.isActive)
            continue;
        let matches = true;
        let score = 0;
        if (rule.areaId) {
            score++;
            if (!perfil.userAreaId || perfil.userAreaId !== String(rule.areaId))
                matches = false;
        }
        if (matches && rule.projectId) {
            score++;
            const userProjects = perfil.projectIds.map((p) => String(p));
            if (!userProjects.includes(String(rule.projectId)))
                matches = false;
        }
        if (matches && rule.roleFrameId) {
            score++;
            try {
                const rf = await RoleFrame.findById(rule.roleFrameId);
                if (rf) {
                    const userMetaProjects = perfil.user.metadata?.projects || [];
                    const hasRole = userMetaProjects.some((p) => p.rol_frame_id == rf.externalId || p.rol_frame_id == rf.data?.rol?.id);
                    if (!hasRole)
                        matches = false;
                }
                else
                    matches = false;
            }
            catch {
                matches = false;
            }
        }
        if (matches)
            aplicables.push({ rule, score });
    }
    if (aplicables.length === 0)
        return [];
    const maxScore = Math.max(...aplicables.map((r) => r.score));
    return aplicables.filter((r) => r.score === maxScore).map((r) => r.rule);
}
const minutosDe = (timeStr) => {
    if (!timeStr)
        return -1;
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + m;
};
/**
 * ¿Comparten franja horaria? Se miran los contratos no vencidos de cada una (en ese proyecto, si se
 * pasa) y se comparan sus `hora_inicio`/`hora_fin`; 00:00 de fin es 24:00 y un turno nocturno cruza
 * la medianoche. Si alguna no tiene horario cargado se asume que sí se pisan: es lo seguro.
 */
export function hayChoqueDeHorario(meta1, meta2, contextPId) {
    const turnosDe = (meta) => {
        const shifts = [];
        if (!meta?.projects)
            return shifts;
        for (const p of meta.projects) {
            const pIdStr = p.projectId?._id?.toString() || p.projectId?.toString();
            if (contextPId && pIdStr !== String(contextPId))
                continue;
            for (const c of p.contracts || []) {
                const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
                const isActive = !endDate || endDate >= new Date();
                if (!isActive || !c.hora_inicio || !c.hora_fin)
                    continue;
                const start = minutosDe(c.hora_inicio);
                let end = minutosDe(c.hora_fin);
                if (start === -1 || end === -1)
                    continue;
                if (end === 0)
                    end = 1440;
                if (end < start)
                    end += 1440;
                shifts.push({ start, end });
            }
        }
        return shifts;
    };
    const s1 = turnosDe(meta1);
    const s2 = turnosDe(meta2);
    if (s1.length === 0 || s2.length === 0)
        return true;
    for (const a of s1)
        for (const b of s2)
            if (Math.max(a.start, b.start) < Math.min(a.end, b.end))
                return true;
    return false;
}
/** Los ámbitos (proyecto × área) contra los que se evalúa una regla para esta persona: lo fijado en la regla, o cada uno de los suyos. */
export function ambitosDe(rule, perfil) {
    const projectsToCheck = rule.projectId ? [rule.projectId] : perfil.projectIds.length ? perfil.projectIds : [];
    const areasToCheck = rule.areaId ? [rule.areaId] : perfil.userAreaId ? [perfil.userAreaId] : [];
    const finalProjects = projectsToCheck.length > 0 ? projectsToCheck : [undefined];
    const finalAreas = areasToCheck.length > 0 ? areasToCheck : [undefined];
    const out = [];
    for (const pId of finalProjects)
        for (const aId of finalAreas)
            out.push({ pId, aId });
    return out;
}
/** Las OTRAS personas activas del ámbito (con el rol de la regla, si lo fija), con `metadata.projects` poblado para el horario. */
export async function personasDelAmbito(tenantId, perfil, rule, ambito) {
    const query = { tenantId, "metadata.activo": true, _id: { $ne: perfil.userId } };
    if (ambito.pId)
        query.projectIds = ambito.pId;
    if (ambito.aId) {
        const usersInArea = await UserProject.find({ areaId: ambito.aId }).distinct("userId");
        query._id = { $in: usersInArea, $ne: perfil.userId };
    }
    if (rule.roleFrameId) {
        const rf = await RoleFrame.findById(rule.roleFrameId);
        if (rf) {
            const values = [];
            if (rf.externalId)
                values.push(rf.externalId);
            if (rf.data?.rol?.id)
                values.push(rf.data.rol.id);
            if (values.length > 0)
                query["metadata.projects"] = { $elemMatch: { rol_frame_id: { $in: values } } };
        }
    }
    return User.find(query).select("_id metadata").populate("metadata.projects");
}
/**
 * Qué fechas tiene bloqueadas la persona por las reglas (lo que la app pinta como ocupado): de este
 * mes a 18 meses adelante, un día se bloquea si en algún ámbito la cantidad de vacaciones (no
 * rechazadas ni canceladas, de personas que comparten horario) llega al máximo de la regla.
 * `status` dice si lo que bloquea es sólo pendiente o ya aprobado.
 */
export async function fechasBloqueadas(tenantId, userId) {
    const perfil = await perfilDeSolapamiento(tenantId, userId);
    if (!perfil)
        return [];
    const reglas = await reglasAplicables(tenantId, perfil);
    if (reglas.length === 0)
        return [];
    const now = new Date();
    const searchStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const searchEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 18, 1));
    const blockedDatesMap = new Map();
    for (const rule of reglas) {
        for (const ambito of ambitosDe(rule, perfil)) {
            const matchingUsers = await personasDelAmbito(tenantId, perfil, rule, ambito);
            const matchingUserIds = matchingUsers.map((u) => u._id);
            const overlappingVacations = await Vacation.find({
                tenantId,
                userId: { $in: matchingUserIds },
                status: { $nin: ["rejected", "cancelled"] },
                endDate: { $gte: searchStart },
                startDate: { $lte: searchEnd },
            }).lean();
            const occupancy = {};
            for (const v of overlappingVacations) {
                const vUser = matchingUsers.find((u) => String(u._id) === String(v.userId));
                if (vUser && !hayChoqueDeHorario(perfil.user.metadata, vUser.metadata, ambito.pId ? String(ambito.pId) : undefined))
                    continue;
                const current = new Date(v.startDate < searchStart ? searchStart : v.startDate);
                const end = new Date(v.endDate > searchEnd ? searchEnd : v.endDate);
                const isPending = v.status === "pending";
                while (current <= end) {
                    const dateStr = current.toISOString().split("T")[0];
                    if (!occupancy[dateStr])
                        occupancy[dateStr] = { count: 0, hasPending: false };
                    occupancy[dateStr].count++;
                    if (isPending)
                        occupancy[dateStr].hasPending = true;
                    current.setDate(current.getDate() + 1);
                }
            }
            for (const [date, data] of Object.entries(occupancy)) {
                if (data.count < rule.maxSimultaneousUsers)
                    continue;
                const existing = blockedDatesMap.get(date);
                const currentStatus = data.hasPending ? "pending" : "approved";
                if (!existing)
                    blockedDatesMap.set(date, currentStatus);
                else if (existing === "pending" && currentStatus === "approved")
                    blockedDatesMap.set(date, "approved");
            }
        }
    }
    return Array.from(blockedDatesMap.entries()).map(([date, status]) => ({ date, status }));
}
/**
 * ¿Un pedido de `start` a `end` viola alguna regla? En cada ámbito se cuentan las personas DISTINTAS
 * que comparten horario y ya tienen vacaciones que se pisan con el rango; si llegan al máximo, viola.
 * `vacacionesVirtuales` se suman a las de la base (y `ignorarVacationIds` se descuentan, p. ej. la
 * propia al editar).
 */
export async function violaSolapamiento(tenantId, userId, start, end, extra = {}) {
    const perfil = await perfilDeSolapamiento(tenantId, userId);
    if (!perfil)
        return { viola: false };
    const reglas = await reglasAplicables(tenantId, perfil);
    if (reglas.length === 0)
        return { viola: false };
    const ignorar = new Set((extra.ignorarVacationIds || []).map(String));
    for (const rule of reglas) {
        for (const ambito of ambitosDe(rule, perfil)) {
            const matchingUsers = await personasDelAmbito(tenantId, perfil, rule, ambito);
            const matchingUserIds = matchingUsers.map((u) => u._id);
            const enBase = await Vacation.find({
                tenantId,
                userId: { $in: matchingUserIds },
                status: { $nin: ["rejected", "cancelled"] },
                $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }],
            }).select("userId");
            const idsDelAmbito = new Set(matchingUserIds.map(String));
            const candidatas = [
                ...enBase.filter((v) => !ignorar.has(String(v._id))),
                ...(extra.vacacionesVirtuales || []).filter((v) => idsDelAmbito.has(String(v.userId)) && v.startDate <= end && v.endDate >= start).map((v) => ({ userId: new Types.ObjectId(String(v.userId)) })),
            ];
            const conflictingUserIds = new Set();
            for (const v of candidatas) {
                const vUser = matchingUsers.find((u) => String(u._id) === String(v.userId));
                if (vUser && hayChoqueDeHorario(perfil.user.metadata, vUser.metadata, ambito.pId ? String(ambito.pId) : undefined))
                    conflictingUserIds.add(String(v.userId));
            }
            if (conflictingUserIds.size >= rule.maxSimultaneousUsers) {
                let scopeDesc = "";
                if (!rule.projectId && ambito.pId)
                    scopeDesc += " (en tu mismo Proyecto)";
                if (!rule.areaId && ambito.aId)
                    scopeDesc += " (en tu misma Área)";
                return {
                    viola: true,
                    regla: rule,
                    personas: conflictingUserIds.size,
                    mensaje: `Conflicto de solapamiento. Hay ${conflictingUserIds.size} personas con este perfil (Regla: ${rule.description || "Personalizada"}${scopeDesc}) de vacaciones en este periodo (Límite: ${rule.maxSimultaneousUsers}).`,
                };
            }
        }
    }
    return { viola: false };
}
