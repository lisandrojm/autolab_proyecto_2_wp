import mongoose, { Schema } from "mongoose";
import { VacationConfig } from "./VacationConfig.js";
// ─────────────────────────────────────────────────────────────────────────────
// Vacation Schema
// ─────────────────────────────────────────────────────────────────────────────
const vacationSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    vacationNumber: { type: String, required: true, trim: true, uppercase: true, index: true },
    userName: { type: String, required: true },
    position: { type: String, required: true },
    level: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    daysRequested: { type: Number, required: true, min: 0.5 },
    diasDeVacacionesAnuales: { type: Number, required: true },
    balance: { type: Number, required: true },
    status: {
        type: String,
        enum: ["pending", "pre_approved", "approved", "rejected", "delivered", "cancelled"],
        default: "pending",
        index: true,
    },
    reason: { type: String, required: true, trim: true },
    comments: { type: String, trim: true },
    managerComment: { type: String, trim: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    deliveredAt: { type: Date },
    rejectedAt: { type: Date },
    cancelledAt: { type: Date },
    preApprovedBy: { type: Schema.Types.ObjectId, ref: "User" },
    preApprovedAt: { type: Date },
    requiresSignature: { type: Boolean, default: false },
    signatureStatus: {
        type: String,
        enum: ["not_required", "pending", "sent", "signed"],
        default: "not_required",
    },
    signatureSentAt: { type: Date },
    signatureNotifiedAt: { type: Date },
    signedAt: { type: Date },
    signedBy: { type: Schema.Types.ObjectId, ref: "User" },
    pdfPreAprobacionUrl: { type: String },
    rules: {
        type: {
            diasAnuales: { type: Number, required: true },
            diasBeneficio: { type: Number, required: false },
            antiguedadTramos: {
                type: [
                    {
                        desde: { type: Number, required: true },
                        hasta: { type: Number, required: true },
                        dias: { type: Number, required: true },
                    },
                ],
                required: false,
                default: [],
            },
            maxDiasGozados: { type: Number, required: false },
            permiteArrastre: { type: Boolean, required: true },
            maxDiasArrastre: { type: Number, required: false },
            vencimientoArrastreDias: { type: Number, required: false },
            maxDiasHabiles: { type: Number, required: false },
            anticipacionMinimaDias: { type: Number, required: false },
            permiteFraccionadas: { type: Boolean, required: true },
            minDiasFraccion: { type: Number, required: false },
            diasCorridos: { type: Boolean, required: false },
            requiereFirma: { type: Boolean, required: true },
            pdfId: { type: String, required: false },
        },
        required: false,
    },
}, { timestamps: true, collection: "vacations" });
vacationSchema.index({ tenantId: 1, userId: 1, status: 1 });
vacationSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
vacationSchema.index({ tenantId: 1, startDate: 1, endDate: 1 });
vacationSchema.index({ tenantId: 1, vacationNumber: 1 }, { unique: true });
vacationSchema.pre("validate", async function (next) {
    if (!this.isNew || this.vacationNumber) {
        return next();
    }
    try {
        const Tenant = mongoose.model("Tenant");
        const tenant = await Tenant.findById(this.tenantId);
        if (!tenant) {
            throw new Error("Tenant not found");
        }
        const prefix = tenant.slug.toUpperCase().slice(0, 3);
        // Use VacationConfig.getNextVacationSequence instead of separate counter
        let sequence = await VacationConfig.getNextVacationSequence(this.tenantId);
        let paddedNumber = sequence.toString().padStart(6, "0");
        let candidateNumber = `${prefix}-VAC-${paddedNumber}`;
        while (await mongoose.model("Vacation").exists({ tenantId: this.tenantId, vacationNumber: candidateNumber })) {
            sequence = await VacationConfig.getNextVacationSequence(this.tenantId);
            paddedNumber = sequence.toString().padStart(6, "0");
            candidateNumber = `${prefix}-VAC-${paddedNumber}`;
        }
        this.vacationNumber = candidateNumber;
        next();
    }
    catch (error) {
        next(error);
    }
});
export const Vacation = mongoose.model("Vacation", vacationSchema);
