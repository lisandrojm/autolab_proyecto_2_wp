import mongoose, { Schema, Document, Types } from "mongoose";

export interface IPosition extends Document {
  tenantId: Types.ObjectId;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const positionSchema = new Schema<IPosition>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
  },
  { timestamps: true }
);

positionSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const Position = mongoose.model<IPosition>("Position", positionSchema);
