import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBanco extends Document {
  externalId: string;
  name: string;
  /** Tipo de entidad financiera: "banco" | "billetera_virtual" | "otro". */
  tipoEntidad?: string;
  /**
   * Si se ofrece en los selectores (registro, alta de usuario). Una inactiva NO se borra: quien ya la
   * tiene cargada la sigue viendo, pero nadie nuevo la puede elegir. Ausente = activa, así las
   * entidades cargadas antes de este campo no desaparecen de golpe.
   */
  activo?: boolean;
  data: {
    id: number;
    nombre: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const bancoSchema = new Schema<IBanco>(
  {
    externalId: { type: String },
    name: { type: String, required: true },
    tipoEntidad: { type: String },
    activo: { type: Boolean, default: true },
    data: {
      id: { type: Number },
      nombre: { type: String },
    },
  },
  {
    timestamps: true,
    collection: "bancos",
  }
);

export const Banco: Model<IBanco> = mongoose.model<IBanco>("Banco", bancoSchema);
