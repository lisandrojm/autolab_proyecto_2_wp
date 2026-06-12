import mongoose, { Schema, Document, Types } from "mongoose";

export interface IImportHistory extends Document {
  tenantId: Types.ObjectId;
  status: "success" | "failed";
  executedBy: Types.ObjectId | "system";
  stats: {
    createdUsers: number;
    updatedUsers: number;
    errorsUsers: number;
  };
  addedUsers: Array<{
    name: string;
    email: string;
  }>;
  addedProjects: Array<{
    name: string;
    externalId: number;
  }>;
  errorDetails?: string;
  createdAt: Date;
  updatedAt: Date;
}

const importHistorySchema = new Schema<IImportHistory>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    status: { type: String, enum: ["success", "failed"], required: true },
    executedBy: {
      type: Schema.Types.Mixed,
      required: true
    },
    stats: {
      createdUsers: { type: Number, default: 0 },
      updatedUsers: { type: Number, default: 0 },
      errorsUsers: { type: Number, default: 0 }
    },
    addedUsers: [
      {
        name: { type: String, required: true },
        email: { type: String, required: true }
      }
    ],
    addedProjects: [
      {
        name: { type: String, required: true },
        externalId: { type: Number, required: true }
      }
    ],
    errorDetails: { type: String }
  },
  { timestamps: true }
);

export const ImportHistory = mongoose.model<IImportHistory>("ImportHistory", importHistorySchema);
