import mongoose, { Document, Schema, Types } from "mongoose";

export interface IBrief extends Document {
  tenantId: Types.ObjectId;
  clientId: Types.ObjectId;
  campaignId?: Types.ObjectId;
  title: string;
  description?: string;
  objectives: string[];
  targetAudience: {
    demographics: {
      ageRange: string;
      gender: string;
      location: string;
      income: string;
    };
    psychographics: {
      interests: string[];
      behaviors: string[];
      values: string[];
    };
    painPoints: string[];
  };
  brandGuidelines: {
    toneOfVoice: string;
    keyMessages: string[];
    dosDonts: {
      dos: string[];
      donts: string[];
    };
    visualStyle: string;
  };
  deliverables: {
    type: "post" | "campaign" | "strategy" | "content-calendar" | "other";
    quantity: number;
    format: string[];
    platforms: string[];
    deadline: Date;
  }[];
  budget: {
    total: number;
    breakdown: { category: string; amount: number; description?: string }[];
  };
  timeline: {
    startDate: Date;
    endDate: Date;
    milestones: { name: string; date: Date; description?: string }[];
  };
  requirements: {
    mandatory: string[];
    preferred: string[];
    restrictions: string[];
  };
  success_metrics: {
    primary: string[];
    secondary: string[];
    kpis: { name: string; target: number; unit: string }[];
  };
  status: "draft" | "pending_review" | "approved" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  assignedTo: string[];
  createdBy: string;
  favorite: boolean;
  createdAt: Date;
  updatedAt: Date;
  usuarios?: {
    id: string;
    email: string;
    permiso: "ver" | "editar";
  }[];
}

const briefSchema = new Schema<IBrief>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", index: true },

    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    objectives: { type: [String], required: true, default: [] },

    targetAudience: {
      demographics: {
        ageRange: String,
        gender: String,
        location: String,
        income: String,
      },
      psychographics: {
        interests: [String],
        behaviors: [String],
        values: [String],
      },
      painPoints: [String],
    },

    brandGuidelines: {
      toneOfVoice: String,
      keyMessages: [String],
      dosDonts: {
        dos: [String],
        donts: [String],
      },
      visualStyle: String,
    },

    deliverables: [
      {
        type: { type: String, enum: ["post", "campaign", "strategy", "content-calendar", "other"], required: true },
        quantity: { type: Number, required: true, min: 1 },
        format: [String],
        platforms: [{ type: String, enum: ["facebook", "instagram", "twitter", "linkedin", "tiktok", "youtube", "google-ads", "website", "email"] }],
        deadline: { type: Date, required: true },
      },
    ],

    budget: {
      total: { type: Number, required: true, min: 0 },
      breakdown: [
        {
          category: { type: String, required: true },
          amount: { type: Number, required: true, min: 0 },
          description: String,
        },
      ],
    },

    timeline: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      milestones: [
        {
          name: { type: String, required: true },
          date: { type: Date, required: true },
          description: String,
        },
      ],
    },

    requirements: {
      mandatory: [String],
      preferred: [String],
      restrictions: [String],
    },

    success_metrics: {
      primary: [String],
      secondary: [String],
      kpis: [
        {
          name: { type: String, required: true },
          target: { type: Number, required: true },
          unit: { type: String, required: true },
        },
      ],
    },

    status: { type: String, enum: ["draft", "pending_review", "approved", "in_progress", "completed", "cancelled"], default: "draft", index: true },
    priority: { type: String, enum: ["low", "medium", "high", "urgent"], default: "medium", index: true },

    assignedTo: [{ type: String, default: [] }],

    createdBy: { type: String, required: true },

    favorite: { type: Boolean, default: false, index: true },

    usuarios: [
      {
        id: { type: String, required: true },
        email: { type: String, required: true },
        permiso: { type: String, enum: ["ver", "editar"], required: true },
      },
    ],
  },
  { timestamps: true }
);

briefSchema.index({ tenantId: 1, clientId: 1 });
briefSchema.index({ tenantId: 1, campaignId: 1 });

export const Brief = mongoose.model<IBrief>("Brief", briefSchema);
