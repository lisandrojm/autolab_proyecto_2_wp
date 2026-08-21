import { Schema, model, Document, Types } from "mongoose";
import { TIPOS_NOMENCLATURA, TipoNomenclatura } from "../utils/nomenclatura.js";

/**
 * El patrón de nombre de archivo de un tipo de documento, por tenant.
 *
 * Una fila por (tenant, tipo). Si no hay fila, rige `PATRON_POR_DEFECTO` — que reproduce exactamente
 * los nombres que la plataforma generaba antes de que esto existiera. Por eso no hace falta sembrar
 * nada al crear un tenant ni migrar los que ya existen: sin configurar, todo sigue igual.
 *
 * No se guarda un patrón inválido: `validarPatron()` corre en la ruta antes de escribir. Las reglas y
 * el porqué están en `utils/nomenclatura.ts`.
 */
export interface INomenclaturaArchivo extends Document {
  tenantId: Types.ObjectId;
  tipo: TipoNomenclatura;
  patron: string;
  /** Quién lo cambió por última vez. El nombre de archivo es un dato que después se audita. */
  actualizadoPor?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const nomenclaturaArchivoSchema = new Schema<INomenclaturaArchivo>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    tipo: { type: String, enum: TIPOS_NOMENCLATURA as unknown as string[], required: true },
    patron: { type: String, required: true, trim: true },
    actualizadoPor: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// Una sola configuración por tipo y por tenant: dos filas para el mismo tipo harían que el nombre
// dependiera de cuál se lea primero.
nomenclaturaArchivoSchema.index({ tenantId: 1, tipo: 1 }, { unique: true });

export const NomenclaturaArchivo = model<INomenclaturaArchivo>("NomenclaturaArchivo", nomenclaturaArchivoSchema);
export default NomenclaturaArchivo;
