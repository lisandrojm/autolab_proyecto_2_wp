import mongoose, { Schema, Document, Types } from "mongoose";

export interface IUserOrderBalance extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  orderConfigId: Types.ObjectId;
  year: number;
  totalAnnual?: number;
  taken?: number;
  pending?: number;
  available?: number;
  createdAt: Date;
  updatedAt: Date;
}

const userOrderBalanceSchema = new Schema<IUserOrderBalance>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orderConfigId: { type: Schema.Types.ObjectId, ref: "OrderConfig", required: true, index: true },
    year: { type: Number, required: true, index: true },
    totalAnnual: { type: Number },
    taken: { type: Number },
    pending: { type: Number },
    available: { type: Number },
  },
  { timestamps: true, collection: "user_order_balances" }
);

// Compound index to ensure uniqueness per user/tenant/order type/year
userOrderBalanceSchema.index({ tenantId: 1, userId: 1, orderConfigId: 1, year: 1 }, { unique: true });

export const UserOrderBalance = mongoose.model<IUserOrderBalance>("UserOrderBalance", userOrderBalanceSchema);
