import mongoose, { Schema } from "mongoose";
const formaPagoSchema = new Schema({
    name: { type: String, required: true },
    externalId: { type: String, required: true },
    data: {
        id: { type: Number },
        nombre: { type: String },
    },
    descripcion: { type: String, default: "" },
    requiereDatosBancarios: { type: Boolean, default: false },
    requiereComprobante: { type: Boolean, default: false },
    activo: { type: Boolean, default: true },
    orden: { type: Number, default: null },
}, {
    timestamps: true,
    collection: "formas_pago",
});
// Respaldo de la validación de la ruta (que es la que contesta 409 con el mensaje): código exacto y
// nombre sin distinguir mayúsculas.
formaPagoSchema.index({ externalId: 1 }, { unique: true });
formaPagoSchema.index({ name: 1 }, { unique: true, collation: { locale: "es", strength: 2 } });
export const FormaPago = mongoose.model("FormaPago", formaPagoSchema);
