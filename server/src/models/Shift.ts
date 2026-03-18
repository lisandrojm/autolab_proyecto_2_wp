import mongoose, { Schema, Document, Types } from "mongoose";

export interface IShift extends Document {
  tenantId: Types.ObjectId;
  name: string;
  type: string;
  days: number[]; // [0-6]
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const shiftSchema = new Schema<IShift>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, default: "Mañana" },
    days: { type: [Number], required: true, default: [1, 2, 3, 4, 5] },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    description: { type: String, trim: true },
  },
  { timestamps: true }
);

shiftSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const Shift = mongoose.model<IShift>("Shift", shiftSchema);
