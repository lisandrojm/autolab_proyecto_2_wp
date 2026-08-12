import mongoose, { Schema } from "mongoose";
const EmbeddedOverlapSchema = new Schema({
    areaId: { type: Schema.Types.ObjectId, ref: "Area" },
    positionId: { type: Schema.Types.ObjectId, ref: "Position" },
    levelId: { type: Schema.Types.ObjectId, ref: "Level" },
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
        });
    }
    return config;
};
VacationConfigSchema.statics.getNextVacationSequence = async function (tenantId) {
    const config = await this.findOneAndUpdate({ tenantId }, { $inc: { vacationSequence: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true });
    return config.vacationSequence;
};
export const VacationConfig = mongoose.model("VacationConfig", VacationConfigSchema);
