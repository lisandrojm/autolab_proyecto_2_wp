import mongoose, { Schema, Document, Model } from "mongoose";

export interface IObraSocial extends Document {
  /** Código RNOS (6 díg., posible cero a la izquierda) para el TXT de Alta masiva de AFIP.
   *  Es el mismo "ID Externo" genérico de los catálogos FRAME: para Obras Sociales, ese id
   *  siempre fue el código RNOS, así que no hace falta un campo separado. */
  externalId: string;
  name: string;
  data: {
    id: number;
    nombre: string;
    /**
     * Obra social a usar cuando la persona no tiene ninguna asignada. Sin esto, el contrato queda
     * sin código RNOS y no puede entrar en el TXT de alta masiva de AFIP. Solo una puede estar
     * marcada: al marcar una se desmarca la anterior (ver `PATCH /:id/por-defecto`).
     */
    porDefecto?: boolean;
  };
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
      porDefecto: { type: Boolean },
    },
  },
  {
    timestamps: true,
    collection: "obras-sociales",
  }
);

export const ObraSocial: Model<IObraSocial> = mongoose.model<IObraSocial>("ObraSocial", obraSocialSchema);
