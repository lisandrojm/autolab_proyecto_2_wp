import { Schema, model } from "mongoose";
const lineaSchema = new Schema({
    empresaId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    empresaNombre: { type: String, default: null },
    ccCodigo: { type: String, default: null },
    ccNombre: { type: String, default: null },
    regimen: { type: String, default: null },
    legajo: { type: String, default: null },
    apellidoYNombre: { type: String, default: "" },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    conceptoCodigo: { type: String, required: true },
    conceptoDescripcion: { type: String, default: null },
    par1: { type: Number, default: 0 },
    par2: { type: Number, default: 0 },
    hoja: { type: String, default: "" },
    eventIds: { type: [String], default: [] },
    dias: { type: Number, default: 0 },
    origenes: { type: [String], default: [] },
}, { _id: false });
const excepcionSchema = new Schema({
    motivo: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    apellidoYNombre: { type: String, default: null },
    fecha: { type: String, default: null },
    eventoId: { type: String, default: null },
    detalle: { type: String, default: "" },
    bloqueante: { type: Boolean, default: false },
}, { _id: false });
const corridaSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    periodo: { type: String, required: true },
    filtros: { type: Schema.Types.Mixed, default: {} },
    versionMapeo: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lineas: { type: [lineaSchema], default: [] },
    excepciones: { type: [excepcionSchema], default: [] },
    resumen: {
        partes: { type: Number, default: 0 },
        eventos: { type: Number, default: 0 },
        lineas: { type: Number, default: 0 },
        personas: { type: Number, default: 0 },
        hojas: { type: Number, default: 0 },
        excepciones: { type: Number, default: 0 },
        bloqueantes: { type: Number, default: 0 },
    },
    hashLineas: { type: String, default: "" },
}, { timestamps: true, collection: "liquidacion_corridas" });
// Las corridas se listan por período, de la más nueva a la más vieja.
corridaSchema.index({ tenantId: 1, periodo: 1, createdAt: -1 });
export const LiquidacionCorrida = model("LiquidacionCorrida", corridaSchema);
