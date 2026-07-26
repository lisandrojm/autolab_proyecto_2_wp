import mongoose, { Schema, Document, Model } from "mongoose";

export interface IContratoFrame extends Document {
  externalId: string;
  name: string;
  /** Contenido del contrato redactado en la plataforma (HTML del editor, con variables `{{variable}}`). */
  content: string;
  data: {
    id: number;
    nombre: string;
    cantidadJornadas: number;
    multiplicadorDiario: number;
    esTiempoIndeterminado: boolean;
  };
  /** Si el contrato lleva membrete (logo + encabezado de empresa) y firma al generar el PDF. */
  usaMembrete: boolean;
  /** Contrato activo/inactivo (para habilitarlo o no en el catálogo). */
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const contratoFrameSchema = new Schema<IContratoFrame>(
  {
    externalId: { type: String },
    name: { type: String, required: true },
    content: {
      type: String,
      default: "",
      maxlength: 200000,
    },
    data: {
      id: { type: Number },
      nombre: { type: String },
      cantidadJornadas: { type: Number },
      multiplicadorDiario: { type: Number },
      esTiempoIndeterminado: { type: Boolean, default: false },
    },
    usaMembrete: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: "contratos-frame",
  }
);

export const ContratoFrame: Model<IContratoFrame> = mongoose.model<IContratoFrame>("ContratoFrame", contratoFrameSchema);
