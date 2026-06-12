import mongoose, { Schema, Document, Types } from "mongoose";

export interface IImportConfig extends Document {
  tenantId: Types.ObjectId;
  isEnabled: boolean;
  intervalHours: number;
  syncProjects: boolean;
  sinceDays?: number;
  lastRun?: Date;
  nextRun?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const importConfigSchema = new Schema<IImportConfig>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, unique: true },
    isEnabled: { type: Boolean, default: false },
    intervalHours: { type: Number, default: 24 },
    syncProjects: { type: Boolean, default: true },
    sinceDays: { type: Number, default: undefined },
    lastRun: { type: Date },
    nextRun: { type: Date },
  },
  { timestamps: true }
);

export const ImportConfig = mongoose.model<IImportConfig>("ImportConfig", importConfigSchema);
