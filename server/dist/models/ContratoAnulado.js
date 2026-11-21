import { Schema, model } from "mongoose";
const contratoAnuladoSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    userProjectId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    contratoKey: { type: Schema.Types.ObjectId, required: true },
    posicion: { type: Number, required: true },
    contrato: { type: Schema.Types.Mixed, required: true },
    anuladoEl: { type: Date, required: true },
    anuladoPor: { type: Schema.Types.ObjectId, ref: "User", default: null },
    anuladoPorNombre: { type: String, default: "" },
    motivo: { type: String, default: "" },
    origen: { type: String, enum: ["panel", "borrar_solicitud", "delete_deprecado", "script"], required: true },
    vinculoEliminado: { type: Boolean, default: false },
}, { timestamps: true, collection: "contratos_anulados", minimize: false });
// Un contrato se anula una vez: la clave es única. Si una corrida falla a mitad, el reintento choca acá en vez de duplicar.
contratoAnuladoSchema.index({ contratoKey: 1 }, { unique: true });
contratoAnuladoSchema.index({ userId: 1, anuladoEl: -1 });
contratoAnuladoSchema.index({ userProjectId: 1 });
export const ContratoAnulado = model("ContratoAnulado", contratoAnuladoSchema);
export default ContratoAnulado;
