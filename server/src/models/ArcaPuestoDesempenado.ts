import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Tabla oficial de ARCA (Simplificación Registral): puesto desempeñado (4 díg.).
 *
 * Solo la usa el registro de 85 (Registrar Nuevas Altas → Altas Masivas, pos. 29-32): el de 130 lo
 * deja en blanco. Se siembra desde el CSV (`src/scripts/seedTablasArca.ts`). `externalId` es el
 * código con sus ceros a la izquierda.
 */
export interface IArcaPuestoDesempenado extends Document {
  externalId: string;
  name: string;
  data: {
    id: number;
    nombre: string;
  };
  /** Se ofrece en los selectores. Uno en uso no se borra: se desactiva. */
  activo: boolean;
  /** `arca` = vino de la tabla oficial (importación); `manual` = se cargó o corrigió a mano: la importación no lo pisa. */
  origen: "arca" | "manual";
  /** Última vez que una importación de la tabla oficial lo vio. */
  sincronizadoEl?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IArcaPuestoDesempenado>(
  {
    externalId: { type: String },
    name: { type: String, required: true },
    data: {
      id: { type: Number },
      nombre: { type: String },
    },
    activo: { type: Boolean, default: true },
    origen: { type: String, enum: ["arca", "manual"], default: "manual" },
    sincronizadoEl: { type: Date },
  },
  {
    timestamps: true,
    collection: "arca-puestos-desempenados",
  }
);

// El código identifica al puesto: único. Lo crea `scripts/migrarPuestosDesempenados.ts` (verifica antes).
schema.index({ externalId: 1 }, { unique: true, name: "codigo_unico" });

export const ArcaPuestoDesempenado: Model<IArcaPuestoDesempenado> = mongoose.model<IArcaPuestoDesempenado>("ArcaPuestoDesempenado", schema);
