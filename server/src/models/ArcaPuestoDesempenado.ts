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
  },
  {
    timestamps: true,
    collection: "arca-puestos-desempenados",
  }
);

export const ArcaPuestoDesempenado: Model<IArcaPuestoDesempenado> = mongoose.model<IArcaPuestoDesempenado>("ArcaPuestoDesempenado", schema);
