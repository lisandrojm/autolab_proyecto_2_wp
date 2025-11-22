import mongoose, { Schema, Document, Types } from "mongoose";

export interface IOrderCounter extends Document {
  tenantId: Types.ObjectId;
  sequence: number;
  createdAt: Date;
  updatedAt: Date;
}

const orderCounterSchema = new Schema<IOrderCounter>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      unique: true,
      index: true,
    },
    sequence: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

orderCounterSchema.index({ tenantId: 1 }, { unique: true });

orderCounterSchema.statics.getNextSequence = async function (
  tenantId: Types.ObjectId
): Promise<number> {
  const counter = await this.findOneAndUpdate(
    { tenantId },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return counter.sequence;
};

export interface IOrderCounterModel extends mongoose.Model<IOrderCounter> {
  getNextSequence(tenantId: Types.ObjectId): Promise<number>;
}

export const OrderCounter = mongoose.model<IOrderCounter, IOrderCounterModel>(
  "OrderCounter",
  orderCounterSchema
);
