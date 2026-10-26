import mongoose, { Schema } from "mongoose";
const contratoFrameSchema = new Schema({
    externalId: { type: String },
    name: { type: String, required: true },
    content: {
        type: String,
        default: "",
        maxlength: 200000,
    },
    contratoIds: { type: [{ type: Schema.Types.ObjectId, ref: "Contrato" }], default: undefined },
    contratoId: { type: Schema.Types.ObjectId, ref: "Contrato" },
    data: {
        id: { type: Number },
        nombre: { type: String },
        cantidadJornadas: { type: Number },
        multiplicadorDiario: { type: Number },
        esTiempoIndeterminado: { type: Boolean, default: false },
    },
    usaMembrete: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    esCustom: { type: Boolean, default: false },
    delSistema: { type: Boolean, default: false },
    versionContenido: { type: Number, default: 1 },
}, {
    timestamps: true,
    collection: "contratos-frame",
});
/** Cada cambio de contenido sube la versión (la posición de la firma guardada con cada documento dice con cuál se generó). */
contratoFrameSchema.pre("save", function () {
    if (!this.isNew && this.isModified("content"))
        this.versionContenido = (Number(this.versionContenido) || 1) + 1;
});
export const ContratoFrame = mongoose.model("ContratoFrame", contratoFrameSchema);
