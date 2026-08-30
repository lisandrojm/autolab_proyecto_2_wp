import mongoose, { Schema } from "mongoose";
const convenioSchema = new Schema({
    externalId: { type: String },
    name: { type: String, required: true },
    signatario: { type: String },
    obraSocialDefaultId: { type: Number },
    /*
      Sin `default` a nivel schema y a propósito: el default de los 2.669 es la AUSENCIA del campo, y
      ponerle uno escribiría "sin_revisar" en cada documento que se toque por cualquier otro motivo.
      Ausente y "sin_revisar" significan lo mismo y se resuelven en un solo lugar
      (`utils/estadoFuenteConvenio.ts`), así que no hace falta materializarlo.
    */
    fuenteEstadoDeclarado: { type: String, enum: ["sin_revisar", "sin_fuente_conocida", "no_aplica"] },
    fuenteNota: { type: String, default: "", trim: true },
    fuenteRevisadaPor: { type: String, default: "", trim: true },
    fuenteRevisadaEl: { type: Date },
    data: {
        id: { type: Number },
        nombre: { type: String },
    },
}, {
    timestamps: true,
    collection: "convenios",
});
export const Convenio = mongoose.model("Convenio", convenioSchema);
