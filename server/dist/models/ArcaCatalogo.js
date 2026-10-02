import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    tabla: { type: String, required: true },
    filtroPadre: { type: String, default: "" },
    codigo: { type: String, required: true },
    codigoPadded: { type: String, default: "" },
    largo: { type: Number, default: 0 },
    alcance: { type: String, default: "" },
    descripcion: { type: String, default: "" },
    vigente: { type: Boolean, default: true },
    primeraVezVisto: { type: Date, default: Date.now },
    ultimaVezVisto: { type: Date, default: Date.now },
    origen: { type: String, enum: ["csv", "arca"], default: "csv" },
    fuentes: [{ _id: false, empresaCuit: String, ultimaVezVisto: Date }],
    orden: { type: Number, default: 0 },
}, { timestamps: true, collection: "arca_catalogo" });
schema.index({ tabla: 1, filtroPadre: 1, codigo: 1 }, { unique: true });
export const ArcaCatalogo = mongoose.model("ArcaCatalogo", schema);
const lecturaSchema = new Schema({
    usuarioId: { type: Schema.Types.ObjectId, ref: "User" },
    fecha: { type: Date, default: Date.now },
    empresaCuit: { type: String, default: null },
    empresaRazonSocial: String,
    origen: { type: String, enum: ["csv", "arca"], required: true },
    porTabla: { type: Schema.Types.Mixed, default: {} },
    filas: { type: Schema.Types.Mixed },
    tablasLeidas: [String],
    filtrosLeidos: { type: Schema.Types.Mixed },
    diff: { type: Schema.Types.Mixed, default: { nuevos: [], dejaronDePublicarse: [], descripcionCambiada: [] } },
    impacto: { type: Schema.Types.Mixed },
    estado: { type: String, enum: ["pendiente", "aplicada", "descartada"], default: "pendiente" },
    aplicadaPor: { type: Schema.Types.ObjectId, ref: "User" },
    aplicadaEl: Date,
    error: String,
}, { timestamps: true, collection: "arca_catalogo_lecturas" });
lecturaSchema.index({ empresaCuit: 1, fecha: -1 });
export const ArcaCatalogoLectura = mongoose.model("ArcaCatalogoLectura", lecturaSchema);
