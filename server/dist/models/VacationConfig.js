import mongoose, { Schema } from "mongoose";
const EmbeddedOverlapSchema = new Schema({
    areaId: { type: Schema.Types.ObjectId, ref: "Area" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    clientId: { type: Schema.Types.ObjectId, ref: "Client" },
    roleFrameId: { type: Schema.Types.ObjectId, ref: "RoleFrame" },
    maxSimultaneousUsers: { type: Number, required: true, min: 1 },
    description: { type: String },
    isActive: { type: Boolean, default: true },
    useActiveContractSchedule: { type: Boolean, default: false },
}, { _id: true });
// ─────────────────────────────────────────────────────────────────────────────
// VacationConfig Schema
// ─────────────────────────────────────────────────────────────────────────────
const VacationConfigSchema = new Schema({
    tenantId: {
        type: Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
        unique: true,
        index: true,
    },
    diasBeneficio: {
        type: Number,
        required: false,
        min: 0,
    },
    maxDiasGozados: {
        type: Number,
        required: false,
        min: 0,
    },
    permiteArrastre: {
        type: Boolean,
        required: true,
        default: false,
    },
    maxDiasArrastre: {
        type: Number,
        required: false,
        min: 0,
    },
    vencimientoArrastreDias: {
        type: Number,
        required: false,
        min: 0,
    },
    maxDiasHabiles: {
        type: Number,
        required: false,
        min: 0,
    },
    anticipacionMinimaDias: {
        type: Number,
        required: false,
        min: 0,
    },
    permiteFraccionadas: {
        type: Boolean,
        required: true,
        default: true,
    },
    minDiasFraccion: {
        type: Number,
        required: true,
        default: 7,
        min: 1,
    },
    diasCorridos: {
        type: Boolean,
        required: true,
        default: false,
    },
    // Ventana anual de goce. Los defaults hacen que un tenant que nunca la tocó la lea apagada.
    ventanaGoce: {
        enabled: { type: Boolean, default: false },
        inicio: { type: String, default: "11-01" },
        fin: { type: String, default: "04-30" },
    },
    // Campaña de goce. Con estos defaults, un tenant que nunca la tocó la lee apagada.
    campania: {
        activa: { type: Boolean, default: false },
        plazoParaDefinirDias: { type: Number, default: 14, min: 1, max: 120 },
        avisoMinimoDias: { type: Number, default: 30, min: 0, max: 180 },
        minDiasPorTramo: { type: Number, default: 7, min: 1, max: 60 },
        // Los tipos de contrato con que arranca tildada una campaña nueva. Vacío = todos los habilitados.
        tiposContratoInvitar: { type: [Number], default: [] },
    },
    // Antigüedad por empresa. Con estos defaults, un tenant que nunca lo tocó lee «empresa vigente».
    computoAntiguedad: {
        modo: { type: String, enum: ["empresaVigente", "precedenciaManual"], default: "empresaVigente" },
        precedencia: { type: [{ type: Schema.Types.ObjectId, ref: "Company" }], default: [] },
        sumarEntreEmpresas: { type: Boolean, default: false },
    },
    requiereFirma: {
        type: Boolean,
        required: true,
        default: true,
    },
    pdfId: {
        type: String,
        required: false,
    },
    // Embedded overlaps array
    overlaps: {
        type: [EmbeddedOverlapSchema],
        default: [],
    },
    // Contract rules
    contractRules: {
        type: [
            {
                contractId: Number,
                contractName: String,
                vacationsEnabled: Boolean,
            },
        ],
        default: [],
    },
    // Counter for vacation number generation
    vacationSequence: {
        type: Number,
        default: 0,
        min: 0,
    },
}, {
    timestamps: true,
    collection: "vacations_configs",
});
VacationConfigSchema.statics.getOrCreateDefault = async function (tenantId) {
    let config = await this.findOne({ tenantId });
    if (!config) {
        config = await this.create({
            tenantId,
            permiteArrastre: false,
            permiteFraccionadas: true,
            requiereFirma: true,
            overlaps: [],
            vacationSequence: 0,
            computoAntiguedad: { modo: "empresaVigente", precedencia: [], sumarEntreEmpresas: false },
        });
    }
    return config;
};
VacationConfigSchema.statics.getNextVacationSequence = async function (tenantId) {
    const config = await this.findOneAndUpdate({ tenantId }, { $inc: { vacationSequence: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true });
    return config.vacationSequence;
};
export const VacationConfig = mongoose.model("VacationConfig", VacationConfigSchema);
