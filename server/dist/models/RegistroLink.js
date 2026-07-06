import mongoose, { Schema } from "mongoose";
/** Tiempo de vida de un link de registro: 30 días desde su creación. */
export const REGISTRO_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Devuelve el timestamp (ms) en que vence un link, con fallback a createdAt + TTL para links legacy sin expiresAt. */
export function getRegistroLinkExpiry(link) {
    if (link.expiresAt)
        return new Date(link.expiresAt).getTime();
    return new Date(link.createdAt).getTime() + REGISTRO_LINK_TTL_MS;
}
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
    expiresAt: { type: Date },
}, {
    timestamps: true,
    collection: "registro-links",
});
export const RegistroLink = mongoose.model("RegistroLink", registroLinkSchema);
