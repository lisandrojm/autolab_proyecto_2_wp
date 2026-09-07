import mongoose, { Schema } from "mongoose";
const arcaDefaultSchema = new Schema({
    sucursalId: { type: Schema.Types.ObjectId, ref: "ArcaSucursal", default: null },
    convenioId: { type: Schema.Types.ObjectId, ref: "Convenio", default: null },
    grupoTipoServicio: { type: String, default: "" },
    tipoServicio: { type: String, default: "" },
    modalidadContratacion: { type: String, default: "" },
    modalidadLiquidacion: { type: String, default: "" },
}, { timestamps: true });
export const ArcaDefault = mongoose.model("ArcaDefault", arcaDefaultSchema);
/**
 * El documento único, creándolo vacío si todavía no existe.
 *
 * Se resuelve con un upsert y no con un `findOne` + `create` para que dos requests simultáneos no
 * dejen dos documentos: el segundo sería invisible y cambiaría los defaults según cuál se leyera.
 */
export async function getArcaDefaults() {
    const doc = await ArcaDefault.findOneAndUpdate({}, { $setOnInsert: {} }, { new: true, upsert: true });
    return doc;
}
