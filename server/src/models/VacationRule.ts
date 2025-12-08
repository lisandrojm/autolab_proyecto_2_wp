import mongoose, { Schema, Document } from "mongoose";

export interface IVacationRule extends Document {
  tenantId: mongoose.Types.ObjectId;
  active: boolean;
  name: string;
  diasAnuales: number;
  diasBeneficio: number;
  requiereFirma: boolean;
  scope: "all" | "cargo" | "nivel" | "cargo_nivel";
  position?: string;
  level?: string;
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
    diasAnuales: {
      type: Number,
      required: true,
    },
    diasBeneficio: {
      type: Number,
      default: 0,
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
  },
  {
    timestamps: true,
    collection: "vacationsRules",
  }
);

// Índice compuesto para búsquedas eficientes
VacationRuleSchema.index({ tenantId: 1, active: 1 });
VacationRuleSchema.index({ tenantId: 1, scope: 1 });

export const VacationRule = mongoose.model<IVacationRule>("VacationRule", VacationRuleSchema);
