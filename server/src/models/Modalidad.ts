import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Modalidad de trabajo de un contrato: Presencial, Remoto, Híbrido…
 *
 * ES DEL TENANT, como Valoraciones: cada productora arma su lista. Se siembran Presencial (la por
 * defecto), Remoto e Híbrido la primera vez que se lista (ver `services/modalidades.ts`).
 *
 * El contrato guarda `modalidadId` + `nombre_modalidad` (la foto del nombre, como `nombre_turno`).
 * Un contrato SIN modalidad —todos los anteriores a esto, y los de flujos que no la eligen— se lee
 * como la por defecto del tenant: es lo que dice la regla «por defecto, presencial».
 */
export interface IModalidad extends Document {
  tenantId: mongoose.Types.ObjectId;
  externalId: string;
  name: string;
  data: { id?: number; nombre?: string };
  orden?: number | null;
  /** La que se elige sola al contratar y la que vale para un contrato sin modalidad. Una sola. */
  esDefault?: boolean;
  /** Apagada no se ofrece en contratos nuevos; los que ya la tienen siguen mostrando su nombre. */
  activo?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const modalidadSchema = new Schema<IModalidad>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    externalId: { type: String },
    name: { type: String, required: true },
    data: {
      id: { type: Number },
      nombre: { type: String },
    },
    orden: { type: Number, default: null },
    esDefault: { type: Boolean, default: false },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "modalidades" },
);

modalidadSchema.index({ tenantId: 1, name: 1 }, { unique: true });
modalidadSchema.index({ tenantId: 1, orden: 1 });

export const Modalidad: Model<IModalidad> = mongoose.model<IModalidad>("Modalidad", modalidadSchema);
