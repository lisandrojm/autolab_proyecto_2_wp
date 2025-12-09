import mongoose, { Schema, Document } from "mongoose";

interface AntiguedadTramo {
  desde: number;
  hasta: number;
  dias: number;
}

export interface IVacationRule extends Document {
  tenantId: mongoose.Types.ObjectId;
  active: boolean;
  name: string;
  description?: string;
  diasAnuales?: number;
  diasBeneficio?: number;
  requiereFirma: boolean;
  scope: "all" | "cargo" | "nivel" | "cargo_nivel";
  position?: string;
  level?: string;
  antiguedadTramos?: AntiguedadTramo[];
  maxDiasGozados?: number;
  permiteArrastre: boolean;
  maxDiasArrastre?: number;
  vencimientoArrastreDias?: number;
  minDiasPorSolicitud?: number;
  maxDiasCorridos?: number;
  maxDiasHabiles?: number;
  anticipacionMinimaDias?: number;
  permiteFraccionadas: boolean;
  pdfTemplateId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const VacationRuleSchema = new Schema<IVacationRule>(
  {
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
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: false,
    },
    diasAnuales: {
      type: Number,
      required: false,
      default: 0,
    },
    diasBeneficio: {
      type: Number,
      required: false,
    },
    requiereFirma: {
      type: Boolean,
      required: true,
      default: true,
    },
    scope: {
      type: String,
      required: true,
      enum: ["all", "cargo", "nivel", "cargo_nivel"],
    },
    position: {
      type: String,
      required: false,
    },
    level: {
      type: String,
      required: false,
    },
    antiguedadTramos: {
      type: [{
        desde: { type: Number, required: true },
        hasta: { type: Number, required: true },
        dias: { type: Number, required: true },
      }],
      required: false,
      default: [],
    },
    maxDiasGozados: {
      type: Number,
      required: false,
    },
    permiteArrastre: {
      type: Boolean,
      required: true,
      default: false,
    },
    maxDiasArrastre: {
      type: Number,
      required: false,
    },
    vencimientoArrastreDias: {
      type: Number,
      required: false,
    },
    minDiasPorSolicitud: {
      type: Number,
      required: false,
    },
    maxDiasCorridos: {
      type: Number,
      required: false,
    },
    maxDiasHabiles: {
      type: Number,
      required: false,
    },
    anticipacionMinimaDias: {
      type: Number,
      required: false,
    },
    permiteFraccionadas: {
      type: Boolean,
      required: true,
      default: false,
    },
    pdfTemplateId: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
    collection: "vacationsRules",
  }
);

// Validación pre-guardado
VacationRuleSchema.pre('save', function(next) {
  const hasAntiguedadTramos = this.antiguedadTramos && this.antiguedadTramos.length > 0;
  const hasDiasAnuales = this.diasAnuales && this.diasAnuales > 0;

  if (!hasAntiguedadTramos && !hasDiasAnuales) {
    const error = new Error('Debe especificar diasAnuales o al menos un tramo de antigüedad');
    return next(error);
  }

  next();
});

// Índice compuesto para búsquedas eficientes
VacationRuleSchema.index({ tenantId: 1, active: 1 });
VacationRuleSchema.index({ tenantId: 1, scope: 1 });

export const VacationRule = mongoose.model<IVacationRule>("VacationRule", VacationRuleSchema);
