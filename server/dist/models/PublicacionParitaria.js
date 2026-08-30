import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    fuente: { type: Schema.Types.ObjectId, ref: "FuenteParitaria", required: true },
    url: { type: String, required: true, trim: true },
    textoEnlace: { type: String, default: "", trim: true },
    hash: { type: String, required: true },
    detectadaEl: { type: Date, default: Date.now },
    vista: { type: Boolean, default: false },
    estado: { type: String, enum: ["detectada", "descartada"], default: "detectada" },
}, { timestamps: true, collection: "publicaciones-paritaria" });
/**
 * La identidad de una publicación es (fuente, url, hash), y el hash está adentro a propósito.
 *
 * Si el mismo PDF cambia de contenido es una publicación NUEVA, no una actualización de la anterior:
 * el acuerdo corregido es otro documento aunque viva en la misma dirección. Con la clave en
 * (fuente, url) el reemplazo se perdería, que es justamente el caso que el hash existe para atrapar.
 */
schema.index({ fuente: 1, url: 1, hash: 1 }, { unique: true });
export const PublicacionParitaria = mongoose.model("PublicacionParitaria", schema);
