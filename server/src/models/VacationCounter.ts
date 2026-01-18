import mongoose, { Schema, Document, Types } from "mongoose";

export interface IVacationCounter extends Document {
  tenantId: Types.ObjectId;
  sequence: number;
  createdAt: Date;
  updatedAt: Date;
}

const vacationCounterSchema = new Schema<IVacationCounter>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    sequence: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true, collection: "vacations_counters" },
);

vacationCounterSchema.index({ tenantId: 1 }, { unique: true });

vacationCounterSchema.statics.getNextSequence = async function (tenantId: Types.ObjectId): Promise<number> {
  const counter = await this.findOneAndUpdate({ tenantId }, { $inc: { sequence: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true });

  return counter.sequence;
};

export interface IVacationCounterModel extends mongoose.Model<IVacationCounter> {
  getNextSequence(tenantId: Types.ObjectId): Promise<number>;
}

export const VacationCounter = mongoose.model<IVacationCounter, IVacationCounterModel>("VacationCounter", vacationCounterSchema);
