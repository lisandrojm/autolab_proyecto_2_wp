import mongoose, { Schema } from "mongoose";
const contratoFrameSchema = new Schema({
    externalId: { type: String },
    name: { type: String, required: true },
    content: {
        type: String,
        default: "",
        maxlength: 200000,
    },
    contratoId: { type: Schema.Types.ObjectId, ref: "Contrato" },
    data: {
        id: { type: Number },
        nombre: { type: String },
        cantidadJornadas: { type: Number },
        multiplicadorDiario: { type: Number },
        esTiempoIndeterminado: { type: Boolean, default: false },
    },
    usaMembrete: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
}, {
    timestamps: true,
    collection: "contratos-frame",
});
export const ContratoFrame = mongoose.model("ContratoFrame", contratoFrameSchema);
