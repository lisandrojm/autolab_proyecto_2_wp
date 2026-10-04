import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Registro de cada corrida de ALTAS en ARCA (Carga Masiva o Altas Masivas).
 *
 * SIN TTL, a diferencia de `ArcaObrasSocialesLog`: aquel es un log operativo de lecturas, y esto es la
 * constancia de un trámite irreversible ante el organismo. Si alguna vez hay que responder «¿quién
 * presentó esta alta, cuándo y con qué número?», la respuesta es este documento.
 *
 * NO GUARDA el TXT ni claves. Los CUIL están en `contratos` (son el resultado por persona, que es lo
 * que se audita), pero no se vuelcan a la consola del servidor. `htmlResultado` va anonimizado: es la
 * pantalla que mostró ARCA después de presentar, y es lo que permite escribir el lector de esa
 * pantalla (que nunca se pudo relevar sin presentar de verdad).
 */
export interface IArcaAltasLog extends Document {
  tenantId: Types.ObjectId;
  tipo: "carga_masiva" | "altas_masivas";
  usuarioId?: Types.ObjectId;
  empresaId?: Types.ObjectId;
  empresaCuit?: string;
  empresaRazonSocial?: string;
  enSeco: boolean;
  contratos: Array<{ userProjectId: Types.ObjectId; contractIndex: number; cuil: string; nombre: string; resultado: string; motivo?: string; tanda?: number; cat?: string; porConsulta?: boolean }>;
  /** Altas Masivas por tandas: cada tanda con sus tiempos y su resultado. */
  tandas?: Array<{ n: number; cuils: string[]; inicio: Date; fin: Date; duracionMs: number; resultado: string; error?: string }>;
  /** El tope del pegado que decía la pantalla, y el que se usó (el menor entre ese y la constante). */
  topeEnPantalla?: number;
  topeUsado?: number;
  /** Por qué se cortó antes de terminar: `detenida`, `error`, `dialogo`, `rechazos_seguidos`… */
  motivoCorte?: string;
  codigoNovedad?: string;
  nroTransaccion?: string;
  fechaPresentacion?: string;
  estadoArca?: string;
  /** `enviada` | `aceptada` | `seco` | `indeterminado` | `fallo` | `detenida` | `en_curso` | `cortada`. */
  resultado: string;
  /** Si se llegó a apretar el botón irreversible. */
  irreversible: boolean;
  pasoFallido?: string;
  error?: string;
  textoArca?: string;
  dialogos?: string[];
  seLogueo?: boolean;
  tiempos?: any;
  duracionMs?: number;
  htmlResultado?: string;
  createdAt: Date;
}

const schema = new Schema<IArcaAltasLog>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    tipo: { type: String, enum: ["carga_masiva", "altas_masivas"], required: true },
    usuarioId: { type: Schema.Types.ObjectId, ref: "User" },
    empresaId: { type: Schema.Types.ObjectId, ref: "Company" },
    empresaCuit: String,
    empresaRazonSocial: String,
    enSeco: { type: Boolean, default: true },
    contratos: [{ _id: false, userProjectId: { type: Schema.Types.ObjectId, ref: "UserProject" }, contractIndex: Number, cuil: String, nombre: String, resultado: String, motivo: String, tanda: Number, cat: String, porConsulta: Boolean }],
    tandas: [{ _id: false, n: Number, cuils: [String], inicio: Date, fin: Date, duracionMs: Number, resultado: String, error: String }],
    topeEnPantalla: Number,
    topeUsado: Number,
    motivoCorte: String,
    codigoNovedad: String,
    nroTransaccion: String,
    fechaPresentacion: String,
    estadoArca: String,
    resultado: { type: String, required: true },
    irreversible: { type: Boolean, default: false },
    pasoFallido: String,
    error: String,
    textoArca: String,
    dialogos: [String],
    seLogueo: Boolean,
    tiempos: { type: Schema.Types.Mixed },
    duracionMs: Number,
    htmlResultado: String,
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "arca_altas_logs" },
);

schema.index({ tenantId: 1, createdAt: -1 });

export const ArcaAltasLog: Model<IArcaAltasLog> = mongoose.model<IArcaAltasLog>("ArcaAltasLog", schema);
