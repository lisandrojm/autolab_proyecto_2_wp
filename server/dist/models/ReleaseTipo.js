import mongoose, { Schema } from "mongoose";
const releaseTipoSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    // `unique` compuesto con tenantId evita duplicados aunque dos requests concurrentes disparen
    // el backfill al mismo tiempo (ver `ensureReleaseTiposBackfilled` en routes/releaseTipos.ts).
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
}, {
    timestamps: true,
    collection: "release-tipos",
});
releaseTipoSchema.index({ tenantId: 1, name: 1 }, { unique: true });
export const ReleaseTipo = mongoose.model("ReleaseTipo", releaseTipoSchema);
