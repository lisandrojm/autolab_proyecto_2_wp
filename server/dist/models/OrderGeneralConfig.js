import mongoose, { Schema } from "mongoose";
const OrderGeneralConfigSchema = new Schema({
    tenantId: {
        type: Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
        unique: true,
        index: true,
    },
    orderingEnabled: {
        type: Boolean,
        default: true,
    },
    contractRules: {
        type: [
            {
                contractId: Number,
                contractName: String,
                saturday: { type: Boolean, default: false },
                sunday: { type: Boolean, default: false },
                holiday: { type: Boolean, default: false },
            },
        ],
        default: [],
    },
}, {
    timestamps: true,
    collection: "order_general_configs",
});
OrderGeneralConfigSchema.statics.getOrCreateDefault = async function (tenantId) {
    let config = await this.findOne({ tenantId });
    if (!config) {
        config = await this.create({
            tenantId,
            orderingEnabled: true,
            contractRules: [],
        });
    }
    return config;
};
export const OrderGeneralConfig = mongoose.model("OrderGeneralConfig", OrderGeneralConfigSchema);
