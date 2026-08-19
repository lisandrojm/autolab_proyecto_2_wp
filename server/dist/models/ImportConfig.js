import mongoose, { Schema } from "mongoose";
const importConfigSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, unique: true },
    isEnabled: { type: Boolean, default: false },
    intervalHours: { type: Number, default: 24 },
    syncProjects: { type: Boolean, default: true },
    sinceDays: { type: Number, default: undefined },
    lastRun: { type: Date },
    nextRun: { type: Date },
}, { timestamps: true });
export const ImportConfig = mongoose.model("ImportConfig", importConfigSchema);
