import mongoose, { Schema } from "mongoose";
const permisosEnDesarrolloSchema = new Schema({
    clave: { type: String, required: true, unique: true, default: "global" },
    permisos: { type: [String], default: [] },
}, { timestamps: true });
export const PermisosEnDesarrollo = mongoose.model("PermisosEnDesarrollo", permisosEnDesarrolloSchema);
/** La lista actual. Sin documento todavía, ninguno está en desarrollo. */
export async function permisosEnDesarrollo() {
    const doc = await PermisosEnDesarrollo.findOne({ clave: "global" }).select("permisos").lean();
    return doc?.permisos || [];
}
