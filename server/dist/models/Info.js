import mongoose, { Schema } from "mongoose";
import { VALORES_PROPOSITO } from "../utils/propositosCarpeta.js";
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
        aceptaSinCuit: { type: Boolean },
        orden: { type: Number },
        ordenDependencia: { type: Number },
        transicionAutomatica: {
            evento: { type: String },
            carpetas: [
                {
                    _id: false,
                    dropboxCarpeta: { type: String },
                    detalle: { type: String },
                    // Sin `required`: ver el comentario del tipo. El enum sale de la fuente única.
                    proposito: { type: String, enum: VALORES_PROPOSITO },
                },
            ],
        },
    },
    name: { type: String, required: true },
}, {
    timestamps: true,
    strict: false,
});
export const Info = mongoose.model("Info", infoSchema);
