import mongoose, { Schema, Document, Model, Types } from "mongoose";

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
  /**
   * DE QUÉ EMPRESA VINO. Cada una tiene su propio Tango y su propio catálogo.
   *
   * La lista es una sola —así se decidió—, pero los códigos SE REPITEN entre empresas: las tres
   * tienen un «1» y un «99», y no son el mismo centro. Por eso la identidad de un centro es
   * (empresa, idAuxiliar) y no `idAuxiliar` solo, y por eso cada fila muestra de dónde vino.
   *
   * Vacío = cargado a mano o traído del export antes de que el catálogo fuera por empresa.
   */
  empresaId?: Types.ObjectId;
  /**
   * EL ID DE LA EMPRESA EN TANGO, que es la identidad real del catálogo: (empresaTangoId, idAuxiliar).
   *
   * Va aparte de `empresaId` porque NO TODA EMPRESA DE TANGO ES UNA EMPLEADORA DE LA PLATAFORMA.
   * FZERO CORP es la entidad de Estados Unidos: tiene su catálogo en Tango y sus centros se usan, pero
   * darla de alta como empresa acá la pondría a elegir como empleadora en cada contrato —y sin CUIT—,
   * que es justo lo que no corresponde. Con este campo su catálogo entra sin inventar una empleadora.
   */
  empresaTangoId?: number;
  /** El nombre de la empresa, copiado: la lista lo muestra en cada fila y sin esto serían 806 lookups. */
  empresaNombre?: string;
  /** De dónde salió: "tango" (sincronización), "import" (archivo) o "manual". */
  origen?: "tango" | "import" | "manual";
  /** Cuándo lo trajo la última sincronización. */
  sincronizadoEl?: Date;
  /** El id del auxiliar en Tango. Único DENTRO de su empresa. */
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
    empresaId: { type: Schema.Types.ObjectId, ref: "Company", index: true },
    empresaTangoId: { type: Number, index: true },
    empresaNombre: { type: String, trim: true },
    origen: { type: String, enum: ["tango", "import", "manual"], default: "manual" },
    sincronizadoEl: { type: Date },
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
  ÚNICOS POR EMPRESA DE TANGO, NO GLOBALES.

  La clave es `empresaTangoId` y no `empresaId`: hay catálogos de empresas de Tango que no son
  empleadoras de la plataforma (ver el campo), y ésas no tienen `empresaId`. Con `empresaId` todas
  ellas contarían como el mismo `null` y sólo entraría una.

  Empezaron siendo únicos a secas, cuando el catálogo era uno solo. Con tres empresas eso rechaza el
  segundo «1» y el segundo «99» —los ids y los códigos de Tango arrancan igual en cada empresa— y la
  sincronización de la segunda empresa fallaría entera. Lo que no puede repetirse es el mismo código
  DENTRO de una empresa.

  Son PARCIALES: rigen sólo donde el campo existe. Sin eso, todos los centros viejos —sin `idAuxiliar`—
  contarían como repetidos del mismo `null` y el segundo no entraría.

  OJO AL DEPLOY: los únicos globales ya están creados en la base. Los reemplaza `CentroCosto.syncIndexes()`,
  que corre al sincronizar (ver `services/centrosCostoSync.ts`); sin eso, Mongo sigue aplicando el viejo.
*/
centroCostoSchema.index({ empresaTangoId: 1, idAuxiliar: 1 }, { unique: true, partialFilterExpression: { idAuxiliar: { $type: "number" } } });
centroCostoSchema.index({ empresaTangoId: 1, codAuxiliar: 1 }, { unique: true, partialFilterExpression: { codAuxiliar: { $type: "string" } } });

centroCostoSchema.pre("validate", function (next) {
  sincronizarCamposDerivados(this as any);
  next();
});

export const CentroCosto: Model<ICentroCosto> = mongoose.model<ICentroCosto>("CentroCosto", centroCostoSchema);
