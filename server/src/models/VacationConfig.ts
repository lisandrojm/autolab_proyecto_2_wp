import mongoose, { Schema, Document, Types, Model } from "mongoose";

// ─────────────────────────────────────────────────────────────────────────────
// Embedded Overlap Schema (for vacation overlap rules per area)
// ─────────────────────────────────────────────────────────────────────────────
// Embedded Overlap Schema (for vacation overlap rules per area)
// ─────────────────────────────────────────────────────────────────────────────
export interface IEmbeddedOverlap {
  _id?: Types.ObjectId;
  areaId?: Types.ObjectId;
  projectId?: Types.ObjectId;
  clientId?: Types.ObjectId;
  roleFrameId?: Types.ObjectId;
  maxSimultaneousUsers: number;
  description?: string;
  isActive: boolean;
  useActiveContractSchedule?: boolean;
}

const EmbeddedOverlapSchema = new Schema<IEmbeddedOverlap>(
  {
    areaId: { type: Schema.Types.ObjectId, ref: "Area" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    clientId: { type: Schema.Types.ObjectId, ref: "Client" },
    roleFrameId: { type: Schema.Types.ObjectId, ref: "RoleFrame" },
    maxSimultaneousUsers: { type: Number, required: true, min: 1 },
    description: { type: String },
    isActive: { type: Boolean, default: true },
    useActiveContractSchedule: { type: Boolean, default: false },
  },
  { _id: true },
);

// ─────────────────────────────────────────────────────────────────────────────
// VacationConfig Interface
// ─────────────────────────────────────────────────────────────────────────────
export interface IVacationConfig extends Document {
  tenantId: Types.ObjectId;
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
  /**
   * VENTANA ANUAL DE GOCE (10/11/2026): el tramo del año en que se pueden tomar vacaciones, sin año
   * ("MM-DD"), p. ej. 11-01 → 04-30. Apagada por defecto. Reglas en `compartido/ventanaGoce.ts`.
   */
  ventanaGoce?: { enabled: boolean; inicio: string; fin: string };
  /**
   * CAMPAÑA DE GOCE (15/11/2026): invitar a elegir fechas dentro de la ventana, con fecha límite, y si no
   * eligen, que la empresa asigne un tramo único. Reglas en `compartido/vacaciones/campania.ts`. No hay
   * opción de pagar en lugar de gozar: no es configurable porque no existe.
   */
  campania?: { activa: boolean; plazoParaDefinirDias: number; avisoMinimoDias: number; minDiasPorTramo: number; tiposContratoInvitar?: string[] };
  /**
   * DE QUÉ EMPLEADORA SE TOMA LA ANTIGÜEDAD (15/11/2026). Ya no se suman los días de todas: cuenta la
   * de una sola (ver `empresaDeComputo` en utils/antiguedadArca.ts).
   *  - `modo`: "empresaVigente" (la de la relación vigente o más reciente) o "precedenciaManual".
   *  - `precedencia`: empresas (ids de Company) en orden; la primera que la persona tenga gana. Sólo en modo manual.
   *  - `sumarEntreEmpresas`: el comportamiento viejo (todas sumadas). Apagado por defecto.
   */
  computoAntiguedad?: { modo: "empresaVigente" | "precedenciaManual"; precedencia: Types.ObjectId[]; sumarEntreEmpresas: boolean };
  requiereFirma: boolean;
  pdfId?: string;

  // Embedded overlaps
  overlaps: IEmbeddedOverlap[];

  // Contract rules
  /**
   * «Visibilidad por tipo de Contrato». Desde el 23/11/2026 la clave es `tipoContratoId`, el tipo del catálogo
   * (`contratos`). `contractId` es la clave vieja (el número de FRAME): las reglas viejas se traducen al leer
   * (`compartido/vacaciones/tipoDeContrato.ts`) y desaparecen con el próximo guardado.
   */
  contractRules?: {
    tipoContratoId?: string;
    contractId?: number;
    contractName: string;
    vacationsEnabled: boolean;
  }[];

  // Counter for vacation number generation
  vacationSequence: number;

  createdAt: Date;
  updatedAt: Date;
}

interface IVacationConfigModel extends Model<IVacationConfig> {
  getOrCreateDefault(tenantId: Types.ObjectId): Promise<IVacationConfig>;
  getNextVacationSequence(tenantId: Types.ObjectId): Promise<number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// VacationConfig Schema
// ─────────────────────────────────────────────────────────────────────────────
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
    // Ventana anual de goce. Los defaults hacen que un tenant que nunca la tocó la lea apagada.
    ventanaGoce: {
      enabled: { type: Boolean, default: false },
      inicio: { type: String, default: "11-01" },
      fin: { type: String, default: "04-30" },
    },
    // Campaña de goce. Con estos defaults, un tenant que nunca la tocó la lee apagada.
    campania: {
      activa: { type: Boolean, default: false },
      plazoParaDefinirDias: { type: Number, default: 14, min: 1, max: 120 },
      avisoMinimoDias: { type: Number, default: 30, min: 0, max: 180 },
      minDiasPorTramo: { type: Number, default: 7, min: 1, max: 60 },
      // Los tipos de contrato con que arranca tildada una campaña nueva. Vacío = todos los habilitados.
      tiposContratoInvitar: { type: [String], default: [] },
    },
    // Antigüedad por empresa. Con estos defaults, un tenant que nunca lo tocó lee «empresa vigente».
    computoAntiguedad: {
      modo: { type: String, enum: ["empresaVigente", "precedenciaManual"], default: "empresaVigente" },
      precedencia: { type: [{ type: Schema.Types.ObjectId, ref: "Company" }], default: [] },
      sumarEntreEmpresas: { type: Boolean, default: false },
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

    // Embedded overlaps array
    overlaps: {
      type: [EmbeddedOverlapSchema],
      default: [],
    },

    // Contract rules
    contractRules: {
      type: [
        {
          tipoContratoId: String,
          contractId: Number,
          contractName: String,
          vacationsEnabled: Boolean,
        },
      ],
      default: [],
    },

    // Counter for vacation number generation
    vacationSequence: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    collection: "vacations_configs",
  },
);

VacationConfigSchema.statics.getOrCreateDefault = async function (tenantId: Types.ObjectId) {
  let config = await this.findOne({ tenantId });

  if (!config) {
    config = await this.create({
      tenantId,
      permiteArrastre: false,
      permiteFraccionadas: true,
      requiereFirma: true,
      overlaps: [],
      vacationSequence: 0,
      computoAntiguedad: { modo: "empresaVigente", precedencia: [], sumarEntreEmpresas: false },
    });
  }

  return config;
};

VacationConfigSchema.statics.getNextVacationSequence = async function (tenantId: Types.ObjectId): Promise<number> {
  const config = await this.findOneAndUpdate({ tenantId }, { $inc: { vacationSequence: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true });
  return config.vacationSequence;
};

export const VacationConfig = mongoose.model<IVacationConfig, IVacationConfigModel>("VacationConfig", VacationConfigSchema);
