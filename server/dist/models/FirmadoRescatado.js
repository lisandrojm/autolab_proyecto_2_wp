import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    codigo: { type: String, default: "" },
    archivo: { type: String, required: true },
    path: { type: String, default: "" },
    carpeta: { type: String, default: "" },
    titulo: { type: String, default: "" },
    asunto: { type: String, default: "" },
    firmante: { type: String, default: "" },
    cuit: { type: String, default: "" },
    uid: { type: Number, default: null },
    bytes: { type: Number, default: 0 },
    rescatadoEl: { type: Date, required: true },
    veces: { type: Number, default: 1 },
}, { timestamps: true, collection: "dropbox_sign_firmados_rescatados" });
schema.index({ tenantId: 1, archivo: 1 }, { unique: true });
schema.index({ tenantId: 1, rescatadoEl: -1 });
schema.index({ tenantId: 1, codigo: 1 });
export const FirmadoRescatado = mongoose.model("FirmadoRescatado", schema);
