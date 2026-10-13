import { Schema, model } from "mongoose";
const relacionLaboralArcaSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    empleadoraCuit: { type: String, required: true, match: /^\d{11}$/ },
    empleadoraCompanyId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    cuil: { type: String, required: true, match: /^\d{11}$/ },
    apellidoNombre: { type: String, default: "" },
    obraSocial: { type: String, default: "" },
    modalidadContrato: { type: String, default: "" },
    actividadLaboral: { type: String, default: "" },
    puestoDesempenado: { type: String, default: "" },
    retribucionPactada: { type: Number, default: null },
    modLiquidacion: { type: String, default: "" },
    trabajadorAgropecuario: { type: Boolean, default: false },
    fechaInicio: { type: Date, required: true },
    fechaFin: { type: Date, default: null },
    situacionBaja: { type: String, default: "" },
    convenioColectivo: { type: String, default: "" },
    categoria: { type: String, default: "" },
    tipoServicio: { type: String, default: "" },
    origen: { type: String, enum: ["seed-dropbox", "sync"], required: true },
    sincronizadoEl: { type: Date, required: true },
    rawLinea: { type: String, default: "" },
}, { timestamps: true, collection: "relaciones_laborales_arca" });
// La clave natural (ver arriba). Único: el upsert del seed y del sync escribe siempre sobre esta clave.
relacionLaboralArcaSchema.index({ tenantId: 1, empleadoraCuit: 1, cuil: 1, fechaInicio: 1 }, { unique: true });
// La antigüedad se recalcula por persona: todas las relaciones de un CUIL, de todas las empleadoras.
relacionLaboralArcaSchema.index({ tenantId: 1, cuil: 1 });
export const RelacionLaboralArca = model("RelacionLaboralArca", relacionLaboralArcaSchema);
export default RelacionLaboralArca;
