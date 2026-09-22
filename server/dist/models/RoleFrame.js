import mongoose, { Schema } from "mongoose";
const roleFrameSchema = new Schema({
    externalId: { type: String, required: true },
    data: {
        rol: {
            id: { type: Number },
            nombre: { type: String },
        },
        categoriasSat: [
            {
                valoracionId: { type: Schema.Types.ObjectId, ref: "Valoracion", default: null },
                id: { type: Number },
                numeroCategoria: { type: Number },
                sueldoBruto: { type: Number },
                sueldoBrutoLetras: { type: String },
                neto: { type: Number },
                sueldoNetoLetras: { type: String },
                fechaActualizacion: { type: Schema.Types.Mixed },
                codigoAfip: { type: Number },
                presentismo: { type: Number },
                sueldoBasico: { type: Number },
                sueldoAdicional: { type: Number },
                nombre: { type: String },
            },
        ],
    },
    name: { type: String, required: true },
}, {
    timestamps: true,
});
export const RoleFrame = mongoose.model("RoleFrame", roleFrameSchema, "roles_frame");
