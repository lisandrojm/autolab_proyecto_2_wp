import mongoose, { Schema, Document } from "mongoose";

interface IVacationConfig extends Document {
  tenantId: mongoose.Types.ObjectId;
  diasBeneficio?: number;
  maxDiasGozados?: number;
  permiteArrastre: boolean;
  maxDiasArrastre?: number;
  vencimientoArrastreDias?: number;

  maxDiasHabiles?: number;
  anticipacionMinimaDias?: number;
  permiteFraccionadas: boolean;
  minDiasFraccion?: number;
  diasCorridos: boolean;
  requiereFirma: boolean;
  pdfId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const VacationConfigSchema = new Schema<IVacationConfig>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      unique: true,
      index: true,
    },
    diasBeneficio: {
      type: Number,
      required: false,
      min: 0,
    },
    maxDiasGozados: {
      type: Number,
      required: false,
      min: 0,
    },
    permiteArrastre: {
      type: Boolean,
      required: true,
      default: false,
    },
    maxDiasArrastre: {
      type: Number,
      required: false,
      min: 0,
    },
    vencimientoArrastreDias: {
      type: Number,
      required: false,
      min: 0,
    },

    maxDiasHabiles: {
      type: Number,
      required: false,
      min: 0,
    },
    anticipacionMinimaDias: {
      type: Number,
      required: false,
      min: 0,
    },
    permiteFraccionadas: {
      type: Boolean,
      required: true,
      default: true,
    },
    minDiasFraccion: {
      type: Number,
      required: true,
      default: 7,
      min: 1,
    },
    diasCorridos: {
      type: Boolean,
      required: true,
      default: false,
    },
    requiereFirma: {
      type: Boolean,
      required: true,
      default: true,
    },
    pdfId: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
    collection: "vacation_config",
  },
);

VacationConfigSchema.statics.getOrCreateDefault = async function (tenantId: mongoose.Types.ObjectId) {
  let config = await this.findOne({ tenantId });

  if (!config) {
    config = await this.create({
      tenantId,
      permiteArrastre: false,
      permiteFraccionadas: true,
      requiereFirma: true,
    });
  }

  return config;
};

export const VacationConfig = mongoose.model<IVacationConfig>("VacationConfig", VacationConfigSchema);
