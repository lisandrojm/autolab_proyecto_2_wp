import { Schema, model } from "mongoose";
const antiguedadArcaSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    cuil: { type: String, required: true, match: /^\d{11}$/ },
    empleadoraCuit: { type: String, default: null },
    apellidoNombre: { type: String, default: "" },
    primeraAlta: { type: Date, required: true },
    ultimaFecha: { type: Date, required: true },
    antiguedadDesdePrimeraAlta: {
        dias: { type: Number, required: true },
        anios: { type: Number, required: true },
    },
    diasTrabajados: { type: Number, required: true },
    aniosTrabajados: { type: Number, required: true },
    cantidadContratos: { type: Number, required: true },
    tieneRelacionAbierta: { type: Boolean, default: false },
    empresas: { type: [String], default: [] },
    calculadoEl: { type: Date, required: true },
}, { timestamps: true, collection: "antiguedad_arca" });
// Una fila por persona y empleadora, más la global (empleadoraCuit null). Único para que el recálculo
// sea un upsert y nunca deje dos filas distintas para la misma persona.
antiguedadArcaSchema.index({ tenantId: 1, cuil: 1, empleadoraCuit: 1 }, { unique: true });
// El listado de la pantalla filtra por empleadora y busca por nombre.
antiguedadArcaSchema.index({ tenantId: 1, empleadoraCuit: 1, apellidoNombre: 1 });
export const AntiguedadArca = model("AntiguedadArca", antiguedadArcaSchema);
export default AntiguedadArca;
