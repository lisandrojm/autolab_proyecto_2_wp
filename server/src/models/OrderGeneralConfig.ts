import mongoose, { Schema, Document, Types, Model } from "mongoose";

export interface IContractDayRule {
  contractId: number;
  contractName: string;
  saturday: boolean;
  sunday: boolean;
  holiday: boolean;
}

export interface IOrderGeneralConfig extends Document {
  tenantId: Types.ObjectId;
  orderingEnabled: boolean; // Main toggle for the whole module if needed
  contractRules: IContractDayRule[];
  createdAt: Date;
  updatedAt: Date;
}

interface IOrderGeneralConfigModel extends Model<IOrderGeneralConfig> {
  getOrCreateDefault(tenantId: Types.ObjectId): Promise<IOrderGeneralConfig>;
}

const OrderGeneralConfigSchema = new Schema<IOrderGeneralConfig>(
  {
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
  },
  {
    timestamps: true,
    collection: "order_general_configs",
  },
);

OrderGeneralConfigSchema.statics.getOrCreateDefault = async function (tenantId: Types.ObjectId) {
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

export const OrderGeneralConfig = mongoose.model<IOrderGeneralConfig, IOrderGeneralConfigModel>("OrderGeneralConfig", OrderGeneralConfigSchema);
