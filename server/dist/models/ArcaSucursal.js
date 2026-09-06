import mongoose, { Schema } from "mongoose";
const arcaSucursalSchema = new Schema({
    codigo: { type: String, required: true },
    domicilio: { type: String, required: true },
    localidad: { type: String, default: "" },
    codigoPostal: { type: String, default: "" },
    actividades: [
        {
            _id: false,
            codigo: { type: String, required: true },
            descripcion: { type: String, default: "" },
        },
    ],
    isActive: { type: Boolean, default: true },
}, {
    timestamps: true,
    collection: "arca-sucursales",
});
export const ArcaSucursal = mongoose.model("ArcaSucursal", arcaSucursalSchema);
