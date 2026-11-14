import { Types } from "mongoose";
import UserProject from "../models/UserProject.js";
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";
import { contratosQueRigenDelProyecto } from "../utils/contratosQueRigen.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";
import { firmaDeAreas } from "../compartido/configDelEquipo.js";
import { areasDelContrato, filasDeArea, repartirAreas, vigentesALaVez } from "./equipoSegunContratos.js";
/**
 * EL ÁREA Y EL TURNO DEL EQUIPO, TAMBIÉN EN EL CONTRATO QUE RIGE (12/11/2026).
 *
 * Pedido: «el equipo debe tener exactamente los turnos del contrato»; que el equipo diga «Tarde» y el
 * contrato «Mañana» confunde. Guardar un contrato ya deja al equipo igual (`queActualizarDelEquipo`); esto
 * cubre el otro sentido: cuando el área se cambia desde el equipo (Jerarquía, tabla del equipo, «Pasar
 * todos a…»), se escribe la misma área, turnos y sede en el contrato que rige de cada persona.
 *
 * Toca SÓLO el área/turno del contrato (`areaShiftAssignments`, `areaId`, `shiftId`, `nombre_area`,
 * `nombre_turno`): ni fechas, ni horario, ni sueldos, ni `sede_id` (de la sede del contrato sale el
 * domicilio de ARCA). Los contratos no tienen `_id` en los viejos, así que se escribe por posición, pero
 * condicionado a que en esa posición siga estando el mismo contrato (misma alta y baja).
 *
 * VARIOS CONTRATOS VIGENTES A LA VEZ (14/11/2026): el equipo muestra la suma de todos, así que lo que llega
 * de ahí se reparte entre ellos con `repartirAreas` —cada uno conserva lo suyo, lo nuevo va al que rige— en
 * vez de copiarle la suma entera al que rige (un contrato de la Tarde terminaría diciendo Mañana y Tarde).
 *
 * Devuelve cuántos contratos cambió.
 */
export async function llevarAreasAlContratoQueRige(projectId, asignacionesPorUsuario) {
    if (asignacionesPorUsuario.size === 0)
        return 0;
    const contratoDe = await contratosQueRigenDelProyecto(String(projectId), hoyArgentina());
    const pendientes = [...asignacionesPorUsuario.entries()]
        .map(([userId, asignaciones]) => ({ userId, asignaciones: asignaciones || [], contrato: contratoDe.get(userId) }))
        .filter((p) => p.contrato && Number.isInteger(p.contrato._indice))
        // Qué contrato recibe qué. Con uno solo, el que rige recibe todo (como siempre); con varios vigentes, cada uno lo suyo.
        .map((p) => {
        const varios = vigentesALaVez(p.contrato);
        if (!varios)
            return { ...p, escrituras: firmaDeAreas(p.contrato.areaShiftAssignments) !== firmaDeAreas(p.asignaciones) ? [{ contrato: p.contrato, asignaciones: p.asignaciones }] : [] };
        if (firmaDeAreas(areasDelContrato(p.contrato) || []) === firmaDeAreas(p.asignaciones))
            return { ...p, escrituras: [] };
        const repartidas = repartirAreas(p.asignaciones, varios.map(filasDeArea), 0);
        return { ...p, escrituras: varios.map((contrato, i) => ({ contrato, asignaciones: repartidas[i] })).filter((e) => firmaDeAreas(filasDeArea(e.contrato)) !== firmaDeAreas(e.asignaciones)) };
    })
        .filter((p) => p.escrituras.length > 0);
    if (!pendientes.length)
        return 0;
    const ids = (sel) => [...new Set(pendientes.flatMap((p) => p.asignaciones.flatMap(sel)).map(String))].filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    const [areas, turnos] = await Promise.all([
        Area.find({ _id: { $in: ids((a) => [a.areaId]) } }).select("name").lean(),
        Shift.find({ _id: { $in: ids((a) => a.shiftIds || []) } }).select("name").lean(),
    ]);
    const nombreArea = new Map(areas.map((a) => [String(a._id), String(a.name || "")]));
    const nombreTurno = new Map(turnos.map((t) => [String(t._id), String(t.name || "")]));
    let cambiados = 0;
    for (const p of pendientes) {
        for (const e of p.escrituras) {
            const i = e.contrato._indice;
            const primera = e.asignaciones[0];
            const areaId = primera?.areaId ?? null;
            const shiftId = primera?.shiftIds?.[0] ?? null;
            const r = await UserProject.updateOne(
            // Sólo si en esa posición sigue el mismo contrato (alguien pudo borrar uno en el medio).
            { projectId: new Types.ObjectId(String(projectId)), userId: new Types.ObjectId(p.userId), [`contracts.${i}.fecha_alta_contrato`]: e.contrato.fecha_alta_contrato ?? null, [`contracts.${i}.fecha_baja_contrato`]: e.contrato.fecha_baja_contrato ?? null }, {
                $set: {
                    [`contracts.${i}.areaShiftAssignments`]: e.asignaciones,
                    [`contracts.${i}.areaId`]: areaId,
                    [`contracts.${i}.shiftId`]: shiftId,
                    [`contracts.${i}.nombre_area`]: (areaId && nombreArea.get(String(areaId))) || "Sin área",
                    [`contracts.${i}.nombre_turno`]: (shiftId && nombreTurno.get(String(shiftId))) || "Sin turno",
                },
            });
            cambiados += r.modifiedCount || 0;
        }
    }
    return cambiados;
}
