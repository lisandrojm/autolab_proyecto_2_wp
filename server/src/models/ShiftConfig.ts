import { Schema, model, type Document, Types } from "mongoose";

export interface IShiftConfig extends Document {
  tenantId: Types.ObjectId;
  name: string;
  description?: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const shiftConfigSchema = new Schema<IShiftConfig>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Unicidad de nombre por tenant
shiftConfigSchema.index({ tenantId: 1, name: 1 }, { unique: true });
shiftConfigSchema.index({ tenantId: 1, sortOrder: 1 });

export const ShiftConfig = model<IShiftConfig>("ShiftConfig", shiftConfigSchema, "shift_configs");
