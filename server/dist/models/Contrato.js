import mongoose, { Schema } from "mongoose";
const contratoSchema = new Schema({
    name: { type: String, required: true },
    data: {
        cantidadJornadas: { type: Number, default: 0 },
        multiplicadorDiario: { type: Number, default: 0 },
        esTiempoIndeterminado: { type: Boolean, default: false },
    },
    isActive: { type: Boolean, default: true },
}, {
    timestamps: true,
    collection: "contratos",
});
export const Contrato = mongoose.model("Contrato", contratoSchema);
