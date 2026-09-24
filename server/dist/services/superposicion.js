import { Types } from "mongoose";
import UserProject from "../models/UserProject.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
// El `populate("clientId")` necesita el modelo registrado; no se depende de que otro archivo lo haya cargado.
import "../models/Client.js";
import { fechaISO, hoyArgentina } from "../utils/contratoVigencia.js";
import { superposiciones } from "../utils/superposicionContratos.js";
/*
  SUPERPOSICIÓN DE UN ALTA CON LO QUE LA PERSONA YA TIENE: la parte que toca la base.

  Junta todos sus contratos (en cualquier proyecto) y sus otras solicitudes pendientes, y se los pasa a
  la regla pura (`utils/superposicionContratos.ts`). La usan el formulario individual (para avisar
  mientras se carga), el alta de la solicitud (que guarda la foto de los avisos para quien aprueba) y el
  alta masiva de plantillas de equipo.
*/
const idsDeTurno = (asignaciones, suelto) => {
    const ids = (asignaciones || []).flatMap((a) => (a?.shiftIds || []).map(String));
    if (suelto)
        ids.push(String(suelto));
    return [...new Set(ids.filter(Boolean))];
};
/** "10:00 - 18:00" → { inTime, outTime }. */
const partirHorario = (schedule) => {
    const [inTime = "", outTime = ""] = String(schedule || "").split("-").map((s) => s.trim());
    return { inTime, outTime };
};
/** El pedido tal como viaja en la solicitud (`metadata` del payload). */
export function pedidoDesdeSolicitud(m) {
    return {
        desde: fechaISO(m?.startDate),
        hasta: fechaISO(m?.dueDate),
        fechas: Array.isArray(m?.fechasTrabajadas) ? m.fechasTrabajadas.map((f) => fechaISO(f)).filter(Boolean) : undefined,
        dias: Array.isArray(m?.diasSemana) ? m.diasSemana.map(Number) : [],
        rotativos: !!m?.diasRotativos,
        ...partirHorario(m?.schedule),
        shiftIds: idsDeTurno(m?.areaShiftAssignments),
    };
}
/** Todo lo que la persona ya tiene comprometido: contratos (todos los proyectos) y solicitudes pendientes. */
export async function compromisosDePersona(tenantId, userId, excluirSolicitudId) {
    if (!Types.ObjectId.isValid(userId))
        return [];
    const uid = new Types.ObjectId(userId);
    const [asignaciones, pendientes] = await Promise.all([
        UserProject.find({ userId: uid })
            .select("projectId nombre_proyecto contracts.fecha_alta_contrato contracts.fecha_baja_contrato contracts.dias_semana contracts.dias_rotativos contracts.hora_inicio contracts.hora_fin contracts.shiftId contracts.areaShiftAssignments contracts.nombre_turno")
            .lean(),
        User.find({
            tenantId,
            "metadata.isSolicitud": true,
            "metadata.solicitudStatus": "pendiente",
            "metadata.solicitudUserId": { $in: [userId, uid] },
            ...(excluirSolicitudId && Types.ObjectId.isValid(excluirSolicitudId) ? { _id: { $ne: new Types.ObjectId(excluirSolicitudId) } } : {}),
        })
            .select("metadata.startDate metadata.dueDate metadata.fechasTrabajadas metadata.diasSemana metadata.diasRotativos metadata.schedule metadata.areaShiftAssignments metadata.projectIds")
            .lean(),
    ]);
    const proyectoIds = [...asignaciones.map((a) => a.projectId), ...pendientes.flatMap((p) => p.metadata?.projectIds || [])].filter((id) => id && Types.ObjectId.isValid(String(id)));
    const proyectos = proyectoIds.length ? await Project.find({ _id: { $in: proyectoIds } }).select("name clientId").populate("clientId", "name").lean() : [];
    const nombreDe = new Map(proyectos.map((p) => [String(p._id), p.clientId?.name ? `${p.clientId.name} | ${p.name}` : p.name]));
    const compromisos = [];
    for (const a of asignaciones) {
        for (const c of a.contracts || []) {
            const desde = fechaISO(c.fecha_alta_contrato);
            if (!desde)
                continue;
            compromisos.push({
                origen: "contrato",
                proyectoNombre: nombreDe.get(String(a.projectId)) || a.nombre_proyecto || "",
                desde,
                hasta: fechaISO(c.fecha_baja_contrato),
                dias: Array.isArray(c.dias_semana) ? c.dias_semana.map(Number) : [],
                rotativos: !!c.dias_rotativos,
                inTime: c.hora_inicio || "",
                outTime: c.hora_fin || "",
                shiftIds: idsDeTurno(c.areaShiftAssignments, c.shiftId),
                turnoNombre: c.nombre_turno || "",
            });
        }
    }
    for (const p of pendientes) {
        const pedido = pedidoDesdeSolicitud(p.metadata);
        if (!pedido.desde && !pedido.fechas?.length)
            continue;
        compromisos.push({ origen: "solicitud", proyectoNombre: nombreDe.get(String(p.metadata?.projectIds?.[0])) || "", ...pedido });
    }
    return compromisos;
}
/** Los avisos de superposición de un alta para una persona. `[]` si no es una persona registrada. */
export async function superposicionesDeAlta(tenantId, userId, pedido, excluirSolicitudId) {
    if (!userId)
        return [];
    return superposiciones(pedido, await compromisosDePersona(tenantId, userId, excluirSolicitudId), hoyArgentina());
}
