import mongoose, { Schema } from "mongoose";
const loteContratacionSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    plantillaEquipoId: { type: Schema.Types.ObjectId, ref: "PlantillaEquipo", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    nombrePlantilla: { type: String, required: true },
    idempotencyKey: { type: String, required: true, maxlength: 100 },
    creadoPor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    solicitudIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    totales: {
        personas: { type: Number, default: 0 },
        jornadas: { type: Number, default: 0 },
        importe: { type: Number, default: 0 },
    },
}, { timestamps: true, collection: "lotes_contratacion" });
loteContratacionSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true });
loteContratacionSchema.index({ tenantId: 1, plantillaEquipoId: 1, createdAt: -1 });
export const LoteContratacion = mongoose.model("LoteContratacion", loteContratacionSchema);
