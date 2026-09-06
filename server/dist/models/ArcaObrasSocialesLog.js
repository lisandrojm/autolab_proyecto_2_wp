import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    empresaId: { type: Schema.Types.ObjectId, ref: "Company" },
    empresaRazonSocial: { type: String },
    empresaCuit: { type: String },
    usuarioId: { type: Schema.Types.ObjectId, ref: "User" },
    total: { type: Number, default: 0 },
    validadas: { type: Number, default: 0 },
    guardadas: { type: Number, default: 0 },
    sinDeclarar: { type: Number, default: 0 },
    errores: { type: Number, default: 0 },
    faltaron: { type: Number, default: 0 },
    motivo: { type: String },
    seLogueo: { type: Boolean, default: false },
    duracionMs: { type: Number, default: 0 },
    error: { type: String },
    detalle: [{ _id: false, cuil: String, rnos: String, error: String }],
    renombrados: [{ _id: false, cuil: String, antes: String, ahora: String }],
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
}, { collection: "arca_obras_sociales_logs" });
schema.index({ tenantId: 1, createdAt: -1 });
export const ArcaObrasSocialesLog = mongoose.model("ArcaObrasSocialesLog", schema);
