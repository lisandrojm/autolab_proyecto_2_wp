import { Types } from "mongoose";
import UserProject from "../models/UserProject.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";
import { RoleFrame } from "../models/RoleFrame.js";
import { RenovacionContrato } from "../models/RenovacionContrato.js";
import { alcanceDeResponsable } from "../utils/visibilidadResponsable.js";
import { fechaISO, hoyArgentina } from "../utils/contratoVigencia.js";
/** Con cuánta anticipación aparece un contrato: una semana antes de su fecha de baja. */
export const DIAS_DE_AVISO = 7;
// Fechas "YYYY-MM-DD" como días calendario: al mediodía UTC, para que ningún huso corra el día.
const sumarDias = (iso, dias) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
};
const diasEntre = (desde, hasta) => Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
const idDe = (x) => (x && typeof x === "object" ? String(x._id ?? "") : x ? String(x) : "");
/** Las combinaciones área/turno de un contrato, como "areaId::shiftId". */
const combosDeContrato = (c) => {
    const desdeAsignaciones = (c.areaShiftAssignments || [])
        .map((a) => ({ areaId: idDe(a.areaId), shiftIds: (a.shiftIds || []).map(idDe).filter(Boolean) }))
        .filter((a) => a.areaId && a.shiftIds.length > 0);
    if (desdeAsignaciones.length > 0)
        return desdeAsignaciones;
    return idDe(c.areaId) && idDe(c.shiftId) ? [{ areaId: idDe(c.areaId), shiftIds: [idDe(c.shiftId)] }] : [];
};
// Lo que se lee de cada contrato. Los contratos cargan documentación y firmas: traerlos enteros pesa.
const CAMPOS_CONTRATO = ["fecha_alta_contrato", "fecha_baja_contrato", "nombre_contrato", "nombre_rol_frame", "rol_frame_id", "nombre_area", "nombre_turno", "areaId", "shiftId", "areaShiftAssignments", "hora_inicio", "hora_fin", "sueldo_jornada", "dias_por_semana", "dias_semana", "dias_rotativos", "empresaContratoId"];
export async function listarContratosPorVencer(tenantId, userId, hoy = hoyArgentina()) {
    const tenant = new Types.ObjectId(String(tenantId));
    const yo = new Types.ObjectId(String(userId));
    // 1. De qué proyectos: los que supervisa (enteros) y los que coordina (sus áreas/turnos).
    const { proyectos: supervisados } = await alcanceDeResponsable(tenant, String(userId));
    const supervisa = new Set(supervisados.map(String));
    const conCoordinacion = await Project.find({ tenantId: tenant, "coordinatorAssignments.userId": yo }).select("_id coordinatorAssignments").lean();
    const coordina = new Map();
    for (const p of conCoordinacion) {
        const combos = new Set();
        for (const a of p.coordinatorAssignments || [])
            if (String(a.userId) === String(userId))
                combos.add(`${a.areaId}::${a.shiftId}`);
        coordina.set(String(p._id), combos);
    }
    const projectIds = [...new Set([...supervisa, ...coordina.keys()])];
    if (projectIds.length === 0)
        return [];
    // 2. Los contratos que entran. Las fechas son texto y en más de un formato: el filtro fino va acá.
    const limite = sumarDias(hoy, DIAS_DE_AVISO);
    const seleccion = ["projectId", "userId", ...CAMPOS_CONTRATO.map((c) => `contracts.${c}`)].join(" ");
    const asignaciones = await UserProject.find({ projectId: { $in: projectIds.map((id) => new Types.ObjectId(id)) }, "contracts.fecha_baja_contrato": { $nin: [null, ""] } })
        .select(seleccion)
        .lean();
    const candidatos = [];
    for (const up of asignaciones) {
        const contratos = up.contracts || [];
        const pid = String(up.projectId);
        for (const c of contratos) {
            const alta = fechaISO(c.fecha_alta_contrato);
            const baja = fechaISO(c.fecha_baja_contrato);
            // Sin alta no se sabe cuánto dura; sin baja es por tiempo indeterminado y no vence.
            if (!alta || !baja)
                continue;
            if (alta > hoy || baja < hoy || baja > limite)
                continue;
            if (diasEntre(alta, baja) + 1 <= DIAS_DE_AVISO)
                continue;
            if (contratos.some((o) => o !== c && fechaISO(o.fecha_alta_contrato) > baja))
                continue;
            if (!supervisa.has(pid)) {
                const mios = coordina.get(pid);
                const suyos = combosDeContrato(c).flatMap((a) => a.shiftIds.map((s) => `${a.areaId}::${s}`));
                if (!mios || !suyos.some((k) => mios.has(k)))
                    continue;
            }
            candidatos.push({ up, c, alta, baja, pid });
        }
    }
    if (candidatos.length === 0)
        return [];
    // 3. Lo ya resuelto. Una renovación rechazada o cancelada (o borrada) no resuelve nada.
    const decisiones = await RenovacionContrato.find({ tenantId: tenant, userProjectId: { $in: candidatos.map((x) => x.up._id) } }).lean();
    const decisionDe = new Map(decisiones.map((d) => [`${d.userProjectId}::${d.fechaBajaContrato}`, d]));
    const solicitudIds = decisiones.filter((d) => d.decision === "renovar" && d.solicitudId).map((d) => d.solicitudId);
    const solicitudes = solicitudIds.length > 0 ? await User.find({ _id: { $in: solicitudIds } }).select("metadata.solicitudStatus").lean() : [];
    const estadoDe = new Map(solicitudes.map((u) => [String(u._id), u.metadata?.solicitudStatus]));
    const pendientes = candidatos
        .map((x) => {
        const d = decisionDe.get(`${x.up._id}::${x.baja}`);
        if (!d)
            return { ...x, renovacionRechazada: false };
        if (d.decision === "dejar_vencer")
            return null;
        const estado = estadoDe.get(String(d.solicitudId));
        return estado === "pendiente" || estado === "aprobada" ? null : { ...x, renovacionRechazada: true };
    })
        .filter(Boolean);
    if (pendientes.length === 0)
        return [];
    // 4. Los nombres.
    const combos = pendientes.map((x) => combosDeContrato(x.c)[0]);
    const [personas, proyectos, areas, turnos, roles] = await Promise.all([
        User.find({ _id: { $in: pendientes.map((x) => x.up.userId) } }).select("firstName lastName metadata.fullName metadata.roles_frame").lean(),
        Project.find({ _id: { $in: pendientes.map((x) => x.up.projectId) } }).select("name clientId").populate("clientId", "name").lean(),
        Area.find({ _id: { $in: combos.filter(Boolean).map((a) => a.areaId) } }).select("name").lean(),
        Shift.find({ _id: { $in: combos.filter(Boolean).map((a) => a.shiftIds[0]) } }).select("name").lean(),
        RoleFrame.find({ "data.rol.id": { $in: pendientes.map((x) => Number(x.c.rol_frame_id)).filter((n) => Number.isFinite(n) && n > 0) } }).select("name data.rol.id").lean(),
    ]);
    const personaDe = new Map(personas.map((u) => [String(u._id), u]));
    const proyectoDe = new Map(proyectos.map((p) => [String(p._id), p]));
    const areaDe = new Map(areas.map((a) => [String(a._id), a.name]));
    const turnoDe = new Map(turnos.map((s) => [String(s._id), s.name]));
    const rolDe = new Map(roles.map((r) => [Number(r.data?.rol?.id), r]));
    return pendientes
        .map((x, i) => {
        const { up, c, alta, baja, pid } = x;
        const persona = personaDe.get(String(up.userId)) || {};
        const proyecto = proyectoDe.get(pid) || {};
        const nombre = persona.metadata?.fullName || `${persona.firstName || ""} ${persona.lastName || ""}`.trim() || "Sin nombre";
        const combo = combos[i];
        const rol = rolDe.get(Number(c.rol_frame_id));
        const horario = c.hora_inicio && c.hora_fin ? `${c.hora_inicio} - ${c.hora_fin}` : "";
        // La renovación arranca al día siguiente de la baja y dura lo mismo. Son sólo la precarga: se editan.
        const inicio = sumarDias(baja, 1);
        const rolesDeLaPersona = (persona.metadata?.roles_frame || []).map(String);
        return {
            userProjectId: String(up._id),
            userId: String(up.userId),
            nombre,
            projectId: pid,
            proyectoNombre: proyecto.name || "",
            clienteNombre: proyecto.clientId?.name || "",
            areaNombre: (combo && areaDe.get(combo.areaId)) || c.nombre_area || "",
            turnoNombre: (combo && turnoDe.get(combo.shiftIds[0])) || c.nombre_turno || "",
            rolFrame: c.nombre_rol_frame || rol?.name || "",
            contrato: c.nombre_contrato || "",
            horario,
            fechaAlta: alta,
            fechaBaja: baja,
            diasRestantes: diasEntre(hoy, baja),
            motivo: supervisa.has(pid) ? "supervisa" : "coordina",
            renovacionRechazada: x.renovacionRechazada,
            plantilla: {
                firstName: persona.firstName || "",
                lastName: persona.lastName || "",
                metadata: {
                    fullName: nombre,
                    projectIds: [pid],
                    solicitudUserId: String(up.userId),
                    // El rol del contrato si se puede resolver; si no, el primero de la persona.
                    roles_frame: rol ? [String(rol._id)] : rolesDeLaPersona.slice(0, 1),
                    startDate: inicio,
                    dueDate: sumarDias(inicio, diasEntre(alta, baja)),
                    diasPorSemana: c.dias_por_semana ?? undefined,
                    diasSemana: Array.isArray(c.dias_semana) ? c.dias_semana : [],
                    diasRotativos: !!c.dias_rotativos,
                    schedule: horario || undefined,
                    dailyRate: c.sueldo_jornada || undefined,
                    empresaContratoId: c.empresaContratoId ? String(c.empresaContratoId) : undefined,
                    areaShiftAssignments: combosDeContrato(c),
                },
            },
        };
    })
        .sort((a, b) => a.fechaBaja.localeCompare(b.fechaBaja) || a.nombre.localeCompare(b.nombre));
}
