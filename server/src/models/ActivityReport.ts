import mongoose, { Schema, Document, Types } from "mongoose";

export interface AttendanceRecord {
  employeeId: Types.ObjectId;
  status: string; // "present", "absent", etc.
  absenceReason?: string;
  replacementId?: Types.ObjectId;
  overtimeHours?: number;
  notes?: string;
}

export interface IActivityReport extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  date: string; // YYYY-MM-DD
  projectId?: Types.ObjectId;
  areaId?: Types.ObjectId;
  submittedAt: Date;
  attendance: AttendanceRecord[];
  comments?: string;
  hasActivity: boolean; // "SÍ" or "NO"
}

const activityReportSchema = new Schema<IActivityReport>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    areaId: { type: Schema.Types.ObjectId, ref: "Area" },
    submittedAt: { type: Date, default: Date.now },
    hasActivity: { type: Boolean, default: false },
    attendance: [
      {
        employeeId: { type: Schema.Types.ObjectId, ref: "User" },
        status: { type: String, default: "present" },
        absenceReason: { type: String },
        replacementId: { type: Schema.Types.ObjectId, ref: "User" },
        overtimeHours: { type: Number },
        notes: { type: String },
      },
    ],
    comments: { type: String },
  },
  { timestamps: true }
);

activityReportSchema.index({ tenantId: 1, userId: 1, date: -1 });

export const ActivityReport = mongoose.model<IActivityReport>("ActivityReport", activityReportSchema);
