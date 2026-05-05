import mongoose, { Schema } from "mongoose";
const roleSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    // Formato: "modulo:view" para acceso total al módulo
    permissions: { type: [String], default: [] },
    isDefault: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false },
}, { timestamps: true });
roleSchema.index({ tenantId: 1, name: 1 }, { unique: true });
roleSchema.index({ tenantId: 1, isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });
export const Role = mongoose.model("Role", roleSchema);
