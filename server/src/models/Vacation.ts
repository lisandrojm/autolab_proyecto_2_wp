import mongoose, { Schema, Document } from "mongoose";

export interface IVacation extends Document {
  tenantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  userName: string;
  position: string;
  level: string;
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

export const Vacation = mongoose.model<IVacation>("Vacation", VacationSchema);
