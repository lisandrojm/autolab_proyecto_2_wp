import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    tipo: { type: String, enum: ["carga_masiva", "altas_masivas"], required: true },
    usuarioId: { type: Schema.Types.ObjectId, ref: "User" },
    empresaId: { type: Schema.Types.ObjectId, ref: "Company" },
    empresaCuit: String,
    empresaRazonSocial: String,
    enSeco: { type: Boolean, default: true },
    contratos: [{ _id: false, userProjectId: { type: Schema.Types.ObjectId, ref: "UserProject" }, contractIndex: Number, cuil: String, nombre: String, resultado: String, motivo: String }],
    codigoNovedad: String,
    nroTransaccion: String,
    fechaPresentacion: String,
    estadoArca: String,
    resultado: { type: String, required: true },
    irreversible: { type: Boolean, default: false },
    pasoFallido: String,
    error: String,
    textoArca: String,
    dialogos: [String],
    seLogueo: Boolean,
    tiempos: { type: Schema.Types.Mixed },
    duracionMs: Number,
    htmlResultado: String,
    createdAt: { type: Date, default: Date.now },
}, { collection: "arca_altas_logs" });
schema.index({ tenantId: 1, createdAt: -1 });
export const ArcaAltasLog = mongoose.model("ArcaAltasLog", schema);
