import mongoose, { Schema } from "mongoose";
const reciboSchema = new Schema({
    paginas: { type: [Number], default: [] },
    datos: {
        cuil: { type: String, default: "" },
        empleadorCuit: { type: String, default: "" },
        nombre: { type: String, default: "" },
        periodo: { type: String, default: "" },
        legajo: { type: String, default: "" },
        neto: { type: String, default: "" },
        cuitsEncontrados: { type: [String], default: [] },
    },
    textoCrudo: { type: String, default: "" },
    archivoUrl: { type: String, default: "" },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    userProjectId: { type: Schema.Types.ObjectId, default: null },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    contractIndex: { type: Number, default: null },
    nombreUsuario: { type: String, default: "" },
    nombreProyecto: { type: String, default: "" },
    asignadoAMano: { type: Boolean, default: false },
    estado: { type: String, enum: ["sin_persona", "listo", "enviado", "firmado", "error"], default: "sin_persona" },
    enviadoEl: { type: Date, default: null },
    firmadoEl: { type: Date, default: null },
    nombreEnviado: { type: String, default: "" },
    codigo: { type: String, default: "" },
    error: { type: String, default: "" },
}, { _id: true });
const schema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    nombreArchivo: { type: String, default: "" },
    subidoPor: { type: Schema.Types.ObjectId, ref: "User", default: null },
    sabanaUrl: { type: String, default: "" },
    estadoLote: { type: String, enum: ["leyendo", "listo", "error"], default: "leyendo" },
    progreso: { leidas: { type: Number, default: 0 }, total: { type: Number, default: 0 } },
    error: { type: String, default: "" },
    paginas: { type: Number, default: 0 },
    paginasPorRecibo: { type: Number, default: 2 },
    periodo: { type: String, default: "" },
    recibos: { type: [reciboSchema], default: [] },
}, { timestamps: true, collection: "recibos_sueldo_lotes" });
schema.index({ tenantId: 1, createdAt: -1 });
// Para marcar el recibo como firmado cuando el escaneo de Dropbox encuentra su código.
schema.index({ tenantId: 1, "recibos.codigo": 1 }, { sparse: true });
export const LoteRecibosSueldo = mongoose.model("LoteRecibosSueldo", schema);
