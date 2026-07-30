import mongoose, { Schema, Document, Model } from "mongoose";

export interface IInfo extends Document {
  externalId: string;
  type: string;
  data: {
    id: number;
    nombre: string;
    /** Estados (type "estado-empleado"): color del texto del badge; el fondo es ese color con transparencia. */
    color?: string;
    /** Estados: tipos de contrato (contratos-frame) en los que se ofrece. Vacío = todos. */
    contratoFrameIds?: string[];
    /** Estados: cómo se llama el estado dentro del contrato (obligatorio si el estado es Activo/Inactivo). */
    nombreEnContrato?: string;
    /** Estados: marca los estados de índole impositiva, para poder darles un tratamiento distinto. */
    esImpositivo?: boolean;
    /** Estados: orden visual en el ABM y en el dropdown del wizard (guía, no bloquea transiciones). */
    orden?: number;
    [key: string]: any;
  };
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const infoSchema = new Schema<IInfo>(
  {
    externalId: { type: String, required: true },
    type: { type: String, required: true },
    data: {
      id: { type: Number },
      nombre: { type: String },
      // Campos del ABM de Estados (ver IInfo). El resto de los tipos de info no los usa.
      color: { type: String },
      contratoFrameIds: { type: [String] },
      nombreEnContrato: { type: String },
      esImpositivo: { type: Boolean },
      orden: { type: Number },
    },
    name: { type: String, required: true },
  },
  {
    timestamps: true,
    strict: false,
  },
);

export const Info: Model<IInfo> = mongoose.model<IInfo>("Info", infoSchema);
