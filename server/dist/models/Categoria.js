import mongoose, { Schema } from "mongoose";
const categoriaSchema = new Schema({
    convenio: { type: String, default: "" },
    grupoId: { type: Schema.Types.ObjectId, ref: "ConvenioGrupo" },
    codigoArca: { type: String, default: "" },
    nombre: { type: String, required: true },
    descripcionArca: { type: String, default: "" },
    legacyId: { type: Number },
    isActive: { type: Boolean, default: true },
}, { timestamps: true, collection: "categorias" });
// El código identifica a la categoría dentro de su convenio.
categoriaSchema.index({ convenio: 1, codigoArca: 1 });
// Los contratos siguen apuntando por el id numérico viejo mientras dure la convivencia.
categoriaSchema.index({ legacyId: 1 });
export const Categoria = mongoose.model("Categoria", categoriaSchema);
