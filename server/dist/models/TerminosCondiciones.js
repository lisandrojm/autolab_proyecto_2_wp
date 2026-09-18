import mongoose, { Schema } from "mongoose";
const terminosCondicionesSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    titulo: { type: String, required: true, trim: true },
    contenido: { type: String, default: "" },
    vigente: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
    historial: [
        {
            _id: false,
            version: { type: Number, required: true },
            titulo: { type: String },
            contenido: { type: String },
            /** Hasta cuándo fue ése el texto: el momento en que se lo reemplazó. */
            hasta: { type: Date, required: true },
        },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true, collection: "terminos_condiciones" });
export const TerminosCondiciones = mongoose.model("TerminosCondiciones", terminosCondicionesSchema);
