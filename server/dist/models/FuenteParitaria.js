import mongoose, { Schema } from "mongoose";
const schema = new Schema({
    entidad: { type: String, required: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    // El default es el tipo que ya existía: las fuentes cargadas antes de este campo son todas
    // páginas de listado, y ninguna cambia de comportamiento por la migración.
    tipo: { type: String, enum: ["listado_html", "manual"], default: "listado_html" },
    url: { type: String, required: true, trim: true },
    convenios: [{ type: String, trim: true }],
    // Obligatorio solo donde significa algo: una fuente `manual` no se raspa, así que pedirle un
    // patrón sería pedir que se invente una regla para un mecanismo que no va a correr.
    patronIncluir: {
        type: String,
        trim: true,
        default: "",
        required: function () {
            return this.tipo !== "manual";
        },
    },
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
