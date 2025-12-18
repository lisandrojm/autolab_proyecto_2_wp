import mongoose, { Schema, Document, Types } from "mongoose";

interface AntiguedadTramo {
  desde: number;
  hasta: number;
  dias: number;
}

interface VacationRules {
  diasAnuales: number;
  diasBeneficio?: number;
  antiguedadTramos?: AntiguedadTramo[];
  maxDiasGozados?: number;
  permiteArrastre: boolean;
  maxDiasArrastre?: number;
  vencimientoArrastreDias?: number;

  maxDiasHabiles?: number;
  anticipacionMinimaDias?: number;
  permiteFraccionadas: boolean;
  requiereFirma: boolean;
  pdfTemplateId?: string;
}

export interface IVacationRequest extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  daysRequested: number;
  status: "pending" | "pre_approved" | "approved" | "rejected" | "delivered" | "cancelled";
  reason: string;
  managerComment?: string;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  deliveredAt?: Date;
  rejectedAt?: Date;
  preApprovedBy?: Types.ObjectId;
  preApprovedAt?: Date;
  requiresSignature?: boolean;
  signatureStatus?: "not_required" | "pending" | "sent" | "signed";
  signatureSentAt?: Date;
  signatureNotifiedAt?: Date;
  signedAt?: Date;
  signedBy?: Types.ObjectId;
  pdfPreAprobacionUrl?: string;
  rules?: VacationRules;
  createdAt: Date;
  updatedAt: Date;
}

const vacationRequestSchema = new Schema<IVacationRequest>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    daysRequested: { type: Number, required: true, min: 0.5 },
    status: {
      type: String,
      enum: ["pending", "pre_approved", "approved", "rejected", "delivered", "cancelled"],
      default: "pending",
      index: true,
    },
    reason: { type: String, required: true, trim: true },
    managerComment: { type: String, trim: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    deliveredAt: { type: Date },
    rejectedAt: { type: Date },
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
        requiereFirma: { type: Boolean, required: true },
        pdfTemplateId: { type: String, required: false },
      },
      required: false,
    },
  },
  { timestamps: true }
);

vacationRequestSchema.index({ tenantId: 1, userId: 1, status: 1 });
vacationRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
vacationRequestSchema.index({ tenantId: 1, startDate: 1, endDate: 1 });

export const VacationRequest = mongoose.model<IVacationRequest>("VacationRequest", vacationRequestSchema);
