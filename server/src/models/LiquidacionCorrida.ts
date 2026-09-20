import { Schema, model, Document, Types, Model } from "mongoose";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UNA CORRIDA DE LIQUIDACIÓN: lo que se calculó, cuándo y con qué reglas
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * RELIQUIDAR NO PISA: crea una corrida nueva. Las viejas quedan enteras, con sus números y sus
 * excepciones. Es lo que permite contestar "¿qué mandamos el mes pasado?" sin depender de que
 * alguien haya guardado el archivo, y comparar dos corridas del mismo período para ver qué cambió.
 *
 * GUARDA LAS LÍNEAS, NO SÓLO EL RESUMEN. Y cada línea guarda de qué eventos salió. Un archivo que
 * se puede regenerar pero no explicar es un archivo en el que hay que confiar a ciegas.
 */

export interface ILineaCorrida {
  empresaId?: Types.ObjectId | null;
  empresaNombre?: string | null;
  ccCodigo?: string | null;
  ccNombre?: string | null;
  regimen?: string | null;
  legajo?: string | null;
  apellidoYNombre: string;
  userId?: Types.ObjectId | null;
  conceptoCodigo: string;
  conceptoDescripcion?: string | null;
  par1: number;
  par2: number;
  /** En qué hoja del XLSX va. Ver `hojaDe` en `services/liquidacion/agregar.ts`. */
  hoja: string;
  /** Los eventos que componen el número. La trazabilidad, no un extra. */
  eventIds: string[];
  dias: number;
  origenes: string[];
}

export interface IExcepcionCorrida {
  motivo: string;
  userId?: Types.ObjectId | null;
  apellidoYNombre?: string | null;
  fecha?: string | null;
  eventoId?: string | null;
  detalle: string;
  /** Si impide descargar el archivo de importación o sólo avisa. */
  bloqueante: boolean;
}

export interface ILiquidacionCorrida extends Document {
  tenantId: Types.ObjectId;
  periodo: string;
  filtros: Record<string, unknown>;
  /**
   * CON QUÉ VERSIÓN DEL MAPEO se calculó: la fecha contra la que se evaluó la vigencia de los
   * efectos. Sin esto, dos corridas del mismo período con números distintos son un misterio.
   */
  versionMapeo: string;
  createdBy: Types.ObjectId;
  lineas: ILineaCorrida[];
  excepciones: IExcepcionCorrida[];
  resumen: {
    partes: number;
    eventos: number;
    lineas: number;
    personas: number;
    hojas: number;
    excepciones: number;
    bloqueantes: number;
  };
  /** Huella de las líneas: dos corridas con el mismo hash generan el mismo archivo. */
  hashLineas: string;
  createdAt: Date;
  updatedAt: Date;
}

const lineaSchema = new Schema<ILineaCorrida>(
  {
    empresaId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    empresaNombre: { type: String, default: null },
    ccCodigo: { type: String, default: null },
    ccNombre: { type: String, default: null },
    regimen: { type: String, default: null },
    legajo: { type: String, default: null },
    apellidoYNombre: { type: String, default: "" },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    conceptoCodigo: { type: String, required: true },
    conceptoDescripcion: { type: String, default: null },
    par1: { type: Number, default: 0 },
    par2: { type: Number, default: 0 },
    hoja: { type: String, default: "" },
    eventIds: { type: [String], default: [] },
    dias: { type: Number, default: 0 },
    origenes: { type: [String], default: [] },
  },
  { _id: false },
);

const excepcionSchema = new Schema<IExcepcionCorrida>(
  {
    motivo: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    apellidoYNombre: { type: String, default: null },
    fecha: { type: String, default: null },
    eventoId: { type: String, default: null },
    detalle: { type: String, default: "" },
    bloqueante: { type: Boolean, default: false },
  },
  { _id: false },
);

const corridaSchema = new Schema<ILiquidacionCorrida>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    periodo: { type: String, required: true },
    filtros: { type: Schema.Types.Mixed, default: {} },
    versionMapeo: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lineas: { type: [lineaSchema], default: [] },
    excepciones: { type: [excepcionSchema], default: [] },
    resumen: {
      partes: { type: Number, default: 0 },
      eventos: { type: Number, default: 0 },
      lineas: { type: Number, default: 0 },
      personas: { type: Number, default: 0 },
      hojas: { type: Number, default: 0 },
      excepciones: { type: Number, default: 0 },
      bloqueantes: { type: Number, default: 0 },
    },
    hashLineas: { type: String, default: "" },
  },
  { timestamps: true, collection: "liquidacion_corridas" },
);

// Las corridas se listan por período, de la más nueva a la más vieja.
corridaSchema.index({ tenantId: 1, periodo: 1, createdAt: -1 });

export const LiquidacionCorrida: Model<ILiquidacionCorrida> = model<ILiquidacionCorrida>("LiquidacionCorrida", corridaSchema);
