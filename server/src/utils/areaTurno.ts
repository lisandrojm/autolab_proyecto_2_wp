/**
 * ÁREA Y TURNO DE UN MIEMBRO EN UN PROYECTO, con la misma precedencia que usa la UI: lo que diga
 * `project.teamConfig` para esa persona y, si ahí no hay nada, las asignaciones de su contrato que
 * rige. Lo usan la Jerarquía, los conteos por área/turno y el plan de vacaciones por proyecto.
 */

/** Claves "areaId::shiftId" de un miembro, una por combinación (aunque la tenga repetida). */
export function claveAreaTurnoDelMiembro(assignments: any[]): Set<string> {
  const keys = new Set<string>();
  for (const asa of assignments || []) {
    const areaId = asa?.areaId?._id || asa?.areaId;
    if (!areaId) continue;
    for (const sid of asa?.shiftIds || []) {
      const shiftId = sid?._id || sid;
      if (shiftId) keys.add(`${areaId}::${shiftId}`);
    }
  }
  return keys;
}

/** Las asignaciones que valen para el miembro: `teamConfig` primero, el contrato después. */
export function asignacionesDelMiembro(configDelMiembro: any, contrato: any): any[] {
  const deConfig: any[] = configDelMiembro?.areaShiftAssignments || [];
  if (deConfig.length > 0) return deConfig;
  return contrato?.areaShiftAssignments || [];
}

/** Separa una clave "areaId::shiftId". */
export function partirClave(clave: string): { areaId: string; shiftId: string } {
  const [areaId, shiftId] = clave.split("::");
  return { areaId: areaId || "", shiftId: shiftId || "" };
}
