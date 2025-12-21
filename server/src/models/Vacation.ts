import mongoose, { Schema, Document } from "mongoose";
import { VacationCounter } from "./VacationCounter.js";

interface VacationRules {
  diasBeneficio?: number;
  maxDiasGozados?: number;
  permiteArrastre: boolean;
  maxDiasArrastre?: number;
  vencimientoArrastreDias?: number;

  maxDiasHabiles?: number;
  anticipacionMinimaDias?: number;
  permiteFraccionadas: boolean;
  minDiasFraccion?: number;
  requiereFirma: boolean;
  pdfTemplateId?: string;
}

export interface IVacation extends Document {
  tenantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  vacationNumber: string;
  userName: string;
  position: string;
  level: string;
  rules?: VacationRules;
  startDate: Date;
  endDate: Date;
  daysRequested: number;
  status: "pending" | "pre_approved" | "approved" | "rejected" | "cancelled" | "delivered";
  diasDeVacacionesAnuales: number;
  balance: number;
  comments?: string;
  preApprovedBy?: mongoose.Types.ObjectId;
  preApprovedAt?: Date;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectedAt?: Date;
  cancelledAt?: Date;
  deliveredAt?: Date;
  requiresSignature?: boolean;
  signatureStatus?: "not_required" | "pending" | "sent" | "signed";
  signatureSentAt?: Date;
  signatureNotifiedAt?: Date;
  signedAt?: Date;
  signedBy?: mongoose.Types.ObjectId;
  pdfPreAprobacionUrl?: string;
  managerComment?: string; // Also missing based on usage
}

const VacationSchema = new Schema<IVacation>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    vacationNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    userName: {
      type: String,
      required: true,
    },
    position: {
      type: String,
      required: true,
    },
    level: {
      type: String,
      required: true,
    },
    rules: {
      type: {
        diasBeneficio: { type: Number, required: false },
        maxDiasGozados: { type: Number, required: false },
        permiteArrastre: { type: Boolean, required: true },
        maxDiasArrastre: { type: Number, required: false },
        vencimientoArrastreDias: { type: Number, required: false },

        maxDiasHabiles: { type: Number, required: false },
        anticipacionMinimaDias: { type: Number, required: false },
        permiteFraccionadas: { type: Boolean, required: true },
        minDiasFraccion: { type: Number, required: false },
        requiereFirma: { type: Boolean, required: true },
        pdfTemplateId: { type: String, required: false },
      },
      required: false,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    daysRequested: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "pre_approved", "approved", "rejected", "cancelled", "delivered"],
      default: "pending",
      index: true,
    },
    diasDeVacacionesAnuales: {
      type: Number,
      required: true,
    },
    balance: {
      type: Number,
      required: true,
    },
    comments: {
      type: String,
      required: false,
    },
    managerComment: { type: String },
    preApprovedBy: { type: Schema.Types.ObjectId, ref: "User" },
    preApprovedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    cancelledAt: { type: Date },
    deliveredAt: { type: Date },
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
    pdfPreAprobacionUrl: { type: String, trim: true },
  },
  {
    timestamps: true,
    collection: "vacations",
  }
);

// Índices compuestos para búsquedas eficientes
VacationSchema.index({ tenantId: 1, status: 1 });
VacationSchema.index({ tenantId: 1, userId: 1 });
VacationSchema.index({ tenantId: 1, vacationNumber: 1 }, { unique: true });

VacationSchema.pre("validate", async function (next) {
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

    let sequence = await VacationCounter.getNextSequence(this.tenantId);
    let paddedNumber = sequence.toString().padStart(6, "0");
    let candidateNumber = `${prefix}-VAC-${paddedNumber}`;

    // Fix for duplicate key error: Check if generated number exists, if so, keep incrementing
    // This handles cases where manual inserts or deletions caused the counter to desync
    while (await mongoose.model("Vacation").exists({ tenantId: this.tenantId, vacationNumber: candidateNumber })) {
      sequence = await VacationCounter.getNextSequence(this.tenantId);
      paddedNumber = sequence.toString().padStart(6, "0");
      candidateNumber = `${prefix}-VAC-${paddedNumber}`;
    }

    this.vacationNumber = candidateNumber;

    next();
  } catch (error) {
    next(error as Error);
  }
});

export const Vacation = mongoose.model<IVacation>("Vacation", VacationSchema);
