import { Schema, model, Document, Types } from "mongoose";

export interface IActivityLogType extends Document {
  tenantId: Types.ObjectId;
  name: string;
  order: number;
  requiresReplacement: boolean;
  isActive: boolean;
  visibility: "all" | "specific";
  allowedProjectIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const activityLogTypeSchema = new Schema<IActivityLogType>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true },
    order: { type: Number, default: 0 },
    requiresReplacement: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    visibility: {
      type: String,
      enum: ["all", "specific"],
      default: "all",
    },
    allowedProjectIds: [{ type: Schema.Types.ObjectId, ref: "Project", default: [] }],
  },
  { timestamps: true, collection: "activity_log_types" },
);

// Compound index to ensure uniqueness of name per tenant might be useful, but maybe not strictly required if we allow duplicates?
// Standard practice: unique names per tenant.
activityLogTypeSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const ActivityLogType = model<IActivityLogType>("ActivityLogType", activityLogTypeSchema);
