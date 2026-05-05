import mongoose, { Schema } from "mongoose";
const categoriaSatSchema = new Schema({
    externalId: { type: String, required: true },
    name: { type: String, required: true },
    data: {
        id: { type: Number },
        numeroCategoria: { type: Number },
        sueldoBruto: { type: Number },
        sueldoBrutoLetras: { type: String },
        neto: { type: Number },
        sueldoNetoLetras: { type: String },
        fechaActualizacion: { type: Schema.Types.Mixed },
        codigoAfip: { type: Number },
        presentismo: { type: Number },
        sueldoBasico: { type: Number },
        sueldoAdicional: { type: Number },
        nombre: { type: String },
    },
}, {
    timestamps: true,
    collection: "categorias-sat",
});
export const CategoriaSat = mongoose.model("CategoriaSat", categoriaSatSchema);
