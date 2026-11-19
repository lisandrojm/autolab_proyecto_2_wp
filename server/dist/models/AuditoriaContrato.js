import mongoose, { Schema } from "mongoose";
const schema = new Schema({
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
}, { collection: "auditoria_contratos", versionKey: false });
schema.index({ contratoKey: 1, el: -1 });
schema.index({ userProjectId: 1, el: -1 });
schema.index({ el: -1 });
export const AuditoriaContrato = mongoose.models.AuditoriaContrato || mongoose.model("AuditoriaContrato", schema);
