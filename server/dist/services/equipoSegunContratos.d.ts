/**
 * EL ÁREA Y EL TURNO DE CADA MIEMBRO SE LEEN DEL CONTRATO QUE RIGE (12/11/2026).
 *
 * Pedido: «quiero que las pantallas del equipo lean directamente el contrato que rige»; que el equipo
 * dijera «Tarde» y el contrato «Mañana» confundía. `project.teamConfig` sigue guardando la fila de cada
 * persona (si puede registrar, su horario propio, quién la tocó), pero su ÁREA/TURNO/SEDE ya no se lee de
 * ahí: antes de que `teamConfig` salga del server o de que el server lo use para contar, se le superpone
 * lo que dice el contrato que rige de cada uno. Así todas las pantallas (Gestionar Equipo, Jerarquía,
 * Supervisores, la app, vacaciones, reportes de novedades) muestran lo mismo sin tocar cada una.
 *
 * Reglas:
 *   · Tiene contrato que rige con área → ésa, exacta (áreas, turnos y sede de cada fila).
 *   · El contrato sólo tiene los campos viejos (`areaId`/`shiftId`) → una fila con ésos.
 *   · El contrato que rige no tiene ninguna área cargada, o la persona no tiene contratos en el proyecto
 *     → queda lo que diga su fila del equipo (no se la manda a «sin área» por un contrato viejo incompleto).
 *   · Tiene contrato con área y no tenía fila → se le arma una, con los defaults del modelo.
 *
 * Qué contrato rige lo decide `getContratoActivo` / `contratosQueRigenDelProyecto` (vigentes; entre
 * ellos el de tiempo indeterminado; el más reciente). Cambia solo con el calendario: es lo pedido.
 */
/** Las filas de área del contrato, o `null` si no tiene ninguna cargada. */
export declare function areasDelContrato(contrato: any): any[] | null;
/** `teamConfig` con el área de cada persona tomada de su contrato que rige (`contratoDe`: userId → contrato). No modifica el original. */
export declare function superponerContratos(teamConfig: any[] | null | undefined, contratoDe: Map<string, any>): any[];
/** Lo mismo, buscando los contratos que rigen del proyecto. */
export declare function equipoSegunContratos(projectId: string, teamConfig: any[] | null | undefined): Promise<any[]>;
/** Para UNA persona con sus contratos del proyecto a mano (la ficha del usuario). */
export declare function filaSegunContratos(fila: any, contratos: any[] | null | undefined): any;
