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
/** Dónde buscar el contrato de una solicitud: quién lo recibió y qué se pidió. */
export interface DatosDeSolicitud {
    solicitudId: string;
    personaId: string;
    projectIds: unknown[];
    startDate?: unknown;
    dueDate?: unknown;
}
/**
 * Los datos de búsqueda a partir del documento de la solicitud (con `_id` y `metadata`).
 *
 * El contrato va en la PERSONA: si la solicitud apunta a alguien que ya existía (`solicitudUserId`),
 * es esa; si no, al aprobarla la solicitud se convirtió en la persona misma.
 */
export declare function datosDeSolicitud(solicitud: any): DatosDeSolicitud;
/**
 * EL CONTRATO QUE CREÓ UNA SOLICITUD AL APROBARSE: para editarlo desde la solicitud o borrarlo con ella.
 *
 * Se busca en la persona que recibió el contrato y en los proyectos que pidió la solicitud:
 *   1. por `solicitudId`, que la aprobación deja anotado en el contrato — es exacto;
 *   2. si no hay (contratos aprobados antes de ese campo), por las fechas que pidió la solicitud:
 *      primero alta y baja, después sólo el alta. Cada criterio vale SOLO si da un único contrato
 *      que no pertenezca a otra solicitud: si hay dos iguales, no se adivina cuál es.
 *
 * `null` si no aparece —p. ej. porque al aprobar se cambiaron las fechas—.
 */
export declare function buscarContratoDeSolicitud(params: DatosDeSolicitud): Promise<{
    up: any;
    c: any;
    idx: number;
} | null>;
/** Borra el contrato de la solicitud, si aparece. Si no, no toca nada y lo dice. */
export declare function borrarContratoDeSolicitud(params: DatosDeSolicitud): Promise<{
    borrado: boolean;
    proyecto?: string;
    desde?: string;
    hasta?: string;
}>;
