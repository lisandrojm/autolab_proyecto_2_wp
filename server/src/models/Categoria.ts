import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Categoría profesional de un Convenio Colectivo (pos. 101-106 del TXT de alta de ARCA).
 *
 * Reemplaza a `CategoriaSat`, cuyo nombre describía un caso particular como si fuera la regla: esa
 * tabla era, literalmente, las 106 categorías del convenio **0634/11 — SAT (Televisión)**. De ahí el
 * "SAT". Los demás convenios tienen las suyas, con códigos de otros rangos (0131/75 tiene 219,
 * 0322/75 tiene 4, etc.), y no había dónde cargarlas.
 *
 * La jerarquía es:
 *
 *   Convenio (catálogo `convenios`)
 *     └── ConvenioGrupo   ← acá vive la ESCALA SALARIAL
 *           └── Categoria ← acá solo el código de ARCA y el nombre
 *
 * La categoría NO lleva sueldo: lo hereda de su grupo. Ver `ConvenioGrupo` para el porqué.
 */
export interface ICategoria extends Document {
  /** Código del CCT al que pertenece, formato ARCA ("0634/11"). Redundante con el grupo, pero
   *  explícito a propósito: no se depende de que el código de categoría sea único entre convenios
   *  (lo es en los 5 convenios relevados, pero eso no está garantizado en general). */
  convenio: string;
  /** Grupo salarial al que pertenece. */
  grupoId: mongoose.Types.ObjectId;
  /**
   * Código de categoría de ARCA, SIEMPRE con 6 dígitos y ceros a la izquierda ("035283", no "35283").
   * Se guarda canónico —como lo escribe ARCA— para que comparar contra un export del organismo sea
   * directo. El TXT lo usa tal cual.
   */
  codigoArca: string;
  /** Nombre de la categoría, sin el sufijo "- GRUPO N" que ARCA le agrega en la descripción. */
  nombre: string;
  /** Descripción completa tal como viene de ARCA, para poder cotejar contra el organismo. */
  descripcionArca?: string;
  /** `data.id` de la tabla vieja `categorias-sat`, para no romper las FK existentes (ver migración). */
  legacyId?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const categoriaSchema = new Schema<ICategoria>(
  {
    convenio: { type: String, default: "" },
    grupoId: { type: Schema.Types.ObjectId, ref: "ConvenioGrupo" },
    codigoArca: { type: String, default: "" },
    nombre: { type: String, required: true },
    descripcionArca: { type: String, default: "" },
    legacyId: { type: Number },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "categorias" }
);

// El código identifica a la categoría dentro de su convenio.
categoriaSchema.index({ convenio: 1, codigoArca: 1 });
// Los contratos siguen apuntando por el id numérico viejo mientras dure la convivencia.
categoriaSchema.index({ legacyId: 1 });

export const Categoria: Model<ICategoria> = mongoose.model<ICategoria>("Categoria", categoriaSchema);
