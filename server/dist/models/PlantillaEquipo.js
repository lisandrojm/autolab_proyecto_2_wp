import mongoose, { Schema } from "mongoose";
const integranteSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    rolesFrame: [{ type: Schema.Types.ObjectId, ref: "RoleFrame" }],
    orden: { type: Number, default: 0 },
    categoriaSatId: { type: Schema.Types.ObjectId, ref: "CategoriaSat", default: null },
    inTime: { type: String, default: null },
    outTime: { type: String, default: null },
    dailyRateManual: { type: Number, default: null },
    escalaAlFijar: { type: Number, default: null },
    comentarios: { type: String, default: null },
    reemplazadoDePersonaId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reemplazadoEl: { type: Date, default: null },
});
const plantillaEquipoSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    empresaContratoId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    convenioId: { type: Schema.Types.ObjectId, default: null },
    contratoId: { type: Schema.Types.ObjectId, ref: "Contrato", default: null },
    nombreContrato: { type: String, default: "" },
    tipoImpositivo: { type: String, default: "" },
    areaShiftAssignments: [
        {
            _id: false,
            areaId: { type: Schema.Types.ObjectId, ref: "Area" },
            shiftIds: [{ type: Schema.Types.ObjectId, ref: "Shift" }],
        },
    ],
    inTime: { type: String, default: "" },
    outTime: { type: String, default: "" },
    diasSemana: { type: [Number], default: [] },
    diasPorSemana: { type: Number, default: null },
    diasRotativos: { type: Boolean, default: false },
    comentarios: { type: String, default: "" },
    integrantes: { type: [integranteSchema], default: [] },
    activo: { type: Boolean, default: true },
    creadoPor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ultimaContratacionEl: { type: Date, default: null },
    ultimoLoteId: { type: Schema.Types.ObjectId, ref: "LoteContratacion", default: null },
}, { timestamps: true, collection: "plantillas_equipo" });
plantillaEquipoSchema.index({ tenantId: 1, projectId: 1, activo: 1 });
// El nombre no se repite dentro del proyecto entre las plantillas vivas (las borradas quedan con `activo: false`).
plantillaEquipoSchema.index({ tenantId: 1, projectId: 1, nombre: 1 }, { unique: true, partialFilterExpression: { activo: true } });
export const PlantillaEquipo = mongoose.model("PlantillaEquipo", plantillaEquipoSchema);
