import mongoose, { Schema, Document, Types } from "mongoose";

export interface IOrderDocument extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  type: "contract" | "payroll" | "certificate" | "other";
  title: string;
  description?: string;
  filePath?: string;
  fileUrl?: string;
  uploadedBy: Types.ObjectId;
  uploadedAt: Date;
  isVisibleToEmployee: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<IOrderDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["contract", "payroll", "certificate", "other"],
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    filePath: { type: String, trim: true },
    fileUrl: { type: String, trim: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    uploadedAt: { type: Date, default: Date.now },
    isVisibleToEmployee: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "orders_documents" },
);

documentSchema.index({ tenantId: 1, userId: 1, type: 1 });
documentSchema.index({ tenantId: 1, userId: 1, isVisibleToEmployee: 1 });
documentSchema.index({ tenantId: 1, uploadedAt: -1 });

export const OrderDocument = mongoose.model<IOrderDocument>("OrderDocument", documentSchema);
