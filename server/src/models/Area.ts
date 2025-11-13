import mongoose, { Schema, Document, Types } from "mongoose";

export interface IArea extends Document {
  tenantId: Types.ObjectId;
  name: string;
  description?: string;
  supervisorId?: Types.ObjectId;
  employeeIds: Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const areaSchema = new Schema<IArea>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    supervisorId: { type: Schema.Types.ObjectId, ref: "User" },
    employeeIds: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

areaSchema.index({ tenantId: 1, name: 1 }, { unique: true });
areaSchema.index({ tenantId: 1, supervisorId: 1 });
areaSchema.index({ tenantId: 1, employeeIds: 1 });

export const Area = mongoose.model<IArea>("Area", areaSchema);
