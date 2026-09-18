/**
 * Saca UN contrato de una asignación. Si la persona queda sin contratos en el proyecto, se borra la
 * asignación y sus referencias (equipo, coordinación, ficha), como si nunca hubiera estado.
 *
 * Es lo mismo que hace el borrado de un contrato desde el panel; vive acá para que borrar una
 * solicitud aprobada deje la base exactamente igual que borrar su contrato a mano.
 */
export declare function quitarContrato(up: any, idx: number): Promise<void>;
/**
 * Cuál de los contratos candidatos es el de la solicitud (ver los criterios abajo). Sin base de datos
 * de por medio, para poder probarlo: equivocarse acá es borrar el contrato de otra contratación.
 */
export declare function elegirContratoDeSolicitud<T extends {
    c: any;
}>(todos: T[], params: {
    solicitudId: string;
    startDate?: unknown;
    dueDate?: unknown;
}): T | null;
/**
 * EL CONTRATO QUE CREÓ UNA SOLICITUD AL APROBARSE, para borrarlo junto con ella.
 *
 * Se busca en la persona que recibió el contrato y en los proyectos que pidió la solicitud:
 *   1. por `solicitudId`, que la aprobación deja anotado en el contrato — es exacto;
 *   2. si no hay (contratos aprobados antes de ese campo), por las fechas que pidió la solicitud:
 *      primero alta y baja, después sólo el alta. Cada criterio vale SOLO si da un único contrato
 *      que no pertenezca a otra solicitud: si hay dos iguales, no se adivina cuál borrar.
 *
 * Si no aparece —p. ej. porque al aprobar se cambiaron las fechas— no se borra nada y se dice.
 */
export declare function borrarContratoDeSolicitud(params: {
    solicitudId: string;
    personaId: string;
    projectIds: unknown[];
    startDate?: unknown;
    dueDate?: unknown;
}): Promise<{
    borrado: boolean;
    proyecto?: string;
    desde?: string;
    hasta?: string;
}>;
