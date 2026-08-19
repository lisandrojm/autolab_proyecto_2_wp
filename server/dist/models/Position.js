import mongoose, { Schema } from "mongoose";
const positionSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    vacationConfig: {
        useGlobalConfig: { type: Boolean, default: true },
        permiteFraccionadas: { type: Boolean, default: true },
        minDiasFraccion: { type: Number },
        diasCorridos: { type: Boolean },
    },
}, { timestamps: true });
positionSchema.index({ tenantId: 1, name: 1 }, { unique: true });
export const Position = mongoose.model("Position", positionSchema);
