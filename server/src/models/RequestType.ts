import mongoose, { Schema, Document, Types } from "mongoose";

export interface IRequestType extends Document {
  tenantId: Types.ObjectId;
  name: string;
  key: string;
  description?: string;
  isSystem: boolean;
  isDeletable: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const requestTypeSchema = new Schema<IRequestType>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    isSystem: { type: Boolean, default: false },
    isDeletable: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "requests_types" },
);

requestTypeSchema.index({ tenantId: 1, key: 1 }, { unique: true });
requestTypeSchema.index({ tenantId: 1, isActive: 1 });

export const RequestType = mongoose.model<IRequestType>("RequestType", requestTypeSchema);
