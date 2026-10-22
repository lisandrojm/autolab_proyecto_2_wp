import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    inicio: { type: Date, required: true },
    fin: { type: Date, default: null },
    resultado: { type: String, default: "" },
    enviados: { type: Number, default: 0 },
    errores: { type: Number, default: 0 },
    limite: { type: Boolean, default: false },
    enSeco: { type: Boolean, default: false },
    automatica: { type: Boolean, default: false },
    lineas: {
        type: [new Schema({ archivo: String, codigo: String, email: String, estado: String, detalle: String }, { _id: false })],
        default: [],
    },
    error: { type: String },
    capturaError: { type: String },
    // TTL: 30 días.
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
}, { collection: "dropbox_sign_envio_logs" });
schema.index({ tenantId: 1, createdAt: -1 });
export const DropboxSignEnvioLog = mongoose.model("DropboxSignEnvioLog", schema);
