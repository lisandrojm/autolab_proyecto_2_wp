import mongoose, { Schema, Document, Types } from "mongoose";

export interface IProject extends Document {
  tenantId: Types.ObjectId;
  clientId: Types.ObjectId;
  name: string;
  description?: string;
  status: "active" | "completed" | "on_hold" | "archived";
  startDate?: Date;
  endDate?: Date;
  budget?: { total?: number };
  objectives: string[];
  targetAudience?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  assignedUsers: Types.ObjectId[];
  favorite?: boolean;
}

const projectSchema = new Schema<IProject>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },

    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    status: {
      type: String,
      enum: ["active", "completed", "on_hold", "archived"],
      default: "active",
      index: true,
    },

    startDate: { type: Date },
    endDate: { type: Date },

    budget: { total: { type: Number, min: 0, default: 0 } },
    objectives: { type: [String], required: true, default: [] },
    targetAudience: { type: String, trim: true },

    createdBy: { type: String, required: true },

    assignedUsers: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],

    favorite: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

projectSchema.index({ tenantId: 1, clientId: 1, name: 1 }, { unique: true });
projectSchema.index({ tenantId: 1, clientId: 1, createdAt: -1 });

export const Project = mongoose.model<IProject>("Project", projectSchema);
