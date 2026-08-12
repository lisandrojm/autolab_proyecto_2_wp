import mongoose, { Schema } from "mongoose";
const shiftSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    days: { type: [Number], required: true, default: [1, 2, 3, 4, 5] },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    description: { type: String, trim: true },
    isSystem: { type: Boolean, default: false },
}, { timestamps: true });
shiftSchema.index({ tenantId: 1, name: 1 }, { unique: true });
export const Shift = mongoose.model("Shift", shiftSchema);
