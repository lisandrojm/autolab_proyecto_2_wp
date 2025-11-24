import mongoose, { Schema, Document, Types } from "mongoose";

export interface IVacationRequest extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  daysRequested: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason: string;
  managerComment?: string;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
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
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
      index: true,
    },
    reason: { type: String, required: true, trim: true },
    managerComment: { type: String, trim: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
  },
  { timestamps: true }
);

vacationRequestSchema.index({ tenantId: 1, userId: 1, status: 1 });
vacationRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
vacationRequestSchema.index({ tenantId: 1, startDate: 1, endDate: 1 });

export const VacationRequest = mongoose.model<IVacationRequest>("VacationRequest", vacationRequestSchema);
