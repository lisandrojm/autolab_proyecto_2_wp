import mongoose, { Schema, Document, Types } from "mongoose";

export interface IWorkScheduleDay {
  startTime: string; // "HH:mm" format
  endTime: string; // "HH:mm" format
  isWorkDay: boolean;
}

export interface IWorkSchedule {
  mode: "weekdays" | "all_week" | "per_day"; // weekdays = L-V only, all_week = L-D same hours, per_day = individual
  weekdays?: IWorkScheduleDay; // Lunes a Viernes (when mode is weekdays_weekend)
  weekend?: IWorkScheduleDay; // Sábado y Domingo (when mode is weekdays_weekend)
  days?: {
    // Individual days (when mode is per_day)
    monday?: IWorkScheduleDay;
    tuesday?: IWorkScheduleDay;
    wednesday?: IWorkScheduleDay;
    thursday?: IWorkScheduleDay;
    friday?: IWorkScheduleDay;
    saturday?: IWorkScheduleDay;
    sunday?: IWorkScheduleDay;
  };
}

export interface IProject extends Document {
  tenantId: Types.ObjectId;
  clientId: Types.ObjectId;
  name: string;
  description?: string;
  status: "active" | "completed" | "on_hold" | "archived";
  startDate?: Date;
  endDate?: Date;
  objectives: string[];
  targetAudience?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  assignedUsers: Types.ObjectId[];
  teamConfig?: {
    userId: Types.ObjectId;
    isNotifier: boolean;
    canRegister: boolean;
  }[];
  favorite?: boolean;
  vacationConfig?: {
    useGlobalConfig: boolean;
    permiteFraccionadas: boolean;
    minDiasFraccion?: number;
    diasCorridos?: boolean;
  };
  activityLogConfig?: {
    useGlobalConfig: boolean;
    enableFastEntry?: boolean;
  };
  workSchedule?: IWorkSchedule;
}

const projectSchema = new Schema<IProject>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },

    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    status: {
      type: String,
      enum: ["active", "completed", "on_hold", "archived"],
      default: "active",
      index: true,
    },

    startDate: { type: Date },
    endDate: { type: Date },

    objectives: { type: [String], required: true, default: [] },
    targetAudience: { type: String, trim: true },

    createdBy: { type: String, required: true },

    assignedUsers: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],

    // Configuración específica de miembros para Novedades
    teamConfig: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User" },
        isNotifier: { type: Boolean, default: false }, // Recibe notificaciones
        canRegister: { type: Boolean, default: true }, // Puede registrar novedades
      },
    ],

    favorite: { type: Boolean, default: false, index: true },
    vacationConfig: {
      useGlobalConfig: { type: Boolean, default: true },
      permiteFraccionadas: { type: Boolean, default: true },
      minDiasFraccion: { type: Number },
      diasCorridos: { type: Boolean },
    },
    activityLogConfig: {
      useGlobalConfig: { type: Boolean, default: true },
      enableFastEntry: { type: Boolean, default: true },
    },
    workSchedule: {
      mode: { type: String, enum: ["weekdays", "all_week", "per_day"], default: "weekdays" },
      weekdays: {
        startTime: { type: String },
        endTime: { type: String },
        isWorkDay: { type: Boolean, default: true },
      },
      weekend: {
        startTime: { type: String },
        endTime: { type: String },
        isWorkDay: { type: Boolean, default: false },
      },
      days: {
        monday: { startTime: String, endTime: String, isWorkDay: { type: Boolean, default: true } },
        tuesday: { startTime: String, endTime: String, isWorkDay: { type: Boolean, default: true } },
        wednesday: { startTime: String, endTime: String, isWorkDay: { type: Boolean, default: true } },
        thursday: { startTime: String, endTime: String, isWorkDay: { type: Boolean, default: true } },
        friday: { startTime: String, endTime: String, isWorkDay: { type: Boolean, default: true } },
        saturday: { startTime: String, endTime: String, isWorkDay: { type: Boolean, default: false } },
        sunday: { startTime: String, endTime: String, isWorkDay: { type: Boolean, default: false } },
      },
    },
  },
  { timestamps: true }
);

projectSchema.index({ tenantId: 1, clientId: 1, name: 1 }, { unique: true });
projectSchema.index({ tenantId: 1, clientId: 1, createdAt: -1 });

export const Project = mongoose.model<IProject>("Project", projectSchema);
