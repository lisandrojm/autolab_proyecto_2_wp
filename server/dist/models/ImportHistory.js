import mongoose, { Schema } from "mongoose";
const importHistorySchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    status: { type: String, enum: ["running", "success", "failed"], required: true },
    executedBy: {
        type: Schema.Types.Mixed,
        required: true
    },
    stats: {
        createdUsers: { type: Number, default: 0 },
        updatedUsers: { type: Number, default: 0 },
        skippedUsers: { type: Number, default: 0 },
        errorsUsers: { type: Number, default: 0 }
    },
    addedUsers: [
        {
            name: { type: String, required: true },
            email: { type: String, required: true },
            dni: { type: String }
        }
    ],
    addedProjects: [
        {
            name: { type: String, required: true },
            externalId: { type: Number, required: true }
        }
    ],
    errorDetails: { type: String }
}, { timestamps: true });
export const ImportHistory = mongoose.model("ImportHistory", importHistorySchema);
