import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    externalId: { type: String },
    name: { type: String, required: true },
    data: {
        id: { type: Number },
        nombre: { type: String },
    },
}, {
    timestamps: true,
    collection: "arca-situaciones-baja",
});
export const ArcaSituacionBaja = mongoose.models.ArcaSituacionBaja || mongoose.model("ArcaSituacionBaja", schema);
