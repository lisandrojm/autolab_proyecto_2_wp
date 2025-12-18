import mongoose, { Schema, Document } from "mongoose";

interface AntiguedadTramo {
  desde: number;
  hasta: number;
  dias: number;
}

export interface IGlobalVacationConfig extends Document {
  tenantId: mongoose.Types.ObjectId;
  diasAnuales: number;
  diasBeneficio?: number;
  antiguedadTramos?: AntiguedadTramo[];
  maxDiasGozados?: number;
  permiteArrastre: boolean;
  maxDiasArrastre?: number;
  vencimientoArrastreDias?: number;

  maxDiasHabiles?: number;
  anticipacionMinimaDias?: number;
  permiteFraccionadas: boolean;
  requiereFirma: boolean;
  pdfTemplateId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const GlobalVacationConfigSchema = new Schema<IGlobalVacationConfig>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      unique: true,
      index: true,
    },
    diasAnuales: {
      type: Number,
      required: true,
      default: 18,
      min: 0,
    },
    diasBeneficio: {
      type: Number,
      required: false,
      min: 0,
    },
    antiguedadTramos: {
      type: [
        {
          desde: { type: Number, required: true },
          hasta: { type: Number, required: true },
          dias: { type: Number, required: true },
        },
      ],
      required: false,
      default: [],
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
      default: false,
    },
    requiereFirma: {
      type: Boolean,
      required: true,
      default: true,
    },
    pdfTemplateId: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
    collection: "globalVacationConfig",
  }
);

GlobalVacationConfigSchema.statics.getOrCreateDefault = async function (tenantId: mongoose.Types.ObjectId) {
  let config = await this.findOne({ tenantId });

  if (!config) {
    config = await this.create({
      tenantId,
      diasAnuales: 18,
      permiteArrastre: false,
      permiteFraccionadas: true,
      requiereFirma: true,
      antiguedadTramos: [],
    });
  }

  return config;
};

export const GlobalVacationConfig = mongoose.model<IGlobalVacationConfig>("GlobalVacationConfig", GlobalVacationConfigSchema);
