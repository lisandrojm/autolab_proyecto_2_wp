import mongoose, { Schema } from "mongoose";
const categoriaSchema = new Schema({
    // `required` + validadores: la regla vive acá y no solo en la ruta, así ningún camino de
    // escritura (ABM, carga masiva, script) puede dejar una categoría a medio cargar. Los documentos
    // que YA están mal (Actor / Musico) se siguen leyendo —Mongoose no valida al leer—, pero no se
    // pueden volver a guardar sin completarlos, que es exactamente lo que se busca.
    convenio: { type: String, required: [true, "La categoría tiene que pertenecer a un convenio"], trim: true },
    grupoId: { type: Schema.Types.ObjectId, ref: "ConvenioGrupo", required: true },
    codigoArca: {
        type: String,
        required: [true, "La categoría tiene que tener su código de ARCA"],
        // 6 dígitos exactos y no todo ceros: "0" y "000000" son la ausencia de código disfrazada.
        validate: { validator: (v) => /^\d{6}$/.test(v) && v !== "000000", message: (p) => `"${p.value}" no es un código de ARCA: son 6 dígitos, con ceros a la izquierda (ej. "035283")` },
    },
    nombre: { type: String, required: true, trim: true },
    descripcionArca: { type: String, default: "" },
    legacyId: { type: Number },
    isActive: { type: Boolean, default: true },
}, { timestamps: true, collection: "categorias" });
// El código identifica a la categoría dentro de su convenio.
categoriaSchema.index({ convenio: 1, codigoArca: 1 });
// Los contratos siguen apuntando por el id numérico viejo mientras dure la convivencia.
categoriaSchema.index({ legacyId: 1 });
export const Categoria = mongoose.model("Categoria", categoriaSchema);
