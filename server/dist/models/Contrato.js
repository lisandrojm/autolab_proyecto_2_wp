import mongoose, { Schema } from "mongoose";
const contratoSchema = new Schema({
    // `unique` evita duplicados aunque dos requests concurrentes disparen el backfill al mismo
    // tiempo (ver `ensureContratosBackfilled` en routes/contratos.ts).
    name: { type: String, required: true, unique: true },
    data: {
        cantidadJornadas: { type: Number, default: 0 },
        multiplicadorDiario: { type: Number, default: 0 },
        esTiempoIndeterminado: { type: Boolean, default: false },
        requiereFirma: { type: Boolean, default: true },
        afipModalidadContrato: { type: String },
        afipTipoServicio: { type: String },
        afipActividad: { type: String },
        afipModalidadLiquidacion: { type: String },
    },
    isActive: { type: Boolean, default: true },
}, {
    timestamps: true,
    collection: "contratos",
});
export const Contrato = mongoose.model("Contrato", contratoSchema);
