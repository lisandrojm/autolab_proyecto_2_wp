import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    codigo: { type: String, required: true },
    archivo: { type: String, default: "" },
    email: { type: String, default: "" },
    firmante: { type: String, default: "" },
    tipo: { type: String, default: "" },
    estado: { type: String, enum: ["en_cola", "enviado", "error", "limite", "requiere_revision"], required: true },
    detalle: { type: String, default: "" },
    orden: { type: Number, default: null },
    encoladoAt: { type: Date, default: null },
    encoladoPor: { type: Schema.Types.ObjectId, ref: "User", default: null },
    probadoEnSecoAt: { type: Date, default: null },
    enviadoAt: { type: Date, default: null },
}, { timestamps: true, collection: "dropbox_sign_envios" });
// Un código, un registro por tenant: es lo que impide enviar dos veces el mismo documento.
schema.index({ tenantId: 1, codigo: 1 }, { unique: true });
schema.index({ tenantId: 1, estado: 1, orden: 1 });
export const DropboxSignEnvio = mongoose.model("DropboxSignEnvio", schema);
