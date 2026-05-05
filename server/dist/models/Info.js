import mongoose, { Schema } from "mongoose";
const infoSchema = new Schema({
    externalId: { type: String, required: true },
    type: { type: String, required: true },
    data: {
        id: { type: Number },
        nombre: { type: String },
    },
    name: { type: String, required: true },
}, {
    timestamps: true,
    strict: false,
});
export const Info = mongoose.model("Info", infoSchema);
