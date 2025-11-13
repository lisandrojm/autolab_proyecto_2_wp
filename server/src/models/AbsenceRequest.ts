import mongoose, { Schema, Document, Types } from "mongoose";

export interface IAbsenceRequest extends Document {
  tenantId: Types.ObjectId;
  employeeId: Types.ObjectId;
  areaId?: Types.ObjectId;
  type: "vacation" | "compensatory" | "special_leave" | "extra";
  startDate: Date;
  endDate: Date;
  daysCount: number;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
  status: "pending" | "approved" | "rejected" | "cancelled";
  supervisorId?: Types.ObjectId;
  approverId?: Types.ObjectId;
  approvedAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
  postponeCount: number;
  lastPostponedAt?: Date;
  replacementEmployeeId?: Types.ObjectId;
  notes?: string;
  source: "mobile" | "admin";
}

const absenceRequestSchema = new Schema<IAbsenceRequest>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    areaId: { type: Schema.Types.ObjectId, ref: "Area" },
    type: {
      type: String,
      enum: ["vacation", "compensatory", "special_leave", "extra"],
      required: true,
      index: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    daysCount: { type: Number, required: true, min: 0.5 },
    reason: { type: String, trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
      index: true,
    },
    supervisorId: { type: Schema.Types.ObjectId, ref: "User" },
    approverId: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    rejectionReason: { type: String, trim: true },
    postponeCount: { type: Number, default: 0, min: 0, max: 3 },
    lastPostponedAt: { type: Date },
    replacementEmployeeId: { type: Schema.Types.ObjectId, ref: "User" },
    notes: { type: String, trim: true },
    source: {
      type: String,
      enum: ["mobile", "admin"],
      default: "mobile",
    },
  },
  { timestamps: true }
);

absenceRequestSchema.index({ tenantId: 1, employeeId: 1, status: 1 });
absenceRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
absenceRequestSchema.index({ tenantId: 1, startDate: 1, endDate: 1 });
absenceRequestSchema.index({ tenantId: 1, areaId: 1, status: 1 });
absenceRequestSchema.index({ tenantId: 1, supervisorId: 1, status: 1 });

export const AbsenceRequest = mongoose.model<IAbsenceRequest>("AbsenceRequest", absenceRequestSchema);
