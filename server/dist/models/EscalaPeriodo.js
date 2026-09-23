import mongoose, { Schema } from "mongoose";
const escalaPeriodoSchema = new Schema({
    convenio: { type: String, required: true, trim: true },
    grupo: { type: Number, default: null },
    grupoId: { type: Schema.Types.ObjectId, ref: "ConvenioGrupo", default: null },
    categoriaId: { type: Schema.Types.ObjectId, ref: "Categoria", default: null },
    desde: { type: Date, required: true },
    hasta: { type: Date, default: null },
    basico: { type: Number, default: 0 },
    adicionalPct: { type: Number, default: null },
    presentismoPct: { type: Number, default: null },
    netoFactor: { type: Number, default: null },
    adicionalMonto: { type: Number, default: 0 },
    presentismoMonto: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    neto: { type: Number, default: null },
    totalLetras: { type: String, default: "" },
    netoLetras: { type: String, default: "" },
    actaAdicionalMonto: { type: Number, default: null },
    actaPresentismoMonto: { type: Number, default: null },
    actaTotal: { type: Number, default: null },
    actaNeto: { type: Number, default: null },
    diferencias: {
        type: [{ _id: false, campo: String, calculado: Number, acta: Number, delta: Number }],
        default: [],
    },
    acuerdoId: { type: Schema.Types.ObjectId, ref: "AcuerdoParitario", default: null },
    tramo: { type: String, default: "" },
    origen: { type: String, enum: ["acta", "excel", "manual", "estado-actual", "derivado"], default: "manual" },
    migracion: { type: String, default: "" },
    nota: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, collection: "convenio-escala-periodos" });
/**
 * Un grupo no puede tener dos escalas que arranquen el mismo día: serían dos sueldos para la misma fecha.
 *
 * `categoriaId` entra en la clave porque en los convenios SIN grupos (los de actores) la escala vive en la
 * categoría y `grupo` es `null` para todas: sin ese campo, la segunda categoría del convenio choca con la
 * primera y el índice rechazaría un dato perfectamente válido.
 *
 * La superposición PARCIAL no la puede impedir un índice —depende de `hasta`— y la valida el server con
 * `periodosSuperpuestos`.
 */
escalaPeriodoSchema.index({ convenio: 1, grupo: 1, categoriaId: 1, desde: 1 }, { unique: true });
escalaPeriodoSchema.index({ convenio: 1, desde: -1 });
export const EscalaPeriodo = mongoose.model("EscalaPeriodo", escalaPeriodoSchema);
