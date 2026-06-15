import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICentroCosto extends Document {
  externalId: string;
  name: string;
  data: {
    id: number;
    nombre: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const centroCostoSchema = new Schema<ICentroCosto>(
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
    collection: "centros-costo",
  }
);

export const CentroCosto: Model<ICentroCosto> = mongoose.model<ICentroCosto>("CentroCosto", centroCostoSchema);
