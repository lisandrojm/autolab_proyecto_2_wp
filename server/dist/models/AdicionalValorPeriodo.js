import mongoose, { Schema } from "mongoose";
const adicionalValorPeriodoSchema = new Schema({
    adicionalId: { type: Schema.Types.ObjectId, ref: "AdicionalConvenio", required: true },
    convenio: { type: String, required: true, trim: true },
    grupo: { type: Number, default: null },
    desde: { type: Date, required: true },
    hasta: { type: Date, default: null },
    monto: { type: Number, default: null },
    porcentaje: { type: Number, default: null },
    acuerdoId: { type: Schema.Types.ObjectId, ref: "AcuerdoParitario", default: null },
    tramo: { type: String, default: "" },
    origen: { type: String, enum: ["acta", "excel", "manual", "derivado"], default: "manual" },
    migracion: { type: String, default: "" },
    nota: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, collection: "convenio-adicional-valores" });
/** Un adicional no puede tener dos importes que arranquen el mismo día para el mismo grupo. */
adicionalValorPeriodoSchema.index({ adicionalId: 1, grupo: 1, desde: 1 }, { unique: true });
adicionalValorPeriodoSchema.index({ convenio: 1, desde: -1 });
export const AdicionalValorPeriodo = mongoose.model("AdicionalValorPeriodo", adicionalValorPeriodoSchema);
