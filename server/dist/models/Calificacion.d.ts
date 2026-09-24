import mongoose, { Types } from "mongoose";
/**
 * UNA CALIFICACIÓN DE UNA PERSONA: DE 1 A 5 ESTRELLAS, SIN EL 3.
 *
 * El 3 no se puede elegir a propósito: no se quieren calificaciones «del medio», hay que decidir si la
 * actuación fue buena (4, 5) o mala (1, 2). Al marcar 4 o 5 la tercera estrella aparece pintada, pero
 * lo que se guarda es el número elegido. La calificación DE LA PERSONA (0 a 5) es el promedio de todas
 * las suyas; 0 quiere decir que nadie la calificó todavía.
 *
 * Se guarda cada una por separado —nunca se pisa— con quién la puso, cuándo (día y hora exactos,
 * `createdAt`) y el comentario si lo dejó. `origen` dice desde dónde:
 *
 *  - `fin_contrato`: en «Por vencer» (móvil), al decidir Renovar o Dejar vencer. Es la ÚNICA que se
 *    pisa: hay UNA por contrato, (userProjectId, fechaBajaContrato), igual que `RenovacionContrato`.
 *    Si se califica, se abre la renovación y se cierra sin mandarla, el contrato vuelve a la lista;
 *    calificarlo otra vez corrige la anterior en vez de sumarle una segunda.
 *  - `equipos`: en Equipos (móvil), una calificación extra por una buena o mala actitud.
 *  - `usuarios`: en la lista de Usuarios del escritorio, en cualquier momento y por cualquier motivo.
 *  - `solicitud_renovacion`: en el escritorio, al revisar una solicitud de renovación.
 */
export declare const ESTRELLAS_VALIDAS: readonly [1, 2, 4, 5];
export declare const ORIGENES_CALIFICACION: readonly ["fin_contrato", "equipos", "usuarios", "solicitud_renovacion"];
export type OrigenCalificacion = (typeof ORIGENES_CALIFICACION)[number];
export interface ICalificacion {
    tenantId: Types.ObjectId;
    /** La persona calificada. */
    userId: Types.ObjectId;
    estrellas: number;
    comentario?: string;
    origen: OrigenCalificacion;
    projectId?: Types.ObjectId;
    /** Con `fechaBajaContrato`, el contrato calificado (sólo `fin_contrato`). */
    userProjectId?: Types.ObjectId;
    fechaBajaContrato?: string;
    /** Qué se decidió con ese contrato (sólo `fin_contrato`). */
    decision?: "renovar" | "dejar_vencer";
    /** La solicitud de renovación desde la que se calificó (sólo `solicitud_renovacion`). */
    solicitudId?: Types.ObjectId;
    calificadoPor: Types.ObjectId;
    calificadoPorNombre?: string;
    createdAt?: Date;
    updatedAt?: Date;
}
export declare const Calificacion: mongoose.Model<ICalificacion, {}, {}, {}, mongoose.Document<unknown, {}, ICalificacion, {}, {}> & ICalificacion & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>;
