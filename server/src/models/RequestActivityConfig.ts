import mongoose from "mongoose";

const requestActivityConfigSchema = new mongoose.Schema(
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
  { timestamps: true, collection: "requests_activity_configs" },
);

export const RequestActivityConfig = mongoose.model("RequestActivityConfig", requestActivityConfigSchema);
