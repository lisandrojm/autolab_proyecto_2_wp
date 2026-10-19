import { clavesDelMiembro, partirClaveAreaTurno, type ContextoDeSede } from "../compartido/areaTurno.js";

/**
 * ÁREA Y TURNO DE UN MIEMBRO EN UN PROYECTO, con la misma precedencia que usa la UI: lo que diga
 * `project.teamConfig` para esa persona y, si ahí no hay nada, las asignaciones de su contrato que
 * rige. Lo usan la Jerarquía, los conteos por área/turno y el plan de vacaciones por proyecto.
 *
 * La clave y la regla de la sede viven en `compartido/areaTurno.ts` (área × turno × sede, 18/10/2026).
 */

/**
 * Claves de un miembro, una por combinación. Sin `ctx`: "areaId::shiftId" como siempre (más la sede si
 * la asignación la trae). Con `ctx` (el `areasConfig` y la sede principal del proyecto): cada
 * combinación lleva la fila donde está la persona; las que «faltan elegir sede» no dan clave.
 */
export function claveAreaTurnoDelMiembro(assignments: any[], ctx?: ContextoDeSede): Set<string> {
  return clavesDelMiembro(assignments, ctx);
}

/** Las asignaciones que valen para el miembro: `teamConfig` primero, el contrato después. */
export function asignacionesDelMiembro(configDelMiembro: any, contrato: any): any[] {
  const deConfig: any[] = configDelMiembro?.areaShiftAssignments || [];
  if (deConfig.length > 0) return deConfig;
  return contrato?.areaShiftAssignments || [];
}

/** Separa una clave "areaId::shiftId[::s<sede>]". */
export function partirClave(clave: string): { areaId: string; shiftId: string; sedeId: number | null } {
  return partirClaveAreaTurno(clave);
}
