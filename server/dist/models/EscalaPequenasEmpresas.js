import mongoose, { Schema } from "mongoose";
const escalaPequenasEmpresasSchema = new Schema({
    convenio: { type: String, required: true, trim: true },
    grupo: { type: Number, required: true },
    desde: { type: Date, required: true },
    hasta: { type: Date, default: null },
    semana9hsLunVie: { type: Number, default: 0 },
    jornadaAdicional9hs: { type: Number, default: 0 },
    horaExtra50: { type: Number, default: 0 },
    horaExtra100: { type: Number, default: 0 },
    acuerdoId: { type: Schema.Types.ObjectId, ref: "AcuerdoParitario", default: null },
    tramo: { type: String, default: "" },
    origen: { type: String, enum: ["acta", "excel", "manual", "derivado"], default: "manual" },
    migracion: { type: String, default: "" },
    nota: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, collection: "convenio-pequenas-empresas" });
escalaPequenasEmpresasSchema.index({ convenio: 1, grupo: 1, desde: 1 }, { unique: true });
export const EscalaPequenasEmpresas = mongoose.model("EscalaPequenasEmpresas", escalaPequenasEmpresasSchema);
