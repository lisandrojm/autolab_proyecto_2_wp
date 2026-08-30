import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    entidad: { type: String, required: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    convenios: [{ type: String, trim: true }],
    patronIncluir: { type: String, required: true, trim: true },
    patronExcluir: { type: String, default: "", trim: true },
    activa: { type: Boolean, default: true },
    /**
     * `undefined` significa NUNCA REVISADA, y de eso depende la línea de base.
     *
     * La primera revisión de una fuente registra todo lo que encuentra como YA VISTO: sin eso, dar de
     * alta el SATSAID reportaría treinta acuerdos viejos como novedad, y un sistema de avisos que
     * arranca gritando cosas que no importan ya perdió. No hace falta un modo especial ni un botón
     * aparte — es una condición sobre este campo, y sirve igual para la fuente que agreguen el mes
     * que viene.
     */
    ultimaRevision: { type: Date },
    ultimoResultado: { type: String, enum: ["ok", "sin_enlaces", "error_red", "error_parseo"] },
    ultimoError: { type: String, default: "" },
    enlacesUltimaExitosa: { type: Number },
}, { timestamps: true, collection: "fuentes-paritaria" });
export const FuenteParitaria = mongoose.model("FuenteParitaria", schema);
