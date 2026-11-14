/**
 * EL ÁREA Y EL TURNO DE CADA MIEMBRO SE LEEN DE SUS CONTRATOS VIGENTES (12/11/2026, 14/11/2026).
 *
 * Pedido del 12/11: «quiero que las pantallas del equipo lean directamente el contrato que rige»; que el
 * equipo dijera «Tarde» y el contrato «Mañana» confundía. `project.teamConfig` sigue guardando la fila de
 * cada persona (si puede registrar, su horario propio, quién la tocó), pero su ÁREA/TURNO/SEDE ya no se lee
 * de ahí: antes de que `teamConfig` salga del server o de que el server lo use para contar, se le superpone
 * lo que dicen los contratos de cada uno. Así todas las pantallas (Gestionar Equipo, Jerarquía,
 * Supervisores, la app, vacaciones, reportes de novedades) muestran lo mismo sin tocar cada una.
 *
 * VARIOS CONTRATOS VIGENTES A LA VEZ SE SUMAN (14/11/2026). Con «el que rige» solo, a quien le sumaban un
 * segundo contrato en otro turno —un plazo fijo a la Mañana y un Servicios Adicional a la Tarde— desaparecía
 * del primero: regía el último cargado. Son contratos distintos y la persona trabaja en los dos turnos, así
 * que su área/turno es la UNIÓN de todos los que están vigentes hoy en el proyecto. Con un solo vigente (o
 * ninguno) no cambia nada: es el que rige, como antes. Medido en producción el 14/11: 22 personas tienen dos
 * vigentes en el mismo proyecto y sólo a una le difiere el turno.
 *
 * Reglas:
 *   · Tiene contrato que rige con área → ésa, exacta (áreas, turnos y sede de cada fila).
 *   · Tiene más de un contrato vigente → las de todos, una fila por área + sede con los turnos de todos; las
 *     del que rige van primero (los campos viejos `areaId`/`shiftId` siguen a la primera).
 *   · El contrato sólo tiene los campos viejos (`areaId`/`shiftId`) → una fila con ésos.
 *   · Ningún contrato de los que cuentan tiene área cargada, o la persona no tiene contratos en el proyecto
 *     → queda lo que diga su fila del equipo (no se la manda a «sin área» por un contrato viejo incompleto).
 *   · Tiene contrato con área y no tenía fila → se le arma una, con los defaults del modelo.
 *
 * Qué contrato rige lo decide `getContratoActivo` / `contratosQueRigenDelProyecto` (vigentes; entre
 * ellos el de tiempo indeterminado; el más reciente). Cambia solo con el calendario: es lo pedido.
 */
/** Las filas de área de UN contrato (las de `areaShiftAssignments`, o una armada con los campos viejos). [] si no tiene. */
export declare function filasDeArea(contrato: any): any[];
/**
 * Junta las filas de varios contratos: una fila por área + sede, con los turnos de todos sin repetir. El
 * orden es el de llegada (primero las del primer contrato). Una fila que no se mezcla con otra sale tal cual.
 */
export declare function unirAreas(listas: any[][]): any[];
/**
 * Los contratos vigentes a la vez que viajan con el que rige (`_vigentes`, ver `contratosQueRigenDelProyecto`),
 * con el que rige primero. `null` si hay uno solo o ninguno: ahí vale el que rige y nada más.
 */
export declare function vigentesALaVez(contrato: any): any[] | null;
/**
 * Las filas de área que le corresponden a la persona según el contrato que rige y, si hay más de uno vigente,
 * todos ellos. `null` si ninguno tiene área cargada.
 */
export declare function areasDelContrato(contrato: any): any[] | null;
/** `teamConfig` con el área de cada persona tomada de sus contratos (`contratoDe`: userId → contrato que rige). No modifica el original. */
export declare function superponerContratos(teamConfig: any[] | null | undefined, contratoDe: Map<string, any>): any[];
/** Lo mismo, buscando los contratos que rigen del proyecto. */
export declare function equipoSegunContratos(projectId: string, teamConfig: any[] | null | undefined): Promise<any[]>;
/** Para UNA persona con sus contratos del proyecto a mano (la ficha del usuario): la misma regla, sin ir a la base. */
export declare function filaSegunContratos(fila: any, contratos: any[] | null | undefined, hoy?: string): any;
/**
 * AL CAMBIAR EL ÁREA DESDE EL EQUIPO, QUÉ LE QUEDA A CADA CONTRATO VIGENTE (14/11/2026).
 *
 * Con un solo contrato la respuesta es obvia: lo nuevo, entero. Con varios vigentes el equipo muestra la
 * suma de todos, así que lo que se guarda desde ahí (arrastrar en la Jerarquía, la tabla, «Pasar todos a…»)
 * es esa suma ya cambiada, y hay que devolverla a los contratos sin mezclarlos:
 *
 *   · cada contrato CONSERVA las combinaciones área × turno que tenía y siguen estando (con la sede nueva,
 *     si lo que cambió fue la sede);
 *   · lo que es NUEVO —no lo tenía ninguno— va al contrato que rige;
 *   · un contrato que se queda sin nada de lo que tenía pasa a decir lo mismo que el que rige: no se deja un
 *     contrato vigente «sin área», y si conservara lo viejo la persona seguiría apareciendo ahí;
 *   · un contrato que no tenía área cargada se deja como está.
 *
 * La unión del resultado es siempre exactamente `nuevas`. `vigentes` son las filas de área de cada contrato
 * y `iRige` la posición del que rige; devuelve las filas nuevas de cada uno, en el mismo orden.
 */
export declare function repartirAreas(nuevas: any[], vigentes: any[][], iRige: number): any[][];
