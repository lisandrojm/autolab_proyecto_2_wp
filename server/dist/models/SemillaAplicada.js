import mongoose, { Schema } from "mongoose";
const semillaAplicadaSchema = new Schema({
    clave: { type: String, required: true, unique: true },
    aplicadaEl: { type: Date, required: true },
    detalle: { type: String },
}, { collection: "semillas_aplicadas" });
export const SemillaAplicada = mongoose.model("SemillaAplicada", semillaAplicadaSchema);
