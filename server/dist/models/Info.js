import mongoose, { Schema } from "mongoose";
const infoSchema = new Schema({
    externalId: { type: String, required: true },
    type: { type: String, required: true },
    data: {
        id: { type: Number },
        nombre: { type: String },
        // Campos del ABM de Estados (ver IInfo). El resto de los tipos de info no los usa.
        color: { type: String },
        contratoFrameIds: { type: [String] },
        esImpositivo: { type: Boolean },
        etiquetaSecundaria: { type: String },
        colorEtiquetaSecundaria: { type: String },
        tipoImpositivo: { type: String },
        orden: { type: Number },
        ordenDependencia: { type: Number },
        transicionAutomatica: {
            evento: { type: String },
            dropboxCarpeta: { type: String },
            detalle: { type: String },
        },
    },
    name: { type: String, required: true },
}, {
    timestamps: true,
    strict: false,
});
export const Info = mongoose.model("Info", infoSchema);
