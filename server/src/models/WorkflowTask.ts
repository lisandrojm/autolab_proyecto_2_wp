import mongoose, { Document, Schema, Types } from "mongoose";

export interface IWorkflowTask extends Document {
  tenantId: Types.ObjectId;
  campaignId: Types.ObjectId;
  clientId: Types.ObjectId;
  title: string;
  description?: string;
  type: "design" | "copy" | "approval" | "publish" | "analysis" | "other";
  priority: "low" | "medium" | "high" | "urgent";
  status: "todo" | "in_progress" | "review" | "done";
  assignedTo: string[]; // userIds
  dueDate?: Date;
  dependencies: string[]; // taskIds (strings) si quieren
  attachments: { name: string; url: string; type: string }[];
  comments: { userId: string; message: string; createdAt: Date }[];
  estimatedHours?: number;
  actualHours?: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  usuarios?: { id: string; email: string; permiso: "ver" | "editar" }[];
  favorite?: boolean;
}

const workflowTaskSchema = new Schema<IWorkflowTask>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },

    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", required: true, index: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },

    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    type: { type: String, enum: ["design", "copy", "approval", "publish", "analysis", "other"], required: true },

    priority: { type: String, enum: ["low", "medium", "high", "urgent"], default: "medium", index: true },

    status: { type: String, enum: ["todo", "in_progress", "review", "done"], default: "todo", index: true },

    assignedTo: [{ type: String, default: [] }],

    dueDate: Date,

    dependencies: [{ type: String, default: [] }],

    attachments: [{ name: String, url: String, type: String }],

    comments: [
      {
        userId: String,
        message: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],

    estimatedHours: Number,
    actualHours: Number,

    createdBy: { type: String, required: true },

    usuarios: [
      {
        id: { type: String, required: true },
        email: { type: String, required: true },
        permiso: { type: String, enum: ["ver", "editar"], required: true },
      },
    ],

    favorite: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

workflowTaskSchema.index({ tenantId: 1, assignedTo: 1 });

export const WorkflowTask = mongoose.model<IWorkflowTask>("WorkflowTask", workflowTaskSchema);
