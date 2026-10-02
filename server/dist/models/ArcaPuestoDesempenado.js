import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    externalId: { type: String },
    name: { type: String, required: true },
    data: {
        id: { type: Number },
        nombre: { type: String },
    },
    activo: { type: Boolean, default: true },
    origen: { type: String, enum: ["arca", "manual"], default: "manual" },
    sincronizadoEl: { type: Date },
}, {
    timestamps: true,
    collection: "arca-puestos-desempenados",
});
// El código identifica al puesto: único. Lo crea `scripts/migrarPuestosDesempenados.ts` (verifica antes).
schema.index({ externalId: 1 }, { unique: true, name: "codigo_unico" });
export const ArcaPuestoDesempenado = mongoose.model("ArcaPuestoDesempenado", schema);
