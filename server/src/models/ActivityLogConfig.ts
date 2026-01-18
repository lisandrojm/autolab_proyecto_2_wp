import mongoose from "mongoose";

const activityLogConfigSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
      unique: true,
    },
    enableFastEntry: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true, collection: "activity_log_configs" },
);

export const ActivityLogConfig = mongoose.model("ActivityLogConfig", activityLogConfigSchema);
