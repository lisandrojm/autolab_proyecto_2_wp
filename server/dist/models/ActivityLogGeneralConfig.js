import mongoose, { Schema } from "mongoose";
const ActivityLogGeneralConfigSchema = new Schema({
    tenantId: {
        type: Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
        unique: true,
        index: true,
    },
    allowedPastDays: {
        type: Number,
        default: 3,
    },
    allowedEditPastDays: {
        type: Number,
        default: 2,
    },
}, {
    timestamps: true,
    collection: "activity_log_general_configs",
});
ActivityLogGeneralConfigSchema.statics.getOrCreateDefault = async function (tenantId) {
    let config = await this.findOne({ tenantId });
    if (!config) {
        config = await this.create({
            tenantId,
            allowedPastDays: 3,
            allowedEditPastDays: 2,
        });
    }
    return config;
};
export const ActivityLogGeneralConfig = mongoose.model("ActivityLogGeneralConfig", ActivityLogGeneralConfigSchema);
