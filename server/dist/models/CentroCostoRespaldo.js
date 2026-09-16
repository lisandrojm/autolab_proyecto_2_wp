import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    ejecutadoPor: { type: Schema.Types.ObjectId, ref: "User" },
    origen: { type: String, enum: ["pantalla", "script"], default: "pantalla" },
    modo: { type: String },
    catalogoAnterior: { type: [Schema.Types.Mixed], default: [] },
    proyectos: [
        {
            _id: false,
            projectId: { type: Schema.Types.ObjectId, ref: "Project" },
            nombre: String,
            antes: Number,
            despues: { type: Number, default: null },
        },
    ],
    sinEquivalente: [
        {
            _id: false,
            projectId: { type: Schema.Types.ObjectId, ref: "Project" },
            nombre: String,
            centroCostoId: Number,
            motivo: String,
        },
    ],
}, { timestamps: true, collection: "centros_costo_respaldos" });
export const CentroCostoRespaldo = mongoose.model("CentroCostoRespaldo", schema);
