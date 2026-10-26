import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Registro de cada CORRIDA del bot de envío a la firma (patrón `ArcaAltasLog`): qué documentos
 * intentó, con qué resultado, y si frenó por el límite antiabuso. Se borra solo a los 30 días (TTL).
 * `capturaError` es la captura de pantalla del paso que falló, como PNG en base64, sólo cuando hubo
 * fallo: sirve para entender qué cambió en la pantalla sin volver a correr nada.
 */
export interface ILineaEnvio {
  archivo: string;
  codigo: string;
  email: string;
  estado: "enviado" | "error" | "limite" | "requiere_revision" | "seco" | "salteado";
  detalle?: string;
}

export interface IDropboxSignEnvioLog extends Document {
  tenantId: Types.ObjectId;
  inicio: Date;
  fin?: Date | null;
  /** `ok` | `limite` | `fallo` | `detenida` | `sin_tanda` */
  resultado: string;
  enviados: number;
  errores: number;
  limite: boolean;
  enSeco: boolean;
  automatica: boolean;
  lineas: ILineaEnvio[];
  error?: string;
  /** El código del fallo, si lo tiene: login_requiere_2fa, login_clave_incorrecta, login_sin_avance… (26/10/2026). */
  codigoError?: string;
  capturaError?: string;
  createdAt: Date;
}

const schema = new Schema<IDropboxSignEnvioLog>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    inicio: { type: Date, required: true },
    fin: { type: Date, default: null },
    resultado: { type: String, default: "" },
    enviados: { type: Number, default: 0 },
    errores: { type: Number, default: 0 },
    limite: { type: Boolean, default: false },
    enSeco: { type: Boolean, default: false },
    automatica: { type: Boolean, default: false },
    lineas: {
      type: [new Schema<ILineaEnvio>({ archivo: String, codigo: String, email: String, estado: String, detalle: String }, { _id: false })],
      default: [],
    },
    error: { type: String },
    codigoError: { type: String },
    capturaError: { type: String },
    // TTL: 30 días.
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
  },
  { collection: "dropbox_sign_envio_logs" },
);

schema.index({ tenantId: 1, createdAt: -1 });

export const DropboxSignEnvioLog: Model<IDropboxSignEnvioLog> = mongoose.model<IDropboxSignEnvioLog>("DropboxSignEnvioLog", schema);
