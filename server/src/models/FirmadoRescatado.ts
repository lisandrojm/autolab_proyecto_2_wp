import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * EL REGISTRO DE LOS FIRMADOS RESCATADOS DESDE EL EMAIL (pedido del 23/10/2026): un documento por
 * PDF firmado que la integración Dropbox Sign → Dropbox NO depositó en «Requested signatures» y que la
 * lectura de la casilla subió desde el adjunto del aviso. Es la prueba de qué entró por ese camino y
 * cuándo. No depende del historial de lecturas (que se recorta a 30 corridas) y nunca se borra desde
 * la aplicación.
 *
 * Único por tenant y nombre de archivo subido: si el mismo documento se rescatara otra vez (porque
 * alguien borró el archivo de la carpeta), se actualiza la fila, no se duplica.
 */
export interface IFirmadoRescatado extends Document {
  tenantId: Types.ObjectId;
  /** «ID-NNNNNN» del documento. */
  codigo: string;
  /** El nombre con el que se subió. */
  archivo: string;
  /** Ruta en Dropbox. */
  path: string;
  carpeta: string;
  /** El título según el asunto del aviso. */
  titulo: string;
  asunto: string;
  /** Quién firmó, según el asunto («ALAN AQUINO firmó …»). */
  firmante: string;
  cuit: string;
  /** UID del mensaje en la casilla. */
  uid: number | null;
  bytes: number;
  rescatadoEl: Date;
  /** Cuántas veces se rescató (normalmente 1). */
  veces: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IFirmadoRescatado>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    codigo: { type: String, default: "" },
    archivo: { type: String, required: true },
    path: { type: String, default: "" },
    carpeta: { type: String, default: "" },
    titulo: { type: String, default: "" },
    asunto: { type: String, default: "" },
    firmante: { type: String, default: "" },
    cuit: { type: String, default: "" },
    uid: { type: Number, default: null },
    bytes: { type: Number, default: 0 },
    rescatadoEl: { type: Date, required: true },
    veces: { type: Number, default: 1 },
  },
  { timestamps: true, collection: "dropbox_sign_firmados_rescatados" },
);

schema.index({ tenantId: 1, archivo: 1 }, { unique: true });
schema.index({ tenantId: 1, rescatadoEl: -1 });
schema.index({ tenantId: 1, codigo: 1 });

export const FirmadoRescatado: Model<IFirmadoRescatado> = mongoose.model<IFirmadoRescatado>("FirmadoRescatado", schema);
