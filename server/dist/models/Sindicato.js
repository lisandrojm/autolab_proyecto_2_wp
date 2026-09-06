import mongoose, { Schema } from "mongoose";
const sindicatoSchema = new Schema({
    externalId: { type: String },
    name: { type: String, required: true },
    sigla: { type: String },
    data: {
        id: { type: Number },
        nombre: { type: String },
    },
}, {
    timestamps: true,
    collection: "sindicatos",
});
export const Sindicato = mongoose.model("Sindicato", sindicatoSchema);
