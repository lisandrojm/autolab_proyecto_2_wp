import mongoose, { Schema, Document, Types } from "mongoose";

export type TipoAccionFutura = "documento" | "otra";

export type DeadlineMode = "none" | "plazoDias" | "fechaEspecifica";

export type DateMode = "single" | "range";

export interface ISubtype {
  id: string;
  label: string;
  requiere_certificado?: boolean;
  [key: string]: any;
}

export interface IFutureActionConfig {
  enabled?: boolean;
  tipoAccionPorDefecto?: string;
  plazoDiasPorDefecto?: number;
  responsablePorDefecto?: string;
  requiereDocumento?: boolean;
  documentoRequerido?: string;
}

export interface ICategoryConfig {
  subtipos?: ISubtype[];
  futureActionConfig?: IFutureActionConfig;
  [key: string]: any;
}

export interface IOrderCategory extends Document {
  tenantId: Types.ObjectId;
  name: string;
  informacion?: string;
  icon?: string;
  isActive: boolean;
  sortOrder: number;
  categoryType: "fecha" | "dinero" | "objeto" | "otros";
  dateMode?: DateMode;
  config: ICategoryConfig;
  montoMaximo?: number;
  requiresAction?: boolean;
  actionText?: string;
  actionDescription?: string;
  tituloAccion?: string;
  futureActionType?: TipoAccionFutura;
  deadlineMode?: DeadlineMode;
  plazoDias?: number;
  fechaLimite?: Date;
  documentoRequerido?: string;
  requiresSignature?: boolean;
  requiresUserConfirmation?: boolean;
  pdfTemplateId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const orderCategorySchema = new Schema<IOrderCategory>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true, trim: true },
    informacion: { type: String, trim: true },
    icon: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    categoryType: {
      type: String,
      enum: ["fecha", "dinero", "objeto", "otros"],
      default: "otros",
      index: true
    },
    dateMode: {
      type: String,
      enum: ["single", "range"],
      default: "single",
      trim: true
    },
    config: { type: Schema.Types.Mixed, default: {} },
    montoMaximo: { type: Number, min: 0 },
    requiresAction: { type: Boolean, default: false },
    actionText: { type: String, trim: true },
    actionDescription: { type: String, trim: true },
    tituloAccion: { type: String, trim: true },
    futureActionType: {
      type: String,
      enum: ["documento", "otra"],
      trim: true
    },
    deadlineMode: {
      type: String,
      enum: ["none", "plazoDias", "fechaEspecifica"],
      default: "none",
      trim: true
    },
    plazoDias: { type: Number, min: 1, max: 365 },
    fechaLimite: { type: Date },
    documentoRequerido: { type: String, trim: true },
    requiresSignature: { type: Boolean, default: true },
    requiresUserConfirmation: { type: Boolean, default: false },
    pdfTemplateId: { type: Schema.Types.ObjectId, ref: "PdfTemplate" },
  },
  { timestamps: true }
);

orderCategorySchema.index({ tenantId: 1, isActive: 1, sortOrder: 1 });
orderCategorySchema.index({ tenantId: 1, name: 1 }, { unique: true });
orderCategorySchema.index({ tenantId: 1, categoryType: 1 });

export const OrderCategory = mongoose.model<IOrderCategory>("OrderCategory", orderCategorySchema);
