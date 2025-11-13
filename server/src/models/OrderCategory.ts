import mongoose, { Schema, Document, Types } from "mongoose";

export interface IOrderCategory extends Document {
  tenantId: Types.ObjectId;
  name: string;
  description?: string;
  icon?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const orderCategorySchema = new Schema<IOrderCategory>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    icon: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

orderCategorySchema.index({ tenantId: 1, isActive: 1, sortOrder: 1 });
orderCategorySchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const OrderCategory = mongoose.model<IOrderCategory>("OrderCategory", orderCategorySchema);
