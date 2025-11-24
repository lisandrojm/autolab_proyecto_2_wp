import mongoose, { Schema, Document, Types } from "mongoose";

export interface IRole extends Document {
  tenantId: Types.ObjectId;
  name: string;
  description?: string;
  permissions: string[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const roleSchema = new Schema<IRole>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    permissions: { type: [String], default: [] },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

roleSchema.index({ tenantId: 1, name: 1 }, { unique: true });
roleSchema.index({ tenantId: 1, isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

export const Role = mongoose.model<IRole>("Role", roleSchema);
