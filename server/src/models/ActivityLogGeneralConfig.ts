import mongoose, { Schema, Document, Types, Model } from "mongoose";

export interface IActivityLogGeneralConfig extends Document {
  tenantId: Types.ObjectId;
  allowedPastDays: number;
  createdAt: Date;
  updatedAt: Date;
}

interface IActivityLogGeneralConfigModel extends Model<IActivityLogGeneralConfig> {
  getOrCreateDefault(tenantId: Types.ObjectId): Promise<IActivityLogGeneralConfig>;
}

const ActivityLogGeneralConfigSchema = new Schema<IActivityLogGeneralConfig>(
  {
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
  },
  {
    timestamps: true,
    collection: "activity_log_general_configs",
  },
);

ActivityLogGeneralConfigSchema.statics.getOrCreateDefault = async function (tenantId: Types.ObjectId) {
  let config = await this.findOne({ tenantId });

  if (!config) {
    config = await this.create({
      tenantId,
      allowedPastDays: 3,
    });
  }

  return config;
};

export const ActivityLogGeneralConfig = mongoose.model<IActivityLogGeneralConfig, IActivityLogGeneralConfigModel>(
  "ActivityLogGeneralConfig",
  ActivityLogGeneralConfigSchema,
);
