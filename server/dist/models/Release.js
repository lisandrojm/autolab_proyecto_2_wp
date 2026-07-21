import mongoose, { Schema } from "mongoose";
const releaseSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    empresaId: { type: Schema.Types.ObjectId, ref: "Company" },
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
    fileUrl: {
        type: String,
        trim: true,
        default: "",
    },
    fileName: {
        type: String,
        trim: true,
        default: "",
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
}, { timestamps: true, collection: "release" });
releaseSchema.index({ tenantId: 1, isActive: 1 });
export const Release = mongoose.model("Release", releaseSchema);
