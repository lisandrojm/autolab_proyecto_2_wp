import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Contrato: el tipo de contrato real (Jornada, Plazo fijo 5x7, Tiempo Indeterminado, ...), con su
 * configuración de jornadas/multiplicador/vigencia. Es la unidad que se elige en el wizard de
 * Agregar/Configurar miembro.
 *
 * Distinto de `ContratoFrame` (la Plantilla): la Plantilla es el documento PDF en sí (contenido +
 * membrete) y apunta a un Contrato vía `contratoId`. Un Contrato puede tener varias Plantillas
 * (por ejemplo variantes con/sin membrete, o por empresa); el wizard resuelve cuál usar.
 */
export interface IContrato extends Document {
  name: string;
  data: {
    cantidadJornadas: number;
    multiplicadorDiario: number;
    esTiempoIndeterminado: boolean;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const contratoSchema = new Schema<IContrato>(
  {
    name: { type: String, required: true },
    data: {
      cantidadJornadas: { type: Number, default: 0 },
      multiplicadorDiario: { type: Number, default: 0 },
      esTiempoIndeterminado: { type: Boolean, default: false },
    },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: "contratos",
  },
);

export const Contrato: Model<IContrato> = mongoose.model<IContrato>("Contrato", contratoSchema);
