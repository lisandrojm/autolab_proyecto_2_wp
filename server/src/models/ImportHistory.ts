import mongoose, { Schema, Document, Types } from "mongoose";

export interface IImportHistory extends Document {
  tenantId: Types.ObjectId;
  /**
   * "running" se guarda al ARRANCAR la sincronización, antes de recorrer los empleados (que puede
   * tardar varios minutos), y el mismo documento se actualiza a "success"/"failed" al terminar. El
   * frontend hace polling de `GET /import/history/latest` mientras el estado sea "running".
   */
  status: "running" | "success" | "failed";
  executedBy: Types.ObjectId | "system";
  stats: {
    createdUsers: number;
    updatedUsers: number;
    skippedUsers: number;
    errorsUsers: number;
  };
  addedUsers: Array<{
    name: string;
    email: string;
    dni?: string;
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
  },
  { timestamps: true }
);

export const ImportHistory = mongoose.model<IImportHistory>("ImportHistory", importHistorySchema);
