import mongoose, { Schema } from "mongoose";
const tramoSchema = new Schema({
    codigo: { type: String, required: true, trim: true },
    desde: { type: Date, required: true },
    porcentaje: { type: Number, required: true },
    base: { type: String, default: "" },
    baseDesde: { type: Date, default: null },
    acumulativo: { type: Boolean, default: true },
    regimen: { type: String, enum: ["general", "alternativo"], default: "general" },
    absorbe: { type: String, default: "" },
    nota: { type: String, default: "" },
}, { _id: false });
const acuerdoParitarioSchema = new Schema({
    convenios: { type: [String], default: [] },
    partes: { type: [String], default: [] },
    titulo: { type: String, required: true, trim: true },
    periodoParitario: {
        desde: { type: Date, default: null },
        hasta: { type: Date, default: null },
    },
    expediente: { type: String, default: "", trim: true },
    firmadoEl: { type: Date, default: null },
    homologacion: {
        estado: { type: String, enum: ["a_confirmar", "sin_homologar", "en_tramite", "homologado"], default: "a_confirmar" },
        resolucion: { type: String, default: "" },
        fecha: { type: Date, default: null },
    },
    tramos: { type: [tramoSchema], default: [] },
    clausulaAbsorcion: {
        texto: { type: String, default: "" },
        aplica: { type: Boolean, default: false },
    },
    regimenAlternativo: {
        descripcion: { type: String, default: "" },
        empresaIds: [{ type: Schema.Types.ObjectId, ref: "Company" }],
    },
    publicacionParitariaId: { type: Schema.Types.ObjectId, ref: "PublicacionParitaria", default: null },
    archivo: {
        ruta: { type: String, default: "" },
        nombreOriginal: { type: String, default: "" },
        contentType: { type: String, default: "" },
        bytes: { type: Number, default: 0 },
        subidoEl: { type: Date, default: null },
    },
    isActive: { type: Boolean, default: true },
    migracion: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, collection: "acuerdos-paritarios" });
/** Se busca por convenio (la pantalla de un CCT) y por expediente (es el identificador del acta). */
acuerdoParitarioSchema.index({ convenios: 1, firmadoEl: -1 });
acuerdoParitarioSchema.index({ expediente: 1 });
export const AcuerdoParitario = mongoose.model("AcuerdoParitario", acuerdoParitarioSchema);
