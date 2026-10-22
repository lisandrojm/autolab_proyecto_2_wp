import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    codigo: { type: String, required: true },
    archivo: { type: String, default: "" },
    email: { type: String, default: "" },
    firmante: { type: String, default: "" },
    tipo: { type: String, default: "" },
    estado: { type: String, enum: ["enviado", "error", "limite", "requiere_revision"], required: true },
    detalle: { type: String, default: "" },
    enviadoAt: { type: Date, default: null },
}, { timestamps: true, collection: "dropbox_sign_envios" });
// Un código, un registro por tenant: es lo que impide enviar dos veces el mismo documento.
schema.index({ tenantId: 1, codigo: 1 }, { unique: true });
export const DropboxSignEnvio = mongoose.model("DropboxSignEnvio", schema);
