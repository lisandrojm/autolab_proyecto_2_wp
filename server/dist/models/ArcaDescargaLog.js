import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    origen: { type: String, required: true },
    empresaId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    empresaRazonSocial: { type: String, default: "" },
    arrancadaEl: { type: Date, required: true },
    terminadaEl: { type: Date, required: true },
    presentacion: { type: new Schema({ terminadaEl: Date, logId: { type: Schema.Types.ObjectId, default: null }, automatica: Boolean }, { _id: false }), default: null },
    pedidas: { type: Number, default: 0 },
    listas: { type: Number, default: 0 },
    deAlta: { type: Number, default: 0 },
    deBaja: { type: Number, default: 0 },
    items: [{ _id: false, cuil: String, nombre: String, estado: String, detalle: String, tipoConstancia: { type: String, default: null } }],
    error: { type: String, default: null },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: "arca_descargas_logs" });
schema.index({ tenantId: 1, arrancadaEl: -1 });
export const ArcaDescargaLog = mongoose.model("ArcaDescargaLog", schema);
