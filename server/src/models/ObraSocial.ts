import mongoose, { Schema, Document, Model } from "mongoose";

export interface IObraSocial extends Document {
  externalId: string;
  name: string;
  data: {
    id: number;
    nombre: string;
  };
  /** Código RNOS (6 díg.) para el TXT de Alta masiva de AFIP. Se carga por obra social. */
  codigoRnos?: string;
  createdAt: Date;
  updatedAt: Date;
}

const obraSocialSchema = new Schema<IObraSocial>(
  {
    externalId: { type: String },
    name: { type: String, required: true },
    data: {
      id: { type: Number },
      nombre: { type: String },
    },
    codigoRnos: { type: String },
  },
  {
    timestamps: true,
    collection: "obras-sociales",
  }
);

export const ObraSocial: Model<IObraSocial> = mongoose.model<IObraSocial>("ObraSocial", obraSocialSchema);
