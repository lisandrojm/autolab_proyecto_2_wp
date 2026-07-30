import mongoose, { Schema } from "mongoose";
const releaseSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 150,
    },
    version: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 50,
    },
    description: {
        type: String,
        trim: true,
        default: "",
        maxlength: 2000,
    },
    content: {
        type: String,
        default: "",
        maxlength: 200000,
    },
    releaseTipoId: { type: Schema.Types.ObjectId, ref: "ReleaseTipo" },
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
    usaMembrete: {
        type: Boolean,
        default: false,
    },
    requiereFirma: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true, collection: "release" });
releaseSchema.index({ tenantId: 1, isActive: 1 });
export const Release = mongoose.model("Release", releaseSchema);
