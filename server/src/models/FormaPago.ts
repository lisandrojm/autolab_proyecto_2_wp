import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * FORMA DE PAGO (Configuración → Formas de pago). Mismo formato que los catálogos simples (`name`,
 * `externalId`, `data`) para que la administre el mismo ABM que Entidades Financieras; el `externalId`
 * es el CÓDIGO («TRANSFERENCIA_BANCARIA»). Las reglas, en `compartido/formasPago.ts`.
 *
 * Global, como los tipos de contrato (`Contrato`) que la habilitan.
 */
export interface IFormaPago extends Document {
  name: string;
  externalId: string;
  data: { id?: number; nombre: string };
  descripcion?: string;
  requiereDatosBancarios: boolean;
  requiereComprobante: boolean;
  /** Si se ofrece en los selectores. Inactiva NO se borra: los contratos que ya la tienen la conservan. */
  activo: boolean;
  /** Orden en los selectores (1, 2, 3…). */
  orden?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const formaPagoSchema = new Schema<IFormaPago>(
  {
    name: { type: String, required: true },
    externalId: { type: String, required: true },
    data: {
      id: { type: Number },
      nombre: { type: String },
    },
    descripcion: { type: String, default: "" },
    requiereDatosBancarios: { type: Boolean, default: false },
    requiereComprobante: { type: Boolean, default: false },
    activo: { type: Boolean, default: true },
    orden: { type: Number, default: null },
  },
  {
    timestamps: true,
    collection: "formas_pago",
  },
);

// Respaldo de la validación de la ruta (que es la que contesta 409 con el mensaje): código exacto y
// nombre sin distinguir mayúsculas.
formaPagoSchema.index({ externalId: 1 }, { unique: true });
formaPagoSchema.index({ name: 1 }, { unique: true, collation: { locale: "es", strength: 2 } });

export const FormaPago: Model<IFormaPago> = mongoose.model<IFormaPago>("FormaPago", formaPagoSchema);
