/**
 * EL REGISTRO DE CADA SOLICITUD DE CONTRATACIÓN EN DROPBOX (05/11/2026).
 *
 * Una solicitud es un `User` con `metadata.isSolicitud`: vive en la base y no dejaba ningún archivo,
 * así que no había dónde ir a verla. Ahora cada una deja un `.json` en la carpeta del estado «Solicitud
 * pendiente» (propósito `solicitudes`; por defecto `/WEPRODU/Solicitudes`), como
 * `espejoDropboxRegistros.ts`. Es LA FOTO DE LO PEDIDO: se reescribe cada vez que se edita la solicitud
 * (`modificadaEl` dice cuándo). Si después se aprueba o se rechaza, el estado vigente sigue siendo el de
 * la base.
 *
 * NUNCA FRENA LA SOLICITUD: se sube en segundo plano y un error de Dropbox sólo se loguea. Tampoco
 * guarda la contraseña provisoria: el contenido sale de una lista de campos, no del documento entero.
 */
/** El nombre del archivo: fecha, persona e id (el id lo hace único aunque se repita la persona). */
export declare function nombreArchivoSolicitud(o: {
    creadaEl: Date | string;
    nombre: string;
    id: string;
}): string;
/** Lo que se guarda de la solicitud: lo pedido, sin credenciales. */
export declare function contenidoDeSolicitud(s: any, creador?: {
    id: string;
    nombre: string;
} | null, estado?: string): Record<string, unknown>;
/** Sube el registro en segundo plano. No devuelve nada que haya que esperar y no tira nunca. */
export declare function guardarSolicitudEnDropbox(o: {
    tenantId: string;
    solicitud: any;
    creador?: {
        id: string;
        nombre: string;
    } | null;
    nombreAnterior?: string;
}): void;
