import mongoose, { Schema, Document, Types, Model } from "mongoose";

export interface IProjectMetadata {
  id: number;
  nombre: string;
  descripcion: string;
  responsableId: number;
  clienteId: number;
  fechaInicio: string;
  fechaFin: string;
  fechaAlta: string;
  sedeId: number;
  activo: boolean;
  centroCostoId: number;
}

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
  clientId?: Types.ObjectId;
  contratoEmpresas?: Types.ObjectId[];
  /**
   * LOS CONVENIOS BAJO LOS QUE ESTE PROYECTO CONTRATA.
   *
   * Cuelgan de `contratoEmpresas`: solo pueden ser convenios que alguna de esas empleadoras tenga
   * registrados ante ARCA, porque el organismo únicamente acepta categorías de los CCT que ese CUIT
   * registró. Sacarle una empresa al proyecto se lleva sus convenios.
   *
   * Sirven para acotar el alta: una productora puede tener seis CCT registrados y este proyecto
   * contratar bajo uno. Con la lista cargada, el alta ofrece esa; vacía, ofrece todas las de la
   * empresa — vacío es «todavía no se acotó», no «ninguno».
   */
  convenioIds?: Types.ObjectId[];
  releaseEmpresas?: Types.ObjectId[];
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
    canRegister: boolean;
    useProjectSchedule?: boolean;
    startTime?: string;
    endTime?: string;
    areaId?: Types.ObjectId;
    shiftId?: Types.ObjectId;
    areaShiftAssignments?: {
      areaId: Types.ObjectId;
      shiftIds: Types.ObjectId[];
    }[];
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
    allowsAdditionalStaff?: boolean;
    allowedPastDays?: number;
    schedule?: {
      type: "daily" | "workdays" | "custom";
      days: number[];
    };
  };
  externalId?: number;
  metadata?: IProjectMetadata;
  workSchedule?: IWorkSchedule;
  turnos: Types.ObjectId[];
  areasConfig?: {
    areaId: Types.ObjectId;
    shiftIds: Types.ObjectId[];
  }[];
  coordinatorAssignments?: {
    areaId: Types.ObjectId;
    shiftId: Types.ObjectId;
    userId: Types.ObjectId;
  }[];
}

const projectSchema = new Schema<IProject>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", index: true },
    contratoEmpresas: [{ type: Schema.Types.ObjectId, ref: "Company" }],
    convenioIds: [{ type: Schema.Types.ObjectId, ref: "Convenio" }],
    releaseEmpresas: [{ type: Schema.Types.ObjectId, ref: "Company" }],

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
        canRegister: { type: Boolean, default: true }, // Puede registrar novedades
        // Individual work schedule
        useProjectSchedule: { type: Boolean, default: true }, // Use project's schedule by default
        startTime: { type: String }, // "HH:mm" format
        endTime: { type: String }, // "HH:mm" format
        areaId: { type: Schema.Types.ObjectId, ref: "Area" },
        shiftId: { type: Schema.Types.ObjectId, ref: "Shift" },
        areaShiftAssignments: [
          {
            areaId: { type: Schema.Types.ObjectId, ref: "Area" },
            shiftIds: [{ type: Schema.Types.ObjectId, ref: "Shift" }],
          },
        ],
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
      enableFastEntry: { type: Boolean },
      allowsAdditionalStaff: { type: Boolean },
      allowedPastDays: { type: Number },
      schedule: {
        type: { type: String, enum: ["daily", "workdays", "custom"] },
        days: [{ type: Number }],
      },
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

    externalId: { type: Number, index: true },
    metadata: {
      id: { type: Number },
      nombre: { type: String },
      descripcion: { type: String },
      responsableId: { type: Number, required: true },
      clienteId: { type: Number },
      fechaInicio: { type: String },
      fechaFin: { type: String },
      fechaAlta: { type: String },
      sedeId: { type: Number },
      activo: { type: Boolean },
      centroCostoId: { type: Number },
    },
    turnos: [{ type: Schema.Types.ObjectId, ref: "Shift", index: true }],
    areasConfig: [
      {
        areaId: { type: Schema.Types.ObjectId, ref: "Area", required: true },
        shiftIds: [{ type: Schema.Types.ObjectId, ref: "Shift", required: true }],
      },
    ],
    coordinatorAssignments: [
      {
        areaId: { type: Schema.Types.ObjectId, ref: "Area", required: true },
        shiftId: { type: Schema.Types.ObjectId, ref: "Shift", required: true },
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
      },
    ],
  },
  { timestamps: true },
);

projectSchema.index({ tenantId: 1, clientId: 1, name: 1 }, { unique: true });
projectSchema.index({ tenantId: 1, clientId: 1, createdAt: -1 });
// `alcanceDeResponsable` corre en CADA request de alguien que no es admin (proyectos y clientes)
// y busca por este campo; sin el índice, cada una escanea todos los proyectos del tenant.
projectSchema.index({ tenantId: 1, "metadata.responsableId": 1 });
// Los proyectos que alguien COORDINA (Contratos por vencer, alcance del coordinador en Usuarios). Sin
// esto la consulta recorre la colección entera, y los proyectos son documentos pesados.
projectSchema.index({ tenantId: 1, "coordinatorAssignments.userId": 1 });

export const Project: Model<IProject> = mongoose.model<IProject>("Project", projectSchema);
