import mongoose, { Schema, Document, Types } from "mongoose";

export interface IActivityLog extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  action: string;
  description: string;
  entityType?: string;
  entityId?: Types.ObjectId;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    action: { type: String, required: true, trim: true, index: true },
    description: { type: String, required: true, trim: true },
    entityType: { type: String, trim: true, index: true },
    entityId: { type: Schema.Types.ObjectId },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true, collection: "activity_logs" },
);

activityLogSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
activityLogSchema.index({ tenantId: 1, action: 1, createdAt: -1 });
activityLogSchema.index({ tenantId: 1, entityType: 1, entityId: 1 });

export const ActivityLog = mongoose.model<IActivityLog>("ActivityLog", activityLogSchema);
