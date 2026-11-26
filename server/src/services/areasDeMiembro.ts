import { Types } from "mongoose";
import { Project } from "../models/Project.js";
import { firmaDeAreas } from "../compartido/configDelEquipo.js";
import { registrarCambiosDelEquipo } from "./historialEquipo.js";
import { llevarAreasAlContratoQueRige } from "./areasDelContratoQueRige.js";

/**
 * EL ÁREA Y TURNO DE UNA PERSONA DEL EQUIPO, escritos de una sola manera.
 *
 * Lo que hacía el PATCH .../team-config/:userId/areas (la Jerarquía del panel), sacado a un servicio para que
 * el cambio de turno desde la app (Equipos, 26/11/2026) escriba exactamente lo mismo: la fila de `teamConfig`
 * por persona y con un solo update (30/10/2026), el rastro en `historial_equipo`, y el área/turno en el
 * contrato que rige (12/11/2026, `areasDelContratoQueRige`). Sin esto, el segundo camino terminaría con su
 * propia variante y el equipo y el contrato volverían a decir cosas distintas.
 *
 * `asignaciones` viene con ids en texto (lo que manda el cliente); acá se convierten. Devuelve si hubo cambio.
 */
export interface AsignacionDeArea {
  areaId: string;
  shiftIds: string[];
  sedeId?: number | null;
}

export async function asignarAreasDeMiembro(p: { tenantId: any; project: { _id: any; teamConfig?: any[] }; userId: string; asignaciones: AsignacionDeArea[]; porUserId?: string; origen: string; payload?: any }): Promise<{ cambio: boolean }> {
  const asignaciones = p.asignaciones.map((a) => ({
    areaId: new Types.ObjectId(a.areaId),
    shiftIds: a.shiftIds.map((s) => new Types.ObjectId(s)),
    ...(a.sedeId ? { sedeId: a.sedeId } : {}),
  }));

  const entrada: any = (p.project.teamConfig || []).find((c: any) => String(c.userId?._id ?? c.userId) === String(p.userId));
  const uid = new Types.ObjectId(p.userId);
  const marca = { updatedBy: p.porUserId && Types.ObjectId.isValid(p.porUserId) ? new Types.ObjectId(p.porUserId) : undefined, updatedAt: new Date() };
  /*
    POR PERSONA, CON UN UPDATE A LA BASE (30/10/2026): antes se guardaba el array entero del documento
    cargado, y un cambio de otro hecho en el medio se perdía. Los campos viejos (un área, un turno) siguen
    a la primera asignación: el parte del móvil los leía y anotaba a quien se movió en su área anterior.
  */
  const campos = { areaShiftAssignments: asignaciones, areaId: asignaciones[0]?.areaId ?? null, shiftId: asignaciones[0]?.shiftIds?.[0] ?? null, ...marca };
  const ponerEnLaFila = () => Project.updateOne({ _id: p.project._id }, { $set: Object.fromEntries(Object.entries(campos).map(([k, v]) => [`teamConfig.$[f].${k}`, v])) }, { arrayFilters: [{ "f.userId": uid }] });
  const cambio = firmaDeAreas(entrada?.areaShiftAssignments) !== firmaDeAreas(asignaciones);
  if (entrada) {
    if (cambio) await ponerEnLaFila();
  } else {
    // Alguien del equipo que todavía no tenía fila propia: se crea con los defaults del modelo, sin inventarle horario.
    const r = await Project.updateOne({ _id: p.project._id, "teamConfig.userId": { $ne: uid } }, { $push: { teamConfig: { userId: uid, canRegister: true, useProjectSchedule: true, ...campos } } });
    if (!r.modifiedCount) await ponerEnLaFila();
  }
  if (cambio || !entrada) {
    await registrarCambiosDelEquipo({ tenantId: p.tenantId, projectId: p.project._id, porUserId: p.porUserId, origen: p.origen, payload: p.payload, cambios: [{ userId: uid, campo: "areas", antes: JSON.parse(firmaDeAreas(entrada?.areaShiftAssignments)), despues: JSON.parse(firmaDeAreas(asignaciones)) }] });
  }
  // El equipo y el contrato que rige, iguales (también si ya estaban desparejos de antes).
  await llevarAreasAlContratoQueRige(p.project._id, new Map([[String(uid), asignaciones]]));
  return { cambio };
}
