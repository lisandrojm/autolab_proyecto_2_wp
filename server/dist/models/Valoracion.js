import mongoose, { Schema } from "mongoose";
const valoracionSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    externalId: { type: String },
    name: { type: String, required: true },
    data: {
        id: { type: Number },
        nombre: { type: String },
    },
    orden: { type: Number, default: null },
    margenDesde: { type: Number, default: null },
    margenHasta: { type: Number, default: null },
    color: { type: String, default: "" },
    esDefault: { type: Boolean, default: false },
    // Ausente cuenta como activa: lo que se cargó antes de que existiera el campo no se apaga solo.
    activo: { type: Boolean, default: true },
}, {
    timestamps: true,
    collection: "valoraciones",
});
// El nombre identifica a la valoración dentro del tenant: dos «Oro» en la misma productora no son
// dos niveles, son un error de carga.
valoracionSchema.index({ tenantId: 1, name: 1 }, { unique: true });
// Por `orden` se recorren los rangos al resolver, y es el orden en que se listan.
valoracionSchema.index({ tenantId: 1, orden: 1 });
export const Valoracion = mongoose.model("Valoracion", valoracionSchema);
