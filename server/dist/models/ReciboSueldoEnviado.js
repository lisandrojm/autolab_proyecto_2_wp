import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    loteId: { type: Schema.Types.ObjectId, required: true },
    reciboId: { type: Schema.Types.ObjectId, required: true },
    nombreSabana: { type: String, default: "" },
    nombreTxt: { type: String, default: "" },
    fuente: { type: String, default: "" },
    paginas: { type: [Number], default: [] },
    periodo: { type: String, default: "" },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    nombreUsuario: { type: String, default: "" },
    userProjectId: { type: Schema.Types.ObjectId, default: null },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    contractIndex: { type: Number, default: null },
    nombreProyecto: { type: String, default: "" },
    asignadoAMano: { type: Boolean, default: false },
    datos: { type: Schema.Types.Mixed, default: {} },
    archivoUrl: { type: String, default: "" },
    nombreEnviado: { type: String, default: "" },
    codigo: { type: String, default: "" },
    enviadoEl: { type: Date, required: true },
    enviadoPor: { type: Schema.Types.ObjectId, ref: "User", default: null },
    nombreEnviadoPor: { type: String, default: "" },
    estado: { type: String, enum: ["enviado", "firmado"], default: "enviado" },
    firmadoEl: { type: Date, default: null },
}, { timestamps: true, collection: "recibos_sueldo_enviados" });
schema.index({ loteId: 1, reciboId: 1 }, { unique: true });
schema.index({ tenantId: 1, enviadoEl: -1 });
schema.index({ tenantId: 1, periodo: 1 });
schema.index({ tenantId: 1, codigo: 1 });
export const ReciboSueldoEnviado = mongoose.model("ReciboSueldoEnviado", schema);
