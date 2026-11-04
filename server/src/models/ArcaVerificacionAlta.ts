import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * AUDITORÍA DE LA VERIFICACIÓN DE ALTAS EN ARCA (pedido del 02/11/2026, ver
 * `services/arca/verificacionAltas.ts`): una fila por cada alta verificada, con lo que se vio en ARCA,
 * qué se decidió y qué se hizo. Es el «resultado crudo» que la pantalla muestra en el detalle de un alta
 * que quedó para revisión manual.
 *
 * `html` es la pantalla de Consultas tal como quedó, anonimizada por el motor (`htmlAnonimo`: sin CUIL,
 * CUIT ni VIEWSTATE). Pesa: el listado no la trae, se pide por id.
 */
export interface IArcaVerificacionAlta extends Document {
  tenantId: Types.ObjectId;
  userProjectId: Types.ObjectId;
  contractIndex: number;
  cuil: string;
  nombre: string;
  empresaId?: Types.ObjectId;
  empresaRazonSocial?: string;
  /** El contrato al verificarlo: "YYYY-MM-DD". */
  alta: string;
  baja: string;
  /** La automática (después de la corrida del día) o alguien con «Reverificar en ARCA». */
  automatica: boolean;
  usuarioId?: Types.ObjectId;
  /** Sin escribir en el contrato: sólo se miró qué pasaría. */
  enSeco: boolean;
  /** Lo que devolvió la consulta: `ok` con las relaciones leídas, o el error. */
  consulta: { ok: boolean; error?: string; encontrada?: boolean | null; relaciones?: Array<{ inicio: string; fin: string; baja?: string; texto?: string }> } | null;
  /** Qué se decidió (`decidirVerificacion`). */
  decision: "presentada" | "revision_manual";
  motivo: string;
  /** Qué se hizo con el contrato: `marcada_presentada`, `revision_manual`, `ya_resuelta` (otra corrida llegó antes), `contrato_cambio`, `en_seco`. */
  accion: string;
  html?: string;
  /** `consulta`: ARCA en vivo. `sync`: Relaciones Laborales sincronizadas (alta externa, ver `adopcionAltasExternas.ts`). */
  origen?: "consulta" | "sync";
  /** Qué la detectó: `sincronizacion`, `corrida_diaria`, `presentacion_masiva`, `manual`. */
  detectadaPor?: string;
  /** Alta externa: lo esperado y lo encontrado en ARCA. */
  ladoALado?: { esperado: { inicio: string; fin: string; modalidad: string }; encontradas: Array<{ inicio: string; fin: string; modalidad: string }> };
  createdAt: Date;
}

const schema = new Schema<IArcaVerificacionAlta>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userProjectId: { type: Schema.Types.ObjectId, ref: "UserProject", required: true },
    contractIndex: { type: Number, required: true },
    cuil: String,
    nombre: String,
    empresaId: { type: Schema.Types.ObjectId, ref: "Company" },
    empresaRazonSocial: String,
    alta: String,
    baja: String,
    automatica: { type: Boolean, default: false },
    usuarioId: { type: Schema.Types.ObjectId, ref: "User" },
    enSeco: { type: Boolean, default: false },
    consulta: { type: Schema.Types.Mixed, default: null },
    decision: { type: String, enum: ["presentada", "revision_manual"], required: true },
    motivo: String,
    accion: String,
    html: String,
    origen: { type: String, enum: ["consulta", "sync"] },
    detectadaPor: String,
    ladoALado: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "arca_verificaciones_altas" },
);
schema.index({ tenantId: 1, userProjectId: 1, contractIndex: 1, createdAt: -1 });

export const ArcaVerificacionAlta: Model<IArcaVerificacionAlta> = mongoose.models.ArcaVerificacionAlta || mongoose.model<IArcaVerificacionAlta>("ArcaVerificacionAlta", schema);
