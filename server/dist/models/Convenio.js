import mongoose, { Schema } from "mongoose";
const convenioSchema = new Schema({
    externalId: { type: String },
    name: { type: String, required: true },
    signatario: { type: String },
    obraSocialDefaultId: { type: Number },
    data: {
        id: { type: Number },
        nombre: { type: String },
    },
}, {
    timestamps: true,
    collection: "convenios",
});
export const Convenio = mongoose.model("Convenio", convenioSchema);
