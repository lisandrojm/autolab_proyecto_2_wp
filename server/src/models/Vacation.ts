import mongoose, { Schema, Document } from "mongoose";

export interface IVacation extends Document {
  type: "rule" | "record" | "history";
  tenantId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  active: boolean;
  data: any;
}

const VacationSchema = new Schema<IVacation>(
  {
    type: {
      type: String,
      required: true,
      enum: ["rule", "record", "history"],
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    data: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "vacations",
  }
);

// Índice compuesto para búsquedas eficientes
VacationSchema.index({ tenantId: 1, type: 1, active: 1 });

export const Vacation = mongoose.model<IVacation>("Vacation", VacationSchema);
