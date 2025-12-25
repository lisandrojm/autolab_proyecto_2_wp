import mongoose, { Document, Schema, Types } from "mongoose";

export type CampaignStatus = "draft" | "active" | "paused" | "completed" | "cancelled";

export interface ICampaign extends Document {
  tenantId: Types.ObjectId;
  clientId: Types.ObjectId;
  projectId: Types.ObjectId;
  name: string;
  description?: string;
  objectives: string[];
  targetAudience: string;
  budget: { total: number; allocated: number; spent: number };
  timeline: { startDate: Date; endDate: Date };
  status: CampaignStatus;
  platforms: ("facebook" | "instagram" | "twitter" | "linkedin" | "tiktok" | "youtube" | "google-ads")[];
  kpis: { name: string; target: number; current: number; unit: string }[];
  posts: Types.ObjectId[];
  assignedUsers: Types.ObjectId[];
  createdBy: string;
  favorite: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const campaignSchema = new Schema<ICampaign>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },

    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    objectives: { type: [String], required: true, default: [] },
    targetAudience: { type: String, required: true, trim: true },

    budget: {
      total: { type: Number, required: true, min: 0 },
      allocated: { type: Number, default: 0, min: 0 },
      spent: { type: Number, default: 0, min: 0 },
    },

    timeline: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
    },

    status: { type: String, enum: ["draft", "active", "paused", "completed", "cancelled"], default: "draft", index: true },

    platforms: [{ type: String, enum: ["facebook", "instagram", "twitter", "linkedin", "tiktok", "youtube", "google-ads"] }],

    kpis: [
      {
        name: { type: String, required: true, trim: true },
        target: { type: Number, required: true },
        current: { type: Number, default: 0 },
        unit: { type: String, required: true, trim: true },
      },
    ],

    posts: [{ type: Schema.Types.ObjectId, ref: "Post" }],

    assignedUsers: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],

    createdBy: { type: String, required: true },

    favorite: { type: Boolean, default: false },
  },
  { timestamps: true }
);

campaignSchema.index({ tenantId: 1, clientId: 1, projectId: 1 });
campaignSchema.index({ tenantId: 1, clientId: 1, createdAt: -1 });

export const Campaign = mongoose.model<ICampaign>("Campaign", campaignSchema);
