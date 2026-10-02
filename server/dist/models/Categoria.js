import mongoose, { Schema } from "mongoose";
const categoriaSchema = new Schema({
    // `required` + validadores: la regla vive acá y no solo en la ruta, así ningún camino de
    // escritura (ABM, carga masiva, script) puede dejar una categoría a medio cargar. Los documentos
    // que YA están mal (Actor / Musico) se siguen leyendo —Mongoose no valida al leer—, pero no se
    // pueden volver a guardar sin completarlos, que es exactamente lo que se busca.
    convenio: { type: String, required: [true, "La categoría tiene que pertenecer a un convenio"], trim: true },
    grupoId: { type: Schema.Types.ObjectId, ref: "ConvenioGrupo", default: null },
    sueldoBasico: { type: Number, default: 0 },
    sueldoAdicional: { type: Number, default: 0 },
    presentismo: { type: Number, default: 0 },
    sueldoBruto: { type: Number, default: 0 },
    sueldoBrutoLetras: { type: String, default: "" },
    neto: { type: Number, default: 0 },
    sueldoNetoLetras: { type: String, default: "" },
    fechaActualizacion: { type: Date },
    vigenciaHasta: { type: Date },
    codigoArca: {
        type: String,
        required: [true, "La categoría tiene que tener su código de ARCA"],
        // 6 dígitos exactos y no todo ceros: "0" y "000000" son la ausencia de código disfrazada.
        validate: { validator: (v) => /^\d{6}$/.test(v) && v !== "000000", message: (p) => `"${p.value}" no es un código de ARCA: son 6 dígitos, con ceros a la izquierda (ej. "035283")` },
    },
    puestoDesempenado: {
        type: String,
        default: "",
        validate: { validator: (v) => !v || /^\d{4}$/.test(v), message: (p) => `"${p.value}" no es un código de puesto desempeñado: son 4 dígitos (ej. "2455")` },
    },
    confirmacionNombre: { type: new Schema({ descripcionArca: String, por: { type: Schema.Types.ObjectId, ref: "User" }, el: Date }, { _id: false }), default: null },
    nombre: { type: String, required: true, trim: true },
    descripcionArca: { type: String, default: "" },
    legacyId: { type: Number },
    isActive: { type: Boolean, default: true },
}, { timestamps: true, collection: "categorias" });
/*
  EL CÓDIGO IDENTIFICA A LA CATEGORÍA DENTRO DE SU CONVENIO, y ahora la base lo garantiza.

  Era un índice común: nada impedía dos categorías activas con el mismo código, y así fue como 41
  categorías del 0634/11 terminaron con el código de otra. Único y PARCIAL: solo entre las activas con
  código —las dos heredadas rotas sin convenio ni código (Actor, Musico) y las dadas de baja no
  cuentan—. Lo crea `scripts/crearIndiceUnicoCategorias.ts`, que antes verifica que no haya duplicados.
*/
categoriaSchema.index({ convenio: 1, codigoArca: 1 }, { unique: true, name: "convenio_codigoArca_unico", partialFilterExpression: { isActive: true, codigoArca: { $gt: "" } } });
// Los contratos siguen apuntando por el id numérico viejo mientras dure la convivencia.
categoriaSchema.index({ legacyId: 1 });
export const Categoria = mongoose.model("Categoria", categoriaSchema);
