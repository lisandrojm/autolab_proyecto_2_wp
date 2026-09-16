import mongoose, { Schema, Document, Model } from "mongoose";

/*
  EL CENTRO DE COSTO ES EL AUXILIAR DE TANGO (iD_TIPO_AUXILIAR 1).

  Los cuatro campos son los de Tango, con sus nombres:
    · `idAuxiliar`   — su id allá. Es lo que guarda `Project.metadata.centroCostoId`.
    · `codAuxiliar`  — EL NÚMERO REAL del centro («682», «99», «SinAsignar»). Es lo que se muestra en
                       todas las pantallas: es el dato con el que la gente de producción lo nombra.
    · `descAuxiliar` — la descripción larga («682_PEGSA_FILMATIC_UNREAL_ON11E»). Suele empezar con el
                       código, así que no reemplaza al código, lo acompaña.
    · `habilitado`   — "S"/"N" tal cual viene. No se traduce a booleano para que un dump del catálogo
                       se pueda comparar contra Tango sin traducir nada en el medio.

  `name`, `externalId` y `data` SE SIGUEN MANTENIENDO, derivados de los de arriba: hay código que
  todavía los lee —el router genérico de catálogos, la resolución de proyectos por `data.id`, el
  Excel—, y romperlos para "limpiar" el modelo habría dejado de mostrar el centro en media plataforma.
  La sincronización vive en el hook de abajo, en UN solo lugar, para que create, update, bulk y los dos
  imports no puedan quedar cada uno con su propia versión de la verdad.
*/
export interface ICentroCosto extends Document {
  /** El id del auxiliar en Tango. Único: es la identidad del centro. */
  idAuxiliar?: number;
  /** El código con el que se lo nombra («682»). Único. Es lo que se muestra. */
  codAuxiliar?: string;
  descAuxiliar?: string;
  habilitado?: "S" | "N";
  externalId: string;
  name: string;
  data: {
    id: number;
    nombre: string;
    descripcion?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Deja `name`, `externalId` y `data` en línea con los cuatro campos de Tango.
 *
 * Exportada para que los caminos que escriben con `insertMany`/`bulkWrite` —que NO pasan por los
 * hooks de documento— guarden exactamente lo mismo que un `save()`.
 */
export const sincronizarCamposDerivados = <T extends Partial<ICentroCosto>>(doc: T): T => {
  const cod = String(doc.codAuxiliar ?? "").trim();
  const id = Number(doc.idAuxiliar);
  if (cod) {
    doc.name = cod;
    doc.data = { ...(doc.data as any), nombre: cod, descripcion: String(doc.descAuxiliar ?? "").trim() || undefined } as any;
  }
  if (Number.isFinite(id)) {
    doc.externalId = String(id);
    doc.data = { ...(doc.data as any), id } as any;
  }
  return doc;
};

const centroCostoSchema = new Schema<ICentroCosto>(
  {
    idAuxiliar: { type: Number },
    codAuxiliar: { type: String, trim: true },
    descAuxiliar: { type: String, trim: true },
    habilitado: { type: String, enum: ["S", "N"], default: "S" },
    externalId: { type: String },
    name: { type: String, required: true },
    data: {
      id: { type: Number },
      nombre: { type: String },
      descripcion: { type: String },
    },
  },
  {
    timestamps: true,
    collection: "centros-costo",
  }
);

/*
  Índices únicos PARCIALES: sólo sobre los documentos que tienen el campo.

  Un único a secas trataría a todos los centros viejos —que no tienen `idAuxiliar`— como repetidos del
  mismo valor `null` y haría fallar el segundo. Con `partialFilterExpression` el único rige recién
  cuando el campo existe, que es lo que hace que el catálogo importado no pueda tener duplicados sin
  bloquear a los registros anteriores al cambio.
*/
centroCostoSchema.index({ idAuxiliar: 1 }, { unique: true, partialFilterExpression: { idAuxiliar: { $type: "number" } } });
centroCostoSchema.index({ codAuxiliar: 1 }, { unique: true, partialFilterExpression: { codAuxiliar: { $type: "string" } } });

centroCostoSchema.pre("validate", function (next) {
  sincronizarCamposDerivados(this as any);
  next();
});

export const CentroCosto: Model<ICentroCosto> = mongoose.model<ICentroCosto>("CentroCosto", centroCostoSchema);
