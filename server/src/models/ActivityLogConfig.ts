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
  { timestamps: true }
);

export const ActivityLogConfig = mongoose.model("ActivityLogConfig", activityLogConfigSchema);
