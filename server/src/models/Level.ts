import mongoose, { Schema, Document, Types } from "mongoose";

export interface ILevel extends Document {
  tenantId: Types.ObjectId;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const levelSchema = new Schema<ILevel>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
  },
  { timestamps: true }
);

levelSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const Level = mongoose.model<ILevel>("Level", levelSchema);
