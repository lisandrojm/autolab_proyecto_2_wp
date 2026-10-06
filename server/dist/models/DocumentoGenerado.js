import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    codigo: { type: String, required: true },
    numero: { type: Number, required: true },
    tipo: { type: String, required: true },
    archivo: { type: String, default: "" },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    userProjectId: { type: Schema.Types.ObjectId, default: null },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    contrato: {
        indice: { type: Number, default: null },
        alta: { type: String, default: "" },
        baja: { type: String, default: "" },
        carga: { type: String, default: "" },
    },
}, { timestamps: true, collection: "documentos_generados" });
// Un código no se repite NUNCA dentro del tenant: es la garantía de que un aviso apunta a un solo documento.
schema.index({ tenantId: 1, codigo: 1 }, { unique: true });
export const DocumentoGenerado = mongoose.model("DocumentoGenerado", schema);
const contadorSchema = new Schema({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } }, { collection: "contadores", versionKey: false });
const Contador = mongoose.model("Contador", contadorSchema);
/** El próximo número del correlativo de documentos del tenant. */
export async function proximoNumeroDeDocumento(tenantId) {
    const r = await Contador.findOneAndUpdate({ _id: `documentos:${String(tenantId)}` }, { $inc: { seq: 1 } }, { upsert: true, new: true }).lean();
    return Number(r?.seq) || 1;
}
/** «ID-000123»: seis dígitos como mínimo, para que el ancho no cambie durante mucho tiempo. */
export const formatoCodigo = (numero) => `ID-${String(numero).padStart(6, "0")}`;
