import { Schema, model } from "mongoose";
import { TIPOS_NOMENCLATURA } from "../utils/nomenclatura.js";
const nomenclaturaArchivoSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    tipo: { type: String, enum: TIPOS_NOMENCLATURA, required: true },
    patron: { type: String, required: true, trim: true },
    actualizadoPor: { type: Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });
// Una sola configuración por tipo y por tenant: dos filas para el mismo tipo harían que el nombre
// dependiera de cuál se lea primero.
nomenclaturaArchivoSchema.index({ tenantId: 1, tipo: 1 }, { unique: true });
export const NomenclaturaArchivo = model("NomenclaturaArchivo", nomenclaturaArchivoSchema);
export default NomenclaturaArchivo;
