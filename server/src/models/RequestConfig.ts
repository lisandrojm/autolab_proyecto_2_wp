import { Schema, model, Document, Types } from "mongoose";

export interface IRequestConfig extends Document {
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

const requestConfigSchema = new Schema<IRequestConfig>(
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
  { timestamps: true, collection: "requests_configs" },
);

// Compound index to ensure uniqueness of name per tenant
requestConfigSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const RequestConfig = model<IRequestConfig>("RequestConfig", requestConfigSchema);
