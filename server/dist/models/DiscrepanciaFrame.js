import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", default: null },
    userProjectId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    contratoKey: { type: Schema.Types.ObjectId, default: null },
    posicion: { type: Number, required: true },
    campo: { type: String, enum: ["categoria_sat_id", "fecha_baja_contrato"], required: true },
    weprodu: { id: Schema.Types.Mixed, nombre: String },
    frame: { id: Schema.Types.Mixed, nombre: String },
    claveFrame: { type: String, default: "" },
    detectadaEl: { type: Date, required: true },
    ultimaVezEl: { type: Date, required: true },
    veces: { type: Number, default: 1 },
    resuelta: { type: Boolean, default: false },
    resueltaEl: { type: Date, default: null },
    resueltaPor: String,
    resolucion: String,
}, { timestamps: true, collection: "discrepancias_frame", minimize: false });
schema.index({ userProjectId: 1, contratoKey: 1, campo: 1, "frame.id": 1 }, { unique: true });
schema.index({ resuelta: 1, ultimaVezEl: -1 });
schema.index({ contratoKey: 1 });
export const DiscrepanciaFrame = mongoose.models.DiscrepanciaFrame || mongoose.model("DiscrepanciaFrame", schema);
export default DiscrepanciaFrame;
