import mongoose, { Schema } from "mongoose";
const renovacionContratoSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userProjectId: { type: Schema.Types.ObjectId, ref: "UserProject", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    fechaBajaContrato: { type: String, required: true },
    decision: { type: String, enum: ["renovar", "dejar_vencer"], required: true },
    solicitudId: { type: Schema.Types.ObjectId, ref: "User" },
    decididoPor: { type: Schema.Types.ObjectId, ref: "User" },
    decididoPorNombre: { type: String },
    decididoEl: { type: Date, required: true },
}, { timestamps: true, collection: "renovaciones_contrato" });
renovacionContratoSchema.index({ tenantId: 1, userProjectId: 1, fechaBajaContrato: 1 }, { unique: true });
export const RenovacionContrato = mongoose.model("RenovacionContrato", renovacionContratoSchema);
