import mongoose, { Schema, Types } from "mongoose";

/**
 * AUDITORÍA DE CONTRATOS (etapa 3, 19/11/2026). Un evento por contrato y por escritura: se creó, cambió
 * (campo por campo, antes y después), se anuló o se quitó. Indexada por `contratoKey`, nunca por
 * posición (la posición se guarda sólo para leer). Se escribe sola desde los hooks de `UserProject` y
 * desde el helper de los scripts (`services/auditoriaContratos.ts`); se lee en la app, donde se ve el
 * contrato. Es registro: nada la edita ni la borra.
 */
export interface IAuditoriaContrato {
  contratoKey: Types.ObjectId | null;
  userProjectId: Types.ObjectId;
  projectId: Types.ObjectId | null;
  userId: Types.ObjectId | null;
  posicion: number;
  tipo: "creado" | "modificado" | "anulado" | "quitado";
  cambios: { campo: string; antes: unknown; despues: unknown }[];
  resumen: { nombre_contrato?: string; fecha_alta_contrato?: string; fecha_baja_contrato?: string };
  motivo?: string;
  nota?: string;
  el: Date;
  origen: "app" | "script" | "sistema";
  por?: { userId?: string; email?: string };
  detalle?: string;
  /** Cómo se escribió: save, updateOne, updateMany, findOneAndUpdate, deleteMany, crudo… */
  operacion: string;
}

const schema = new Schema<IAuditoriaContrato>(
  {
    contratoKey: { type: Schema.Types.ObjectId, default: null },
    userProjectId: { type: Schema.Types.ObjectId, required: true },
    projectId: { type: Schema.Types.ObjectId, default: null },
    userId: { type: Schema.Types.ObjectId, default: null },
    posicion: { type: Number, required: true },
    tipo: { type: String, enum: ["creado", "modificado", "anulado", "quitado"], required: true },
    cambios: [{ _id: false, campo: String, antes: Schema.Types.Mixed, despues: Schema.Types.Mixed }],
    resumen: { nombre_contrato: String, fecha_alta_contrato: String, fecha_baja_contrato: String },
    motivo: String,
    nota: String,
    el: { type: Date, required: true },
    origen: { type: String, enum: ["app", "script", "sistema"], required: true },
    por: { userId: String, email: String },
    detalle: String,
    operacion: { type: String, required: true },
  },
  { collection: "auditoria_contratos", versionKey: false },
);

schema.index({ contratoKey: 1, el: -1 });
schema.index({ userProjectId: 1, el: -1 });
schema.index({ el: -1 });

export const AuditoriaContrato = (mongoose.models.AuditoriaContrato as mongoose.Model<IAuditoriaContrato>) || mongoose.model<IAuditoriaContrato>("AuditoriaContrato", schema);
