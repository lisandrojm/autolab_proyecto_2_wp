import mongoose, { Schema } from "mongoose";
/** Los campos de un puesto que un equipo puede pisar (todos menos el rol y el orden). */
export const CAMPOS_DE_CONDICIONES = ["areaId", "shiftId", "inTime", "outTime", "diasSemana", "diasPorSemana", "diasRotativos", "categoriaSatId", "dailyRateManual", "comentarios", "contratoId", "nombreContrato", "tipoImpositivo"];
/** Las condiciones que un equipo pone para todos sus puestos. */
export const CAMPOS_DE_EQUIPO = ["contratoId", "nombreContrato", "tipoImpositivo", "areaId", "shiftId", "inTime", "outTime", "diasSemana", "diasPorSemana", "diasRotativos"];
const puestoSchema = new Schema({
    rolesFrame: [{ type: Schema.Types.ObjectId, ref: "RoleFrame" }],
    orden: { type: Number, default: 0 },
    areaId: { type: Schema.Types.ObjectId, ref: "Area", default: null },
    shiftId: { type: Schema.Types.ObjectId, ref: "Shift", default: null },
    inTime: { type: String, default: null },
    outTime: { type: String, default: null },
    diasSemana: { type: [Number], default: [] },
    diasPorSemana: { type: Number, default: null },
    diasRotativos: { type: Boolean, default: false },
    categoriaSatId: { type: Schema.Types.ObjectId, ref: "CategoriaSat", default: null },
    dailyRateManual: { type: Number, default: null },
    escalaAlFijar: { type: Number, default: null },
    comentarios: { type: String, default: null },
    contratoId: { type: Schema.Types.ObjectId, ref: "Contrato", default: null },
    nombreContrato: { type: String, default: null },
    tipoImpositivo: { type: String, default: null },
});
const equipoSchema = new Schema({
    nombre: { type: String, required: true, trim: true, maxlength: 80 },
    condiciones: { type: Schema.Types.Mixed, default: null },
    asignaciones: [
        {
            _id: false,
            puestoId: { type: Schema.Types.ObjectId, required: true },
            userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
            // Mixed: sólo las claves pisadas (un esquema con campos llenaría arrays vacíos que no son «pisar»).
            condiciones: { type: Schema.Types.Mixed, default: null },
            excluido: { type: Boolean, default: false },
            reemplazo: { type: Schema.Types.Mixed, default: null },
            reemplazadoDePersonaId: { type: Schema.Types.ObjectId, ref: "User", default: null },
            reemplazadoEl: { type: Date, default: null },
        },
    ],
    ultimaContratacionEl: { type: Date, default: null },
});
const plantillaEquipoSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    alcance: { type: String, enum: ["personal", "general"], default: "personal" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    empresaContratoId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    convenioId: { type: Schema.Types.ObjectId, default: null },
    contratoId: { type: Schema.Types.ObjectId, ref: "Contrato", default: null },
    nombreContrato: { type: String, default: "" },
    tipoImpositivo: { type: String, default: "" },
    comentarios: { type: String, default: "" },
    integrantes: { type: [puestoSchema], default: [] },
    equipos: { type: [equipoSchema], default: [] },
    activo: { type: Boolean, default: true },
    creadoPor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ultimaContratacionEl: { type: Date, default: null },
    ultimoLoteId: { type: Schema.Types.ObjectId, ref: "LoteContratacion", default: null },
}, { timestamps: true, collection: "plantillas_equipo" });
plantillaEquipoSchema.index({ tenantId: 1, creadoPor: 1, projectId: 1, activo: 1 });
// El nombre no se repite entre las plantillas vivas (las borradas quedan con `activo: false`): las de un
// supervisor, dentro de su proyecto; las generales, en todo el tenant.
plantillaEquipoSchema.index({ tenantId: 1, creadoPor: 1, projectId: 1, nombre: 1 }, { unique: true, name: "nombre_personal_unico", partialFilterExpression: { activo: true, alcance: "personal" } });
plantillaEquipoSchema.index({ tenantId: 1, nombre: 1 }, { unique: true, name: "nombre_general_unico", partialFilterExpression: { activo: true, alcance: "general" } });
export const PlantillaEquipo = mongoose.model("PlantillaEquipo", plantillaEquipoSchema);
