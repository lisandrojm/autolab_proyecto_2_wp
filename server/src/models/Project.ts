import mongoose, { Schema, Document, Types } from "mongoose";

export interface IProject extends Document {
  tenantId: Types.ObjectId;
  clientId: Types.ObjectId;
  name: string;
  description?: string;
  objectives?: string[];
  targetAudience?: string;
  budget?: { total?: number };
  campaigns?: Types.ObjectId[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  usuarios?: { id: string; email: string; permiso: "ver" | "editar" }[];
  favorite?: boolean;
}

const projectSchema = new Schema<IProject>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },

    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    objectives: { type: [String], default: [] },
    targetAudience: { type: String, trim: true },

    budget: { total: { type: Number, min: 0, default: 0 } },

    campaigns: [{ type: Schema.Types.ObjectId, ref: "Campaign" }],

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

projectSchema.index({ tenantId: 1, clientId: 1, name: 1 }, { unique: true });
projectSchema.index({ tenantId: 1, clientId: 1, createdAt: -1 });

export const Project = mongoose.model<IProject>("Project", projectSchema);
