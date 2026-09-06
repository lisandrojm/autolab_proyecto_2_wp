import mongoose, { Schema } from "mongoose";
const afipLogSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    tipo: { type: String, enum: ["padron", "servicio_test"], required: true },
    cuitConsultado: { type: String },
    cuitRepresentada: { type: String },
    ambiente: { type: String, enum: ["homologacion", "produccion"] },
    encontrado: { type: Boolean },
    estado: { type: String, enum: ["activo", "inactivo", "desconocido"] },
    faultCode: { type: String },
    faultString: { type: String },
    raw: { type: Schema.Types.Mixed },
    error: { type: String },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 }, // TTL: 30 días
}, { collection: "afip_logs" });
afipLogSchema.index({ tenantId: 1, createdAt: -1 });
export const AfipLog = mongoose.model("AfipLog", afipLogSchema);
