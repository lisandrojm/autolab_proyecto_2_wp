import { Schema, model, Document, Types } from "mongoose";

export interface IVacationOverlap extends Document {
  tenantId: Types.ObjectId;
  areaId: Types.ObjectId;
  maxSimultaneousUsers: number;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const vacationOverlapSchema = new Schema<IVacationOverlap>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    areaId: { type: Schema.Types.ObjectId, ref: "Area", required: true },
    maxSimultaneousUsers: { type: Number, required: true, min: 1 },
    description: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "vacations_overlaps" },
);

// Índice compuesto para asegurar unicidad de regla por área en un tenant
vacationOverlapSchema.index({ tenantId: 1, areaId: 1 }, { unique: true });

export const VacationOverlap = model<IVacationOverlap>("VacationOverlap", vacationOverlapSchema);
