import mongoose, { Schema } from "mongoose";
const historialEquipoSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    campo: { type: String, enum: ["areas", "rol"], required: true },
    antes: { type: Schema.Types.Mixed },
    despues: { type: Schema.Types.Mixed },
    origen: { type: String, required: true },
    payload: { type: Schema.Types.Mixed },
    por: { type: Schema.Types.ObjectId, ref: "User" },
    porNombre: { type: String },
    el: { type: Date, required: true, default: () => new Date() },
}, { collection: "historial_equipo" });
historialEquipoSchema.index({ projectId: 1, userId: 1, el: -1 });
export const HistorialEquipo = mongoose.model("HistorialEquipo", historialEquipoSchema);
