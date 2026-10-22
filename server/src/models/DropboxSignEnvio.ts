import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * UN DOCUMENTO ENVIADO (o intentado) A LA FIRMA POR EL BOT de Dropbox Sign, por su código
 * («ID-000123», ver `utils/anclasNombre.ts`). Es la garantía de NO DUPLICAR JAMÁS: antes de enviar
 * un archivo se consulta acá y, si ya figura `enviado`, se saltea. Hace falta aunque el circuito IMAP
 * mueva los enviados de Outbox a Pendbox a los ~2 minutos: cubre esa ventana y los reintentos.
 */
export type EstadoEnvio = "enviado" | "error" | "limite" | "requiere_revision";

export interface IDropboxSignEnvio extends Document {
  tenantId: Types.ObjectId;
  codigo: string;
  archivo: string;
  email: string;
  firmante: string;
  tipo: string;
  estado: EstadoEnvio;
  detalle: string;
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
    estado: { type: String, enum: ["enviado", "error", "limite", "requiere_revision"], required: true },
    detalle: { type: String, default: "" },
    enviadoAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "dropbox_sign_envios" },
);

// Un código, un registro por tenant: es lo que impide enviar dos veces el mismo documento.
schema.index({ tenantId: 1, codigo: 1 }, { unique: true });

export const DropboxSignEnvio: Model<IDropboxSignEnvio> = mongoose.model<IDropboxSignEnvio>("DropboxSignEnvio", schema);
