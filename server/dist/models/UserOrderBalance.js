import mongoose, { Schema } from "mongoose";
const userOrderBalanceSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orderConfigId: { type: Schema.Types.ObjectId, ref: "OrderConfig", required: true, index: true },
    year: { type: Number, required: true, index: true },
    totalAnnual: { type: Number },
    taken: { type: Number },
    pending: { type: Number },
    available: { type: Number },
}, { timestamps: true, collection: "user_order_balances" });
// Compound index to ensure uniqueness per user/tenant/order type/year
userOrderBalanceSchema.index({ tenantId: 1, userId: 1, orderConfigId: 1, year: 1 }, { unique: true });
export const UserOrderBalance = mongoose.model("UserOrderBalance", userOrderBalanceSchema);
