import mongoose, { Schema, Document, Model } from "mongoose";

export interface IContratoFrame extends Document {
  externalId: string;
  name: string;
  data: {
    id: number;
    nombre: string;
    rutaArchivo: string;
    cantidadJornadas: number;
    multiplicadorDiario: number;
    fileUrl: string;
    fileName: string;
    esTiempoIndeterminado: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const contratoFrameSchema = new Schema<IContratoFrame>(
  {
    externalId: { type: String },
    name: { type: String, required: true },
    data: {
      id: { type: Number },
      nombre: { type: String },
      rutaArchivo: { type: String },
      cantidadJornadas: { type: Number },
      multiplicadorDiario: { type: Number },
      fileUrl: { type: String, default: "" },
      fileName: { type: String, default: "" },
      esTiempoIndeterminado: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
    collection: "contratos-frame",
  }
);

export const ContratoFrame: Model<IContratoFrame> = mongoose.model<IContratoFrame>("ContratoFrame", contratoFrameSchema);
