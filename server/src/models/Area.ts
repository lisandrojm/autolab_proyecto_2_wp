import mongoose, { Schema, Document, Types } from "mongoose";

export interface IArea extends Document {
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

const areaSchema = new Schema<IArea>(
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

areaSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const Area = mongoose.model<IArea>("Area", areaSchema);
