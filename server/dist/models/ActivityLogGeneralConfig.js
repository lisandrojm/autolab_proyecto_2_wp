import mongoose, { Schema } from "mongoose";
const horasExtraSchema = new Schema({
    codigo50: { type: String, default: null },
    codigo100: { type: String, default: null },
    param: { type: String, enum: ["par1", "par2"], default: "par1" },
    unidad: { type: String, enum: ["cantidad", "importe"], default: "cantidad" },
    vigenteDesde: { type: String, default: null },
}, { _id: false });
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
    memosoftHorasExtra: { type: horasExtraSchema, default: null },
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
        });
    }
    return config;
};
export const ActivityLogGeneralConfig = mongoose.model("ActivityLogGeneralConfig", ActivityLogGeneralConfigSchema);
