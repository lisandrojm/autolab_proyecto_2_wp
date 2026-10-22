import mongoose, { Schema, Document, Model, Types } from "mongoose";

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
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IDropboxSignEnvio>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    codigo: { type: String, required: true },
    archivo: { type: String, default: "" },
    email: { type: String, default: "" },
    firmante: { type: String, default: "" },
    tipo: { type: String, default: "" },
    estado: { type: String, enum: ["en_cola", "enviado", "error", "limite", "requiere_revision"], required: true },
    detalle: { type: String, default: "" },
    orden: { type: Number, default: null },
    encoladoAt: { type: Date, default: null },
    encoladoPor: { type: Schema.Types.ObjectId, ref: "User", default: null },
    probadoEnSecoAt: { type: Date, default: null },
    enviadoAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "dropbox_sign_envios" },
);

// Un código, un registro por tenant: es lo que impide enviar dos veces el mismo documento.
schema.index({ tenantId: 1, codigo: 1 }, { unique: true });
schema.index({ tenantId: 1, estado: 1, orden: 1 });

export const DropboxSignEnvio: Model<IDropboxSignEnvio> = mongoose.model<IDropboxSignEnvio>("DropboxSignEnvio", schema);
