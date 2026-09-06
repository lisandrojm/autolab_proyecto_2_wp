import mongoose, { Schema } from "mongoose";
const userVacationBalanceSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    year: { type: Number, required: true, index: true },
    totalAnnual: { type: Number },
    taken: { type: Number },
    pending: { type: Number },
    available: { type: Number },
}, { timestamps: true, collection: "user_vacation_balances" });
// Compound index to ensure uniqueness per user/tenant/year
userVacationBalanceSchema.index({ tenantId: 1, userId: 1, year: 1 }, { unique: true });
export const UserVacationBalance = mongoose.model("UserVacationBalance", userVacationBalanceSchema);
