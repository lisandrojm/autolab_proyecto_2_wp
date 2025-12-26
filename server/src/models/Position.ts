import mongoose, { Schema, Document, Types } from "mongoose";

export interface IPosition extends Document {
  tenantId: Types.ObjectId;
  name: string;
  description?: string;
  vacationConfig?: {
    useGlobalConfig: boolean;
    permiteFraccionadas: boolean;
    minDiasFraccion?: number;
    diasCorridos?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const positionSchema = new Schema<IPosition>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    vacationConfig: {
      useGlobalConfig: { type: Boolean, default: true },
      permiteFraccionadas: { type: Boolean, default: true },
      minDiasFraccion: { type: Number },
      diasCorridos: { type: Boolean },
    },
  },
  { timestamps: true }
);

positionSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const Position = mongoose.model<IPosition>("Position", positionSchema);
