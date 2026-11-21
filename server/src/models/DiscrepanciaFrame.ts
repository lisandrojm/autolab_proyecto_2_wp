import mongoose, { Schema, Model, Types } from "mongoose";

/**
 * UN CONTRATO QUE FRAME MANDA DISTINTO DE COMO ESTÁ EN WEPRODU (18/11/2026; ver `utils/additiveSync.ts`).
 *
 * El import reconoce el contrato (mismo proyecto, persona, alta y tipo) pero FRAME trae otra categoría u
 * otra fecha de baja (`id` = la fecha, o null sin baja). No se crea un contrato nuevo ni se pisa nada de WeProdu: queda acá, una fila por (contrato, campo, valor
 * de FRAME), con cuándo se vio por primera y última vez. Se identifica por `contratoKey`, nunca por
 * posición. Lo resuelve una persona (o la alerta de la etapa 5 cuando exista).
 */
export interface IDiscrepanciaFrame {
  tenantId: Types.ObjectId | null;
  userProjectId: Types.ObjectId;
  userId: Types.ObjectId | null;
  contratoKey: Types.ObjectId | null;
  /** La posición al detectarla: sólo para leer, la identidad es la clave. */
  posicion: number;
  campo: "categoria_sat_id" | "fecha_baja_contrato";
  weprodu: { id: unknown; nombre: string };
  frame: { id: unknown; nombre: string };
  claveFrame: string;
  detectadaEl: Date;
  ultimaVezEl: Date;
  veces: number;
  resuelta: boolean;
  resueltaEl?: Date | null;
  resueltaPor?: string;
  resolucion?: string;
}

const schema = new Schema<IDiscrepanciaFrame>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", default: null },
    userProjectId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    contratoKey: { type: Schema.Types.ObjectId, default: null },
    posicion: { type: Number, required: true },
    campo: { type: String, enum: ["categoria_sat_id", "fecha_baja_contrato"], required: true },
    weprodu: { id: Schema.Types.Mixed, nombre: String },
    frame: { id: Schema.Types.Mixed, nombre: String },
    claveFrame: { type: String, default: "" },
    detectadaEl: { type: Date, required: true },
    ultimaVezEl: { type: Date, required: true },
    veces: { type: Number, default: 1 },
    resuelta: { type: Boolean, default: false },
    resueltaEl: { type: Date, default: null },
    resueltaPor: String,
    resolucion: String,
  },
  { timestamps: true, collection: "discrepancias_frame", minimize: false },
);

schema.index({ userProjectId: 1, contratoKey: 1, campo: 1, "frame.id": 1 }, { unique: true });
schema.index({ resuelta: 1, ultimaVezEl: -1 });
schema.index({ contratoKey: 1 });

export const DiscrepanciaFrame: Model<IDiscrepanciaFrame> = mongoose.models.DiscrepanciaFrame || mongoose.model<IDiscrepanciaFrame>("DiscrepanciaFrame", schema);
export default DiscrepanciaFrame;
