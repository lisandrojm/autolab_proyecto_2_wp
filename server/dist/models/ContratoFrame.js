import mongoose, { Schema } from "mongoose";
const contratoFrameSchema = new Schema({
    externalId: { type: String },
    name: { type: String, required: true },
    content: {
        type: String,
        default: "",
        maxlength: 200000,
    },
    data: {
        id: { type: Number },
        nombre: { type: String },
        cantidadJornadas: { type: Number },
        multiplicadorDiario: { type: Number },
        esTiempoIndeterminado: { type: Boolean, default: false },
    },
}, {
    timestamps: true,
    collection: "contratos-frame",
});
export const ContratoFrame = mongoose.model("ContratoFrame", contratoFrameSchema);
