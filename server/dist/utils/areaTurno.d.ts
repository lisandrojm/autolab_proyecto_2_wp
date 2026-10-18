/**
 * ÁREA Y TURNO DE UN MIEMBRO EN UN PROYECTO, con la misma precedencia que usa la UI: lo que diga
 * `project.teamConfig` para esa persona y, si ahí no hay nada, las asignaciones de su contrato que
 * rige. Lo usan la Jerarquía, los conteos por área/turno y el plan de vacaciones por proyecto.
 */
/** Claves "areaId::shiftId" de un miembro, una por combinación (aunque la tenga repetida). */
export declare function claveAreaTurnoDelMiembro(assignments: any[]): Set<string>;
/** Las asignaciones que valen para el miembro: `teamConfig` primero, el contrato después. */
export declare function asignacionesDelMiembro(configDelMiembro: any, contrato: any): any[];
/** Separa una clave "areaId::shiftId". */
export declare function partirClave(clave: string): {
    areaId: string;
    shiftId: string;
};
