import mongoose, { Schema, Document, Types } from "mongoose";

export interface IImportConfig extends Document {
  tenantId: Types.ObjectId;
  isEnabled: boolean;
  intervalHours: number;
  syncProjects: boolean;
  sinceDays?: number;
  lastRun?: Date;
  nextRun?: Date;
  /** La importación quedó deprecada (ver `utils/importFramePausado.ts`): desde cuándo y por qué, junto al `isEnabled: false`. */
  deprecadoDesde?: string;
  nota?: string;
  createdAt: Date;
  updatedAt: Date;
}

const importConfigSchema = new Schema<IImportConfig>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, unique: true },
    isEnabled: { type: Boolean, default: false },
    intervalHours: { type: Number, default: 24 },
    syncProjects: { type: Boolean, default: true },
    sinceDays: { type: Number, default: undefined },
    lastRun: { type: Date },
    nextRun: { type: Date },
    deprecadoDesde: { type: String },
    nota: { type: String },
  },
  { timestamps: true }
);

export const ImportConfig = mongoose.model<IImportConfig>("ImportConfig", importConfigSchema);
