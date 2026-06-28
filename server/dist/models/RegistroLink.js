import mongoose, { Schema } from "mongoose";
const registroLinkSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    tenantSlug: { type: String, required: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client" },
    label: { type: String },
    active: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    usageCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date },
}, {
    timestamps: true,
    collection: "registro-links",
});
export const RegistroLink = mongoose.model("RegistroLink", registroLinkSchema);
