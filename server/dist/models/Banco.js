import mongoose, { Schema } from "mongoose";
const bancoSchema = new Schema({
    externalId: { type: String },
    name: { type: String, required: true },
    tipoEntidad: { type: String },
    activo: { type: Boolean, default: true },
    data: {
        id: { type: Number },
        nombre: { type: String },
    },
}, {
    timestamps: true,
    collection: "bancos",
});
export const Banco = mongoose.model("Banco", bancoSchema);
