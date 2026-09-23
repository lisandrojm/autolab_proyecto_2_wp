import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Cuánto vale un adicional en un período de vigencia.
 *
 * Va separado de `AdicionalConvenio` por la misma razón por la que la escala se separó del grupo: la
 * DEFINICIÓN del adicional (cómo se calcula, si es remunerativo, a quién aplica) no cambia con cada
 * paritaria; el IMPORTE cambia en cada tramo. Juntarlos obligaría a duplicar la definición en cada
 * aumento, y ahí es donde dos copias del mismo dato se desalinean.
 *
 * `grupo: null` significa "todos los grupos", que es el caso normal: en el acta de 634/11 los siete
 * adicionales tienen un único importe para todo el convenio. El campo existe porque otros CCT sí
 * diferencian por grupo, y descubrirlo después obligaría a migrar toda la colección.
 */
export interface IAdicionalValorPeriodo extends Document {
  adicionalId: mongoose.Types.ObjectId;
  /** Denormalizado para poder consultar por convenio sin un `$lookup`. Es de lectura: la verdad es `adicionalId`. */
  convenio: string;
  /** `null` = aplica a todos los grupos. */
  grupo?: number | null;

  desde: Date;
  /** INCLUSIVE, igual que en `EscalaPeriodo`. Vacío = vigente. */
  hasta?: Date | null;

  /** Importe del período. `null` cuando el adicional se define por porcentaje. */
  monto?: number | null;
  /** Para los adicionales porcentuales. */
  porcentaje?: number | null;

  acuerdoId?: mongoose.Types.ObjectId | null;
  tramo?: string;
  origen: "acta" | "excel" | "manual" | "derivado";
  migracion?: string;
  nota?: string;
  createdBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const adicionalValorPeriodoSchema = new Schema<IAdicionalValorPeriodo>(
  {
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
  },
  { timestamps: true, collection: "convenio-adicional-valores" }
);

/** Un adicional no puede tener dos importes que arranquen el mismo día para el mismo grupo. */
adicionalValorPeriodoSchema.index({ adicionalId: 1, grupo: 1, desde: 1 }, { unique: true });
adicionalValorPeriodoSchema.index({ convenio: 1, desde: -1 });

export const AdicionalValorPeriodo: Model<IAdicionalValorPeriodo> = mongoose.model<IAdicionalValorPeriodo>("AdicionalValorPeriodo", adicionalValorPeriodoSchema);
