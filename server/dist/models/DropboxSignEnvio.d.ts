import { Document, Model, Types } from "mongoose";
/**
 * UN DOCUMENTO EN EL CIRCUITO DEL BOT de Dropbox Sign, por su código («ID-000123», ver
 * `utils/anclasNombre.ts`). Es la COLA y la garantía de NO DUPLICAR JAMÁS:
 *
 *   en_cola            → lo encolaron desde «Para Firmar»; el bot lo toma por `orden`.
 *   limite             → Dropbox Sign frenó al intentarlo; sigue en la cola y se reintenta pasado el enfriamiento.
 *   enviado            → salió; nunca más se encola.
 *   error              → falló; se puede volver a encolar.
 *   requiere_revision  → no cumple una regla (tipo sin colocación, sin firmante…); se puede volver a encolar cuando se arregle.
 *
 * Hace falta aunque el circuito IMAP mueva los enviados de Outbox a Pendbox a los ~2 minutos: cubre esa
 * ventana y los reintentos.
 */
export type EstadoEnvio = "en_cola" | "enviado" | "error" | "limite" | "requiere_revision";
/**
 * Lo que dio la última DETECCIÓN del ancla de la firma sobre este archivo (previsualización, «Verificar
 * todos» o la corrida): es el ✓/✗ que ven la cola y el tab sin volver a bajar el PDF.
 */
export interface ResumenColocacion {
    verificadaAt: Date;
    ok: boolean;
    /** Página (base 1) donde quedó o se buscó. */
    pagina: number | null;
    /** El rótulo que se tomó de ancla. */
    rotulo: string;
    fuente: "texto" | "ocr" | "";
    motivo: string;
    /** El campo (puntos PDF, y desde arriba). */
    campo: {
        x: number;
        y: number;
        w: number;
        h: number;
    } | null;
    descartados: number;
}
export interface IDropboxSignEnvio extends Document {
    tenantId: Types.ObjectId;
    codigo: string;
    archivo: string;
    email: string;
    firmante: string;
    tipo: string;
    estado: EstadoEnvio;
    detalle: string;
    /** Posición en la cola (creciente al encolar). */
    orden?: number | null;
    encoladoAt?: Date | null;
    encoladoPor?: Types.ObjectId | null;
    /** La última corrida en seco lo recorrió entero y quedó listo para enviar. */
    probadoEnSecoAt?: Date | null;
    enviadoAt?: Date | null;
    colocacion?: ResumenColocacion | null;
    createdAt: Date;
    updatedAt: Date;
}
export declare const DropboxSignEnvio: Model<IDropboxSignEnvio>;
