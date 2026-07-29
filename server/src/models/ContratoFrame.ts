import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * ContratoFrame = la Plantilla: el documento PDF (contenido + membrete) de un Contrato.
 * `contratoId` apunta al Contrato (colección `contratos`) que define el tipo real (jornadas,
 * multiplicador, tiempo indeterminado). Los campos de `data` se mantienen sincronizados con los
 * del Contrato elegido (se copian al guardar) para que el resto del código, que ya lee
 * `data.cantidadJornadas` / `data.esTiempoIndeterminado` de la Plantilla, siga funcionando igual.
 */
export interface IContratoFrame extends Document {
  externalId: string;
  name: string;
  /** Contenido del contrato redactado en la plataforma (HTML del editor, con variables `{{variable}}`). */
  content: string;
  /** Contrato (tipo) al que pertenece esta plantilla. */
  contratoId?: Types.ObjectId;
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
    contratoId: { type: Schema.Types.ObjectId, ref: "Contrato" },
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
