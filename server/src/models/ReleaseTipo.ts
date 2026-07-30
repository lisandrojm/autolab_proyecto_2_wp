import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * ReleaseTipo: el tipo de release (análogo a `Contrato` para `ContratoFrame`). "Plantillas |
 * Release" (colección `Release`) apunta a un ReleaseTipo vía `releaseTipoId`; ahí vive el
 * documento PDF en sí. Un ReleaseTipo puede tener varios Release (variantes).
 *
 * A diferencia de `Contrato` (sin tenant), acá sí hay `tenantId`: `Release` ya está scopeado por
 * tenant, así que el tipo también lo está para no mezclar catálogos entre tenants.
 */
export interface IReleaseTipo extends Document {
  tenantId: Types.ObjectId;
  name: string;
  isActive: boolean;
  /** Si los Release de este tipo se envían a firmar (p. ej. por Dropbox Sign). */
  requiereFirma: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const releaseTipoSchema = new Schema<IReleaseTipo>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    // `unique` compuesto con tenantId evita duplicados aunque dos requests concurrentes disparen
    // el backfill al mismo tiempo (ver `ensureReleaseTiposBackfilled` en routes/releaseTipos.ts).
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    requiereFirma: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: "release-tipos",
  },
);

releaseTipoSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const ReleaseTipo: Model<IReleaseTipo> = mongoose.model<IReleaseTipo>("ReleaseTipo", releaseTipoSchema);
