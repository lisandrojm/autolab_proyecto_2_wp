import mongoose, { Schema } from "mongoose";
const convenioGrupoSchema = new Schema({
    convenio: { type: String, required: true },
    numero: { type: Number, required: true },
    nombre: { type: String, default: "" },
    sueldoBasico: { type: Number, default: 0 },
    sueldoAdicional: { type: Number, default: 0 },
    presentismo: { type: Number, default: 0 },
    sueldoBruto: { type: Number, default: 0 },
    sueldoBrutoLetras: { type: String, default: "" },
    neto: { type: Number, default: 0 },
    sueldoNetoLetras: { type: String, default: "" },
    fechaActualizacion: { type: Schema.Types.Mixed },
    vigenciaHasta: { type: Schema.Types.Mixed },
}, { timestamps: true, collection: "convenio-grupos" });
// Un grupo es único dentro de su convenio: el Grupo 1 del SAT no es el Grupo 1 de otro CCT.
convenioGrupoSchema.index({ convenio: 1, numero: 1 }, { unique: true });
export const ConvenioGrupo = mongoose.model("ConvenioGrupo", convenioGrupoSchema);
