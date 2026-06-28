import mongoose, { Schema } from "mongoose";
const contratoFrameSchema = new Schema({
    externalId: { type: String },
    name: { type: String, required: true },
    data: {
        id: { type: Number },
        nombre: { type: String },
        rutaArchivo: { type: String },
        cantidadJornadas: { type: Number },
        multiplicadorDiario: { type: Number },
        fileUrl: { type: String, default: "" },
        fileName: { type: String, default: "" },
        esTiempoIndeterminado: { type: Boolean, default: false },
    },
}, {
    timestamps: true,
    collection: "contratos-frame",
});
export const ContratoFrame = mongoose.model("ContratoFrame", contratoFrameSchema);
