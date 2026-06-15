import mongoose, { Schema } from "mongoose";
const obraSocialSchema = new Schema({
    externalId: { type: String },
    name: { type: String, required: true },
    data: {
        id: { type: Number },
        nombre: { type: String },
    },
}, {
    timestamps: true,
    collection: "obras-sociales",
});
export const ObraSocial = mongoose.model("ObraSocial", obraSocialSchema);
