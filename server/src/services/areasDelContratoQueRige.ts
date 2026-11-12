import { Types } from "mongoose";
import UserProject from "../models/UserProject.js";
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";
import { contratosQueRigenDelProyecto } from "../utils/contratosQueRigen.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";
import { firmaDeAreas } from "../compartido/configDelEquipo.js";

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
 * Devuelve cuántos contratos cambió.
 */
export async function llevarAreasAlContratoQueRige(projectId: string | Types.ObjectId, asignacionesPorUsuario: Map<string, any[]>): Promise<number> {
  if (asignacionesPorUsuario.size === 0) return 0;
  const contratoDe = await contratosQueRigenDelProyecto(String(projectId), hoyArgentina());
  const pendientes = [...asignacionesPorUsuario.entries()]
    .map(([userId, asignaciones]) => ({ userId, asignaciones: asignaciones || [], contrato: contratoDe.get(userId) }))
    .filter((p) => p.contrato && Number.isInteger(p.contrato._indice) && firmaDeAreas(p.contrato.areaShiftAssignments) !== firmaDeAreas(p.asignaciones));
  if (!pendientes.length) return 0;

  const ids = (sel: (a: any) => any[]) => [...new Set(pendientes.flatMap((p) => p.asignaciones.flatMap(sel)).map(String))].filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
  const [areas, turnos] = await Promise.all([
    Area.find({ _id: { $in: ids((a) => [a.areaId]) } }).select("name").lean(),
    Shift.find({ _id: { $in: ids((a) => a.shiftIds || []) } }).select("name").lean(),
  ]);
  const nombreArea = new Map((areas as any[]).map((a) => [String(a._id), String(a.name || "")]));
  const nombreTurno = new Map((turnos as any[]).map((t) => [String(t._id), String(t.name || "")]));

  let cambiados = 0;
  for (const p of pendientes) {
    const i = p.contrato._indice;
    const primera = p.asignaciones[0];
    const areaId = primera?.areaId ?? null;
    const shiftId = primera?.shiftIds?.[0] ?? null;
    const r = await UserProject.updateOne(
      // Sólo si en esa posición sigue el mismo contrato (alguien pudo borrar uno en el medio).
      { projectId: new Types.ObjectId(String(projectId)), userId: new Types.ObjectId(p.userId), [`contracts.${i}.fecha_alta_contrato`]: p.contrato.fecha_alta_contrato ?? null, [`contracts.${i}.fecha_baja_contrato`]: p.contrato.fecha_baja_contrato ?? null },
      {
        $set: {
          [`contracts.${i}.areaShiftAssignments`]: p.asignaciones,
          [`contracts.${i}.areaId`]: areaId,
          [`contracts.${i}.shiftId`]: shiftId,
          [`contracts.${i}.nombre_area`]: (areaId && nombreArea.get(String(areaId))) || "Sin área",
          [`contracts.${i}.nombre_turno`]: (shiftId && nombreTurno.get(String(shiftId))) || "Sin turno",
        },
      },
    );
    cambiados += r.modifiedCount || 0;
  }
  return cambiados;
}
