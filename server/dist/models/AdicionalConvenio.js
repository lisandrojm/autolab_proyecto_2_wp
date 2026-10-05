import mongoose, { Schema } from "mongoose";
const adicionalConvenioSchema = new Schema({
    convenio: { type: String, required: true, trim: true },
    codigo: { type: String, required: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    tipoCalculo: {
        type: String,
        enum: ["monto_fijo", "mensual", "por_anio_antiguedad", "por_evento", "porcentaje", "a_confirmar"],
        default: "a_confirmar",
    },
    // `null` es un valor con significado: "no se sabe". Por eso no tiene `default: false`.
    remunerativo: { type: Boolean, default: null },
    confirmado: { type: Boolean, default: false },
    base: { type: String, enum: ["basico", "basico_mas_adicional", "total", null], default: null },
    unidad: { type: String, default: "" },
    condicion: { type: String, default: "" },
    conceptoLiquidacion: { type: String, default: "" },
    codigoArca: { type: Number, default: null },
    capitulo: { type: String, enum: ["general", "pequenas_empresas"], default: "general" },
    orden: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    migracion: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, collection: "convenio-adicionales" });
/** El código identifica al adicional dentro de su convenio: la "antigüedad" de 634/11 no es la de otro CCT. */
adicionalConvenioSchema.index({ convenio: 1, codigo: 1 }, { unique: true });
export const AdicionalConvenio = mongoose.model("AdicionalConvenio", adicionalConvenioSchema);
