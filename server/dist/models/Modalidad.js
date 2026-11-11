import mongoose, { Schema } from "mongoose";
const modalidadSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    externalId: { type: String },
    name: { type: String, required: true },
    data: {
        id: { type: Number },
        nombre: { type: String },
    },
    orden: { type: Number, default: null },
    esDefault: { type: Boolean, default: false },
    activo: { type: Boolean, default: true },
}, { timestamps: true, collection: "modalidades" });
modalidadSchema.index({ tenantId: 1, name: 1 }, { unique: true });
modalidadSchema.index({ tenantId: 1, orden: 1 });
export const Modalidad = mongoose.model("Modalidad", modalidadSchema);
