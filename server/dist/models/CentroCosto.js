import mongoose, { Schema } from "mongoose";
const centroCostoSchema = new Schema({
    externalId: { type: String },
    name: { type: String, required: true },
    data: {
        id: { type: Number },
        nombre: { type: String },
    },
}, {
    timestamps: true,
    collection: "centros-costo",
});
export const CentroCosto = mongoose.model("CentroCosto", centroCostoSchema);
