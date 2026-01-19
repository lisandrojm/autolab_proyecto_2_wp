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

export interface IProject extends Document {
  tenantId: Types.ObjectId;
  clientId?: Types.ObjectId;
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
  favorite?: boolean;
  vacationConfig?: {
    useGlobalConfig: boolean;
    permiteFraccionadas: boolean;
    minDiasFraccion?: number;
    diasCorridos?: boolean;
  };
  externalId?: number;
  metadata?: IProjectMetadata;
}

const projectSchema = new Schema<IProject>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", index: true },

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

    favorite: { type: Boolean, default: false, index: true },

    vacationConfig: {
      useGlobalConfig: { type: Boolean, default: true },
      permiteFraccionadas: { type: Boolean, default: true },
      minDiasFraccion: { type: Number },
      diasCorridos: { type: Boolean },
    },

    externalId: { type: Number, index: true },
    metadata: {
      id: { type: Number },
      nombre: { type: String },
      descripcion: { type: String },
      responsableId: { type: Number },
      clienteId: { type: Number },
      fechaInicio: { type: String },
      fechaFin: { type: String },
      fechaAlta: { type: String },
      sedeId: { type: Number },
      activo: { type: Boolean },
      centroCostoId: { type: Number },
    },
  },
  { timestamps: true },
);

projectSchema.index({ tenantId: 1, clientId: 1, name: 1 }, { unique: true });
projectSchema.index({ tenantId: 1, clientId: 1, createdAt: -1 });

export const Project: Model<IProject> = mongoose.model<IProject>("Project", projectSchema);
