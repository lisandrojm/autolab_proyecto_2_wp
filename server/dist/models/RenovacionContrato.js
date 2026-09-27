import mongoose, { Schema } from "mongoose";
const renovacionContratoSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userProjectId: { type: Schema.Types.ObjectId, ref: "UserProject", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    fechaBajaContrato: { type: String, required: true },
    indiceContrato: { type: Number, required: true, default: 0 },
    decision: { type: String, enum: ["renovar", "dejar_vencer"], required: true },
    solicitudId: { type: Schema.Types.ObjectId, ref: "User" },
    decididoPor: { type: Schema.Types.ObjectId, ref: "User" },
    decididoPorNombre: { type: String },
    decididoEl: { type: Date, required: true },
}, { timestamps: true, collection: "renovaciones_contrato" });
/*
  El índice único LLEVA LA POSICIÓN. Sin ella, dos contratos de la misma asignación que terminan el
  mismo día comparten registro y la decisión sobre uno se aplica al otro.

  El índice viejo —sin `indiceContrato`— hay que borrarlo a mano: Mongoose crea los que faltan pero no
  saca los que sobran, y mientras esté, el segundo contrato choca contra él.
  Ver `scripts/indiceRenovaciones.ts`.
*/
renovacionContratoSchema.index({ tenantId: 1, userProjectId: 1, fechaBajaContrato: 1, indiceContrato: 1 }, { unique: true });
export const RenovacionContrato = mongoose.model("RenovacionContrato", renovacionContratoSchema);
