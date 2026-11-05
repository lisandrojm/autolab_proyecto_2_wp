import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userProjectId: { type: Schema.Types.ObjectId, ref: "UserProject", required: true },
    contractIndex: { type: Number, required: true },
    cuil: String,
    nombre: String,
    empresaId: { type: Schema.Types.ObjectId, ref: "Company" },
    empresaRazonSocial: String,
    alta: String,
    baja: String,
    automatica: { type: Boolean, default: false },
    usuarioId: { type: Schema.Types.ObjectId, ref: "User" },
    enSeco: { type: Boolean, default: false },
    consulta: { type: Schema.Types.Mixed, default: null },
    decision: { type: String, enum: ["presentada", "revision_manual", "sin_alta"], required: true },
    motivo: String,
    accion: String,
    html: String,
    origen: { type: String, enum: ["consulta", "sync"] },
    detectadaPor: String,
    ladoALado: { type: Schema.Types.Mixed, default: undefined },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: "arca_verificaciones_altas" });
schema.index({ tenantId: 1, userProjectId: 1, contractIndex: 1, createdAt: -1 });
export const ArcaVerificacionAlta = mongoose.models.ArcaVerificacionAlta || mongoose.model("ArcaVerificacionAlta", schema);
