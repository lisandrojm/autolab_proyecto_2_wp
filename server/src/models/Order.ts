import mongoose, { Schema, Document, Types } from "mongoose";

export interface IOrder extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  description: string;
  category: string;
  categoryId?: Types.ObjectId;
  subcategoryId?: string;
  subcategoryLabel?: string;
  status: "pending" | "approved" | "rejected" | "delivered" | "cancelled";
  requestedAt: Date;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  deliveredAt?: Date;
  amount?: number;
  photoUrl?: string;
  actionCompleted?: boolean;
  dynamicValue?: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true, default: "other" },
    categoryId: { type: Schema.Types.ObjectId, ref: "OrderCategory", index: true },
    subcategoryId: { type: String, trim: true, index: true },
    subcategoryLabel: { type: String, trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "delivered", "cancelled"],
      default: "pending",
      index: true,
    },
    requestedAt: { type: Date, default: Date.now },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    deliveredAt: { type: Date },
    amount: { type: Number, min: 0 },
    photoUrl: { type: String, trim: true },
    actionCompleted: { type: Boolean },
    dynamicValue: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

orderSchema.index({ tenantId: 1, userId: 1, status: 1 });
orderSchema.index({ tenantId: 1, status: 1, requestedAt: -1 });
orderSchema.index({ tenantId: 1, category: 1 });
orderSchema.index({ tenantId: 1, categoryId: 1 });
orderSchema.index({ categoryId: 1, subcategoryId: 1 });

export const Order = mongoose.model<IOrder>("Order", orderSchema);
