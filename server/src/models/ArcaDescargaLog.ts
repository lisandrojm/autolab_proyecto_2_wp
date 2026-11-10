import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * CADA CORRIDA DE DESCARGA DE CONSTANCIAS de una empleadora (11/11/2026): la encadenada a una
 * presentación, el barrido diario o una pedida a mano. Es el historial de «A.R.C.A Descargas Automáticas»
 * y la métrica del encadenamiento: cuántas constancias salieron de ALTA (la relación seguía activa) y
 * cuántas de BAJA (ARCA la emite así cuando la jornada ya terminó, que es el caso que se quiere evitar).
 *
 * El estado de cada constancia sigue en `constancias_arca`; esto es el registro de la corrida. Va en su
 * colección y no en el tenant: el tenant se lee en cada pedido y esto crece.
 */
export interface IArcaDescargaLog extends Document {
  tenantId: Types.ObjectId;
  origen: "encadenada" | "barrido" | "manual";
  empresaId?: Types.ObjectId | null;
  empresaRazonSocial: string;
  arrancadaEl: Date;
  terminadaEl: Date;
  /** Sólo la encadenada: la presentación de la que salió. */
  presentacion?: { terminadaEl: Date; logId?: Types.ObjectId | null; automatica: boolean } | null;
  pedidas: number;
  listas: number;
  deAlta: number;
  deBaja: number;
  items: Array<{ cuil: string; nombre: string; estado: string; detalle?: string; tipoConstancia?: "alta" | "baja" | null }>;
  error?: string | null;
  createdAt: Date;
}

const schema = new Schema<IArcaDescargaLog>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    origen: { type: String, required: true },
    empresaId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    empresaRazonSocial: { type: String, default: "" },
    arrancadaEl: { type: Date, required: true },
    terminadaEl: { type: Date, required: true },
    presentacion: { type: new Schema({ terminadaEl: Date, logId: { type: Schema.Types.ObjectId, default: null }, automatica: Boolean }, { _id: false }), default: null },
    pedidas: { type: Number, default: 0 },
    listas: { type: Number, default: 0 },
    deAlta: { type: Number, default: 0 },
    deBaja: { type: Number, default: 0 },
    items: [{ _id: false, cuil: String, nombre: String, estado: String, detalle: String, tipoConstancia: { type: String, default: null } }],
    error: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "arca_descargas_logs" },
);

schema.index({ tenantId: 1, arrancadaEl: -1 });

export const ArcaDescargaLog: Model<IArcaDescargaLog> = mongoose.model<IArcaDescargaLog>("ArcaDescargaLog", schema);
