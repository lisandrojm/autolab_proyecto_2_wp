import { clavesDelMiembro, partirClaveAreaTurno } from "../compartido/areaTurno.js";
/**
 * ÁREA Y TURNO DE UN MIEMBRO EN UN PROYECTO, con la misma precedencia que usa la UI: lo que diga
 * `project.teamConfig` para esa persona y, si ahí no hay nada, las asignaciones de su contrato que
 * rige. Lo usan la Jerarquía, los conteos por área/turno y el plan de vacaciones por proyecto.
 *
 * La clave y la regla de la sede viven en `compartido/areaTurno.ts` (área × turno × sede, 18/10/2026).
 */
/**
 * Claves de un miembro, una por combinación. Sin `ctx`: "areaId::shiftId" como siempre (más la sede si
 * la asignación la trae). Con `ctx` (el `areasConfig` del proyecto y la sede del contrato): cada
 * combinación lleva la sede de la fila donde cae la persona.
 */
export function claveAreaTurnoDelMiembro(assignments, ctx) {
    return clavesDelMiembro(assignments, ctx);
}
/** Las asignaciones que valen para el miembro: `teamConfig` primero, el contrato después. */
export function asignacionesDelMiembro(configDelMiembro, contrato) {
    const deConfig = configDelMiembro?.areaShiftAssignments || [];
    if (deConfig.length > 0)
        return deConfig;
    return contrato?.areaShiftAssignments || [];
}
/** Separa una clave "areaId::shiftId[::s<sede>]". */
export function partirClave(clave) {
    return partirClaveAreaTurno(clave);
}
