import { Types } from "mongoose";
export declare const NOVEDAD_REGISTRO = "registro_nuevo";
export declare const NOVEDAD_SOLICITUD = "solicitud_nueva";
export declare const NOVEDAD_SOLICITUD_APROBADA = "solicitud_aprobada";
export declare const NOVEDAD_SOLICITUD_RECHAZADA = "solicitud_rechazada";
/** Los tipos que la app cuenta por tarjeta. Agregar uno acá sin tocar la app lo deja sin contar. */
export declare const TIPOS_NOVEDAD: string[];
interface Aviso {
    tenantId: Types.ObjectId | string;
    /** A quiénes. Se limpian los repetidos y los inválidos. */
    destinatarios: (string | Types.ObjectId | undefined | null)[];
    type: string;
    title: string;
    message: string;
    /** Qué pantalla de la app abre. La app traduce `type`; esto es para el escritorio. */
    linkUrl?: string;
    /** De qué habla: la persona registrada, la solicitud. Es lo que permite marcar leída UNA fila. */
    refId?: string | Types.ObjectId | null;
    /** Quien hizo la acción: no se avisa a sí mismo lo que acaba de hacer. */
    excepto?: string | Types.ObjectId | null;
}
/** Manda el aviso a cada destinatario. No lanza: un aviso perdido no puede tumbar la operación. */
export declare function notificar({ tenantId, destinatarios, type, title, message, linkUrl, refId, excepto }: Aviso): Promise<void>;
/**
 * QUIÉN ES EL COORDINADOR DEL PROYECTO (el responsable) de cada proyecto, como `_id` de usuario.
 *
 * `Project.metadata.responsableId` NO es un ObjectId: es el id numérico de FRAME, que se corresponde
 * con `User.metadata.id` (ver `utils/visibilidadResponsable.ts`). Sin ese paso intermedio, un `$in`
 * por `_id` no matchea a nadie y el aviso no le llega a quien tiene que aprobar.
 */
export declare function responsablesDeProyectos(tenantId: Types.ObjectId | string, projectIds: (string | Types.ObjectId)[]): Promise<string[]>;
/**
 * Los responsables de los proyectos donde esta persona supervisa un área o turno.
 *
 * Es el mismo criterio con el que la app decide de quiénes ve los registrados (`invitadoresVisibles`
 * en `routes/registroLinks.ts`), leído al revés: si el coordinador del proyecto ve los registros de
 * su gente, también le corresponde el aviso.
 */
export declare function responsablesDeQuienSupervisa(tenantId: Types.ObjectId | string, userId: string): Promise<string[]>;
/** Cómo se llama alguien, con los tres lugares donde puede estar el nombre. */
export declare const nombreDePersona: (u: any) => string;
export {};
