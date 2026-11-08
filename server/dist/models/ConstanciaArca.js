import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    clave: { type: String, required: true },
    cuil: { type: String, required: true },
    nombre: { type: String, default: "" },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    userProjectId: { type: Schema.Types.ObjectId, required: true },
    contractIndex: { type: Number, required: true },
    empresaId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    empresaCuit: { type: String, default: "" },
    empresaRazonSocial: { type: String, default: "" },
    fechaAlta: { type: String, required: true },
    fechaBaja: { type: String, default: "" },
    presentadaEl: { type: Date, default: null },
    logId: { type: Schema.Types.ObjectId, default: null },
    estado: { type: String, required: true },
    tipoConstancia: { type: String, default: null },
    mismoDia: { type: Boolean, default: false },
    intentos: [{ _id: false, fecha: Date, resultado: String, detalle: String, manual: Boolean }],
    proximoIntentoEl: { type: Date, default: null },
    motivoRevision: { type: String, default: null },
    documento: {
        type: new Schema({
            codigo: String,
            nombre: String,
            path: String,
            dropboxId: String,
            carpeta: { type: String, default: null },
            vaAFirma: Boolean,
            firmadaEl: { type: Date, default: null },
            archivadaEn: { type: String, default: null },
            ubicadoEl: { type: Date, default: null },
            noUbicadoDesde: { type: Date, default: null },
            fueraDelCircuito: { type: Boolean, default: false },
        }, { _id: false }),
        default: null,
    },
    redescarga: {
        type: new Schema({
            pedidaEl: Date,
            porUsuarioId: { type: String, default: null },
            validadaElAnterior: { type: Date, default: null },
            documentoAnterior: { type: Schema.Types.Mixed, default: null },
            enCurso: { type: Boolean, default: false },
            terminadaEl: { type: Date, default: null },
        }, { _id: false }),
        default: null,
    },
    historial: [{ _id: false, estado: String, fecha: Date, motivo: String }],
}, { timestamps: true, collection: "constancias_arca" });
// La idempotencia: una sola constancia por persona + empleadora + fecha de alta, por más corridas que haya.
schema.index({ tenantId: 1, clave: 1 }, { unique: true });
schema.index({ tenantId: 1, estado: 1 });
schema.index({ tenantId: 1, "documento.codigo": 1 });
export const ConstanciaArca = mongoose.model("ConstanciaArca", schema);
