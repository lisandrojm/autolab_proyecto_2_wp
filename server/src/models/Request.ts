import mongoose, { Schema, Document, Types } from "mongoose";

export interface IRequest extends Document {
  tenantId: Types.ObjectId;
  employeeId: Types.ObjectId;
  typeKey: string;
  startDate: Date;
  endDate: Date;
  daysCount?: number;
  reason?: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  approverId?: Types.ObjectId;
  approvedAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
  replacementEmployeeId?: Types.ObjectId;
  notes?: string;
  source: "mobile" | "admin";
  createdAt: Date;
  updatedAt: Date;
}

const requestSchema = new Schema<IRequest>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    typeKey: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    daysCount: { type: Number, min: 0 },
    reason: { type: String, trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
      index: true,
    },
    approverId: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    rejectionReason: { type: String, trim: true },
    replacementEmployeeId: { type: Schema.Types.ObjectId, ref: "User" },
    notes: { type: String, trim: true },
    source: {
      type: String,
      enum: ["mobile", "admin"],
      default: "admin",
    },
  },
  { timestamps: true }
);

requestSchema.index({ tenantId: 1, employeeId: 1, status: 1 });
requestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
requestSchema.index({ tenantId: 1, typeKey: 1, status: 1 });
requestSchema.index({ tenantId: 1, startDate: 1, endDate: 1 });

requestSchema.pre("save", function (next) {
  if (this.startDate && this.endDate && !this.daysCount) {
    const diffTime = Math.abs(this.endDate.getTime() - this.startDate.getTime());
    this.daysCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }
  next();
});

export const Request = mongoose.model<IRequest>("Request", requestSchema);
