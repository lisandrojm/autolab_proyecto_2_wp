import mongoose, { Schema, Document } from "mongoose";
import { VacationCounter } from "./VacationCounter.js";

export interface IVacation extends Document {
  tenantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  vacationNumber: string;
  userName: string;
  position: string;
  level: string;
  vacationRuleIds?: mongoose.Types.ObjectId[]; // Array de reglas aplicadas
  startDate: Date;
  endDate: Date;
  daysRequested: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  diasDeVacacionesAnuales: number;
  balance: number;
  comments?: string;
  createdAt: Date;
  updatedAt: Date;
}

const VacationSchema = new Schema<IVacation>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    vacationNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    userName: {
      type: String,
      required: true,
    },
    position: {
      type: String,
      required: true,
    },
    level: {
      type: String,
      required: true,
    },
    vacationRuleIds: {
      type: [Schema.Types.ObjectId],
      ref: "VacationRule",
      required: false,
      default: [],
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    daysRequested: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
      index: true,
    },
    diasDeVacacionesAnuales: {
      type: Number,
      required: true,
    },
    balance: {
      type: Number,
      required: true,
    },
    comments: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
    collection: "vacations",
  }
);

// Índices compuestos para búsquedas eficientes
VacationSchema.index({ tenantId: 1, status: 1 });
VacationSchema.index({ tenantId: 1, userId: 1 });
VacationSchema.index({ tenantId: 1, vacationNumber: 1 }, { unique: true });

VacationSchema.pre("validate", async function (next) {
  if (!this.isNew || this.vacationNumber) {
    return next();
  }

  try {
    const Tenant = mongoose.model("Tenant");
    const tenant = await Tenant.findById(this.tenantId);

    if (!tenant) {
      throw new Error("Tenant not found");
    }

    const prefix = tenant.slug.toUpperCase().slice(0, 3);
    const sequence = await VacationCounter.getNextSequence(this.tenantId);
    const paddedNumber = sequence.toString().padStart(6, "0");
    this.vacationNumber = `${prefix}-VAC-${paddedNumber}`;

    next();
  } catch (error) {
    next(error as Error);
  }
});

export const Vacation = mongoose.model<IVacation>("Vacation", VacationSchema);
