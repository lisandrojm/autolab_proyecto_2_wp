import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IRegistroLink extends Document {
  tenantId: Types.ObjectId;
  token: string;
  tenantSlug: string;
  clientId?: Types.ObjectId;
  label?: string;
  active: boolean;
  createdBy?: Types.ObjectId;
  usageCount: number;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const registroLinkSchema = new Schema<IRegistroLink>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    tenantSlug: { type: String, required: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client" },
    label: { type: String },
    active: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    usageCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: "registro-links",
  }
);

export const RegistroLink: Model<IRegistroLink> = mongoose.model<IRegistroLink>("RegistroLink", registroLinkSchema);
