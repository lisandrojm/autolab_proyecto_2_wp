import mongoose, { Schema, Document, Model, Types } from "mongoose";
import type { EstadoConstancia, Intento, CarpetaDelDocumento } from "../services/arca/cicloConstancia.js";

/**
 * LA CONSTANCIA DE CADA ALTA PRESENTADA EN ARCA (07/11/2026): una por persona + empleadora + fecha de
 * alta (`clave`, única por tenant), con su estado en el circuito, cada intento de bajarla y dónde está
 * hoy el documento. Las reglas son de `services/arca/cicloConstancia.ts`; quien escribe acá es
 * `services/arca/constanciasArca.ts`.
 *
 * Va en su colección y no en el contrato: los intentos crecen, y `users_&_projects` es lo que más pesa
 * en cada lectura de contratos. El contrato sigue guardando su `altaConstancia` (lo que se validó y a
 * dónde se subió) como siempre.
 */
export interface IConstanciaArca extends Document {
  tenantId: Types.ObjectId;
  clave: string;
  cuil: string;
  nombre: string;
  userId?: Types.ObjectId | null;
  userProjectId: Types.ObjectId;
  contractIndex: number;
  empresaId?: Types.ObjectId | null;
  empresaCuit: string;
  empresaRazonSocial: string;
  /** YYYY-MM-DD. */
  fechaAlta: string;
  fechaBaja: string;
  presentadaEl?: Date | null;
  /** La corrida que la presentó (`arca_altas_logs`), si se sabe. */
  logId?: Types.ObjectId | null;
  estado: EstadoConstancia;
  /** La constancia que dio ARCA: «alta», o «baja» de una relación que ya terminó (aceptada). */
  tipoConstancia?: "alta" | "baja" | null;
  /** Alta y baja el mismo día (jornada). */
  mismoDia: boolean;
  intentos: Intento[];
  proximoIntentoEl?: Date | null;
  motivoRevision?: string | null;
  documento?: {
    /** «ID-000663»: con esto se lo encuentra en cualquier carpeta. */
    codigo?: string;
    nombre?: string;
    /** El path de hoy (o el último conocido). */
    path?: string;
    /** El id de Dropbox del archivo subido: sigue al archivo si se mueve o renombra. */
    dropboxId?: string;
    carpeta?: CarpetaDelDocumento | null;
    vaAFirma?: boolean;
    /** Ya pasó por firma (para contarla como firmada aunque esté archivada). */
    firmadaEl?: Date | null;
    archivadaEn?: string | null;
    ubicadoEl?: Date | null;
    /** No aparece en ninguna carpeta del circuito. */
    noUbicadoDesde?: Date | null;
  } | null;
  /** Cada cambio de estado, para la trazabilidad. */
  historial: Array<{ estado: EstadoConstancia; fecha: Date; motivo?: string }>;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IConstanciaArca>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    clave: { type: String, required: true },
    cuil: { type: String, required: true },
    nombre: { type: String, default: "" },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    userProjectId: { type: Schema.Types.ObjectId, required: true },
    contractIndex: { type: Number, required: true },
    empresaId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    empresaCuit: { type: String, default: "" },
    empresaRazonSocial: { type: String, default: "" },
    fechaAlta: { type: String, required: true },
    fechaBaja: { type: String, default: "" },
    presentadaEl: { type: Date, default: null },
    logId: { type: Schema.Types.ObjectId, default: null },
    estado: { type: String, required: true },
    tipoConstancia: { type: String, default: null },
    mismoDia: { type: Boolean, default: false },
    intentos: [{ _id: false, fecha: Date, resultado: String, detalle: String, manual: Boolean }],
    proximoIntentoEl: { type: Date, default: null },
    motivoRevision: { type: String, default: null },
    documento: {
      type: new Schema(
        {
          codigo: String,
          nombre: String,
          path: String,
          dropboxId: String,
          carpeta: { type: String, default: null },
          vaAFirma: Boolean,
          firmadaEl: { type: Date, default: null },
          archivadaEn: { type: String, default: null },
          ubicadoEl: { type: Date, default: null },
          noUbicadoDesde: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    historial: [{ _id: false, estado: String, fecha: Date, motivo: String }],
  },
  { timestamps: true, collection: "constancias_arca" },
);

// La idempotencia: una sola constancia por persona + empleadora + fecha de alta, por más corridas que haya.
schema.index({ tenantId: 1, clave: 1 }, { unique: true });
schema.index({ tenantId: 1, estado: 1 });
schema.index({ tenantId: 1, "documento.codigo": 1 });

export const ConstanciaArca: Model<IConstanciaArca> = mongoose.model<IConstanciaArca>("ConstanciaArca", schema);
