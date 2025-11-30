import mongoose, { Schema, Document, Types } from "mongoose";
import { OrderCounter } from "./OrderCounter.js";

export interface IOrder extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  orderNumber: string;
  description: string;
  category: string;
  categoryId?: Types.ObjectId;
  subcategories: string[];
  status: "pending" | "pre_approved" | "approved" | "rejected" | "delivered" | "cancelled";
  requestedAt: Date;
  preApprovedBy?: Types.ObjectId;
  preApprovedAt?: Date;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  deliveredAt?: Date;
  amount?: number;
  photoUrl?: string;
  documentoUrl?: string;
  actionCompleted?: boolean;
  dynamicValue?: any;
  requiereAccionFutura?: boolean;
  futureActionId?: Types.ObjectId;
  requiresSignature?: boolean;
  signatureStatus?: "not_required" | "pending" | "sent" | "signed";
  signatureSentAt?: Date;
  signatureNotifiedAt?: Date;
  signedAt?: Date;
  signedBy?: Types.ObjectId;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orderNumber: { type: String, trim: true, uppercase: true, index: true },
    description: { type: String, required: false, trim: true, default: "" },
    category: { type: String, required: true, trim: true, default: "other" },
    categoryId: { type: Schema.Types.ObjectId, ref: "OrderCategory", index: true },
    subcategories: { type: [String], default: [], index: true },
    status: {
      type: String,
      enum: ["pending", "pre_approved", "approved", "rejected", "delivered", "cancelled"],
      default: "pending",
      index: true,
    },
    requestedAt: { type: Date, default: Date.now },
    preApprovedBy: { type: Schema.Types.ObjectId, ref: "User" },
    preApprovedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    deliveredAt: { type: Date },
    amount: { type: Number, min: 0 },
    photoUrl: { type: String, trim: true },
    documentoUrl: { type: String, trim: true },
    actionCompleted: { type: Boolean },
    dynamicValue: { type: Schema.Types.Mixed },
    requiereAccionFutura: { type: Boolean, default: false },
    futureActionId: { type: Schema.Types.ObjectId, ref: "FutureAction" },
    requiresSignature: { type: Boolean, default: false },
    signatureStatus: { type: String, enum: ["not_required", "pending", "sent", "signed"], default: "not_required" },
    signatureSentAt: { type: Date },
    signatureNotifiedAt: { type: Date },
    signedAt: { type: Date },
    signedBy: { type: Schema.Types.ObjectId, ref: "User" },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

orderSchema.index({ tenantId: 1, userId: 1, status: 1 });
orderSchema.index({ tenantId: 1, status: 1, requestedAt: -1 });
orderSchema.index({ tenantId: 1, category: 1 });
orderSchema.index({ tenantId: 1, categoryId: 1 });
orderSchema.index({ tenantId: 1, subcategories: 1 });
orderSchema.index({ tenantId: 1, orderNumber: 1 }, { unique: true });

orderSchema.pre("validate", async function (next) {
  if (!this.isNew || this.orderNumber) {
    return next();
  }

  try {
    const Tenant = mongoose.model("Tenant");
    const tenant = await Tenant.findById(this.tenantId);

    if (!tenant) {
      throw new Error("Tenant not found");
    }

    const prefix = tenant.slug.toUpperCase().slice(0, 3);
    const sequence = await OrderCounter.getNextSequence(this.tenantId);
    const paddedNumber = sequence.toString().padStart(6, "0");
    this.orderNumber = `${prefix}-${paddedNumber}`;

    next();
  } catch (error) {
    next(error as Error);
  }
});

export const Order = mongoose.model<IOrder>("Order", orderSchema);
