import mongoose, { Schema, Document, Types } from "mongoose";

export interface IHoliday extends Document {
  tenantId: Types.ObjectId;
  date: Date;
  name: string;
  type: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const holidaySchema = new Schema<IHoliday>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    date: { type: Date, required: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, default: "Nacional", trim: true },
    description: { type: String, trim: true },
  },
  { timestamps: true, collection: "holidays" }
);

// Unicidad por fecha dentro de un mismo tenant
holidaySchema.index({ tenantId: 1, date: 1 }, { unique: true });

export const Holiday = mongoose.model<IHoliday>("Holiday", holidaySchema);
