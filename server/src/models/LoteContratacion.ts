import mongoose, { Schema, Types } from "mongoose";

/**
 * UN LOTE DE CONTRATACIÓN: las N solicitudes que salieron juntas al contratar una plantilla de equipo.
 *
 * Cada solicitud apunta acá (`metadata.loteId`): así el Historial las agrupa con el nombre del equipo.
 *
 * IDEMPOTENCIA: el índice único `(tenantId, idempotencyKey)` es lo que evita duplicar un lote por un
 * doble toque o un reintento después de un corte de red. El cliente genera la clave una vez por
 * contratación y la repite en cada intento; el segundo choca contra el índice y recibe el lote que ya
 * existe, sin crear nada. Mismo patrón que `RenovacionContrato` (índice único + lectura del existente).
 */
export interface ILoteContratacion {
  tenantId: Types.ObjectId;
  plantillaEquipoId: Types.ObjectId;
  projectId: Types.ObjectId;
  /** El nombre de la plantilla AL CONTRATAR: renombrarla después no cambia cómo se llamó este lote. */
  nombrePlantilla: string;
  idempotencyKey: string;
  creadoPor: Types.ObjectId;
  solicitudIds: Types.ObjectId[];
  totales: { personas: number; jornadas: number; importe: number };
  createdAt?: Date;
  updatedAt?: Date;
}

const loteContratacionSchema = new Schema<ILoteContratacion>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    plantillaEquipoId: { type: Schema.Types.ObjectId, ref: "PlantillaEquipo", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    nombrePlantilla: { type: String, required: true },
    idempotencyKey: { type: String, required: true, maxlength: 100 },
    creadoPor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    solicitudIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    totales: {
      personas: { type: Number, default: 0 },
      jornadas: { type: Number, default: 0 },
      importe: { type: Number, default: 0 },
    },
  },
  { timestamps: true, collection: "lotes_contratacion" },
);

loteContratacionSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true });
loteContratacionSchema.index({ tenantId: 1, plantillaEquipoId: 1, createdAt: -1 });

export const LoteContratacion = mongoose.model<ILoteContratacion>("LoteContratacion", loteContratacionSchema);
