import mongoose, { Document, Schema, Types } from "mongoose";

export interface IDocument {
  _id?: Types.ObjectId;
  url: string;
  name?: string;
  fileName?: string;
  fileType?: string;
  uploadedAt?: Date;
  size?: number;
}

export interface IClient extends Document {
  tenantId: Types.ObjectId;
  slug?: string;
  ownerUserId?: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  industry?: string;
  website?: string;
  attachments: IDocument[];
  contacts: {
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
  }[];
  proyectos: Types.ObjectId[]; // Project IDs
  status: "active" | "inactive" | "onboarding";
  favorite: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  costCenters?: {
    name: string;
    code: string;
    description?: string;
    budget: {
      total: number;
      allocated: number;
      spent: number;
      currency: string;
    };
    isActive: boolean;
  }[];
  brief?: {
    objectives: string[];
    targetAudience?: string;
    budget?: number;
    timeline?: string;
    preferences?: string;
  };

  usuarios?: { userId: Types.ObjectId; permiso: "ver" | "editar" }[];
}

const clientSchema = new Schema<IClient>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    slug: { type: String, index: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User" },

    name: { type: String, required: true, trim: true },

    email: { type: String, required: true, lowercase: true, trim: true },

    phone: { type: String, trim: true },
    company: { type: String, trim: true },
    industry: { type: String, trim: true },
    website: { type: String, trim: true },

    attachments: [
      {
        url: { type: String, required: true },
        name: { type: String, maxlength: 100 },
        fileName: String,
        fileType: String,
        uploadedAt: { type: Date, default: Date.now },
        size: Number,
      },
    ],

    contacts: [
      {
        name: String,
        email: String,
        phone: String,
        role: String,
      },
    ],
    proyectos: [{ type: Schema.Types.ObjectId, ref: "Project", index: true }],

    brief: {
      objectives: [String],
      targetAudience: String,
      budget: Number,
      timeline: String,
      preferences: String,
    },

    costCenters: [
      {
        name: String,
        code: String,
        description: String,
        budget: {
          total: Number,
          allocated: { type: Number, default: 0 },
          spent: { type: Number, default: 0 },
          currency: { type: String, default: "EUR" },
        },
        isActive: { type: Boolean, default: true },
      },
    ],

    status: { type: String, enum: ["active", "inactive", "onboarding"], default: "onboarding", index: true },

    createdBy: { type: String }, // opcional por seed

    usuarios: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        permiso: { type: String, enum: ["ver", "editar"], required: true },
      },
    ],

    favorite: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// único por tenant + email
clientSchema.index({ tenantId: 1, email: 1 }, { unique: true });
clientSchema.index({ tenantId: 1, slug: 1 });

export const Client = mongoose.model<IClient>("Client", clientSchema);
