import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICategoriaSat extends Document {
  externalId: string;
  name: string;
  data: {
    id: number;
    numeroCategoria: number;
    sueldoBruto: number;
    sueldoBrutoLetras: string;
    neto: number;
    sueldoNetoLetras: string;
    fechaActualizacion: Date | string;
    codigoAfip: number;
    presentismo: number;
    sueldoBasico: number;
    sueldoAdicional: number;
    nombre: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const categoriaSatSchema = new Schema<ICategoriaSat>(
  {
    externalId: { type: String, required: true },
    name: { type: String, required: true },
    data: {
      id: { type: Number },
      numeroCategoria: { type: Number },
      sueldoBruto: { type: Number },
      sueldoBrutoLetras: { type: String },
      neto: { type: Number },
      sueldoNetoLetras: { type: String },
      fechaActualizacion: { type: Schema.Types.Mixed },
      codigoAfip: { type: Number },
      presentismo: { type: Number },
      sueldoBasico: { type: Number },
      sueldoAdicional: { type: Number },
      nombre: { type: String },
    },
  },
  {
    timestamps: true,
    collection: "categorias-sat",
  }
);

export const CategoriaSat: Model<ICategoriaSat> = mongoose.model<ICategoriaSat>("CategoriaSat", categoriaSatSchema);
