import mongoose, { Schema, Document, Types } from "mongoose";
import { ESTADOS_ITEM, ESTADOS_PLAN, type EstadoItem, type EstadoPlan } from "../compartido/planVacaciones/estado.js";

/**
 * EL PLAN DE VACACIONES DE UN PROYECTO (pedido del 17/10/2026): una temporada (ventana desde–hasta),
 * el equipo del proyecto agrupado por Área × Turno × Rol empresa, y por cada persona un BLOQUE de días
 * corridos en un mes de la ventana. El planificador arma los bloques (reparto automático por rol,
 * ajustable a mano), los envía al coordinador del proyecto, y recién cuando el coordinador aprueba un
 * bloque se crea la `Vacation` real (ya pre-aprobada) y sigue el circuito de siempre. Por cada rol y
 * mes puede pedirse un REEMPLAZO mensual: una Solicitud de contratación que cubre a los que salen.
 *
 * Todo embebido en un documento por plan: la grilla lo lee entero de una vez, y un equipo de 200
 * personas son unos 100 KB. `equipo` es un snapshot (para dibujar sin volver a calcular saldos); la
 * verdad se vuelve a mirar al aprobar.
 */

export interface IGrupoDelMiembro {
  areaId: Types.ObjectId;
  shiftId: Types.ObjectId;
  /** `_id` del RoleFrame; null si el contrato no declara rol. */
  rolFrameId: Types.ObjectId | null;
  nombreRol: string;
}

export interface IMiembroDelPlan {
  userId: Types.ObjectId;
  nombre: string;
  grupos: IGrupoDelMiembro[];
  /** `display.available` del año de saldo al momento del snapshot. */
  diasDisponibles: number;
  diasTotales: number;
  /** "YYYY-MM-DD" o null (indeterminado). */
  contratoVigenteHasta: string | null;
  empresaContratoId?: Types.ObjectId | null;
  tipoContratoId?: number | null;
  horaInicio?: string;
  horaFin?: string;
}

export interface IItemDelPlan {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  areaId: Types.ObjectId;
  shiftId: Types.ObjectId;
  rolFrameId: Types.ObjectId | null;
  nombreRol: string;
  /** "YYYY-MM" del mes al que se asignó. */
  mes: string;
  desde: string;
  hasta: string;
  dias: number;
  diasDisponiblesAlPlanificar: number;
  ajustadoAMano: boolean;
  estado: EstadoItem;
  motivoRechazo?: string;
  enviadoAt?: Date;
  aprobadoPor?: Types.ObjectId;
  aprobadoAt?: Date;
  rechazadoPor?: Types.ObjectId;
  rechazadoAt?: Date;
  /** La `Vacation` creada al aprobar. */
  vacationId?: Types.ObjectId;
  canceladoAt?: Date;
}

export interface IReemplazoDelPlan {
  _id: Types.ObjectId;
  areaId: Types.ObjectId;
  shiftId: Types.ObjectId;
  rolFrameId: Types.ObjectId | null;
  nombreRol: string;
  mes: string;
  /** La persona contratada para cubrir el mes. */
  userId: Types.ObjectId;
  contratoId: Types.ObjectId;
  nombreContrato: string;
  desde: string;
  hasta: string;
  cubreA: Array<{ userId: Types.ObjectId; desde: string; hasta: string }>;
  /** La Solicitud de contratación (un `User` con metadata) creada. */
  solicitudId?: Types.ObjectId;
  estado: "propuesto" | "solicitado" | "cancelado";
  creadoPor: Types.ObjectId;
  creadoAt: Date;
}

export interface IPlanVacaciones extends Document {
  tenantId: Types.ObjectId;
  projectId: Types.ObjectId;
  nombre: string;
  ventanaDesde: string;
  ventanaHasta: string;
  /** De qué año se descuentan los días (default: el año en que empieza la ventana). */
  anioDeSaldo: number;
  topeDiasPorPersona: number;
  estado: EstadoPlan;
  equipo: IMiembroDelPlan[];
  equipoActualizadoAt: Date;
  items: Types.DocumentArray<IItemDelPlan & Types.Subdocument>;
  reemplazos: Types.DocumentArray<IReemplazoDelPlan & Types.Subdocument>;
  creadoPor: Types.ObjectId;
  enviadoPor?: Types.ObjectId;
  enviadoAt?: Date;
  cerradoAt?: Date;
  canceladoAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const grupoSchema = new Schema<IGrupoDelMiembro>(
  {
    areaId: { type: Schema.Types.ObjectId, ref: "Area", required: true },
    shiftId: { type: Schema.Types.ObjectId, ref: "Shift", required: true },
    rolFrameId: { type: Schema.Types.ObjectId, ref: "RoleFrame", default: null },
    nombreRol: { type: String, default: "" },
  },
  { _id: false },
);

const miembroSchema = new Schema<IMiembroDelPlan>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    nombre: { type: String, default: "" },
    grupos: { type: [grupoSchema], default: [] },
    diasDisponibles: { type: Number, default: 0 },
    diasTotales: { type: Number, default: 0 },
    contratoVigenteHasta: { type: String, default: null },
    empresaContratoId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    tipoContratoId: { type: Number, default: null },
    horaInicio: { type: String },
    horaFin: { type: String },
  },
  { _id: false },
);

const itemSchema = new Schema<IItemDelPlan>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    areaId: { type: Schema.Types.ObjectId, ref: "Area", required: true },
    shiftId: { type: Schema.Types.ObjectId, ref: "Shift", required: true },
    rolFrameId: { type: Schema.Types.ObjectId, ref: "RoleFrame", default: null },
    nombreRol: { type: String, default: "" },
    mes: { type: String, required: true },
    desde: { type: String, required: true },
    hasta: { type: String, required: true },
    dias: { type: Number, required: true },
    diasDisponiblesAlPlanificar: { type: Number, default: 0 },
    ajustadoAMano: { type: Boolean, default: false },
    estado: { type: String, enum: ESTADOS_ITEM, default: "propuesto" },
    motivoRechazo: { type: String },
    enviadoAt: { type: Date },
    aprobadoPor: { type: Schema.Types.ObjectId, ref: "User" },
    aprobadoAt: { type: Date },
    rechazadoPor: { type: Schema.Types.ObjectId, ref: "User" },
    rechazadoAt: { type: Date },
    vacationId: { type: Schema.Types.ObjectId, ref: "Vacation" },
    canceladoAt: { type: Date },
  },
  { _id: true },
);

const reemplazoSchema = new Schema<IReemplazoDelPlan>(
  {
    areaId: { type: Schema.Types.ObjectId, ref: "Area", required: true },
    shiftId: { type: Schema.Types.ObjectId, ref: "Shift", required: true },
    rolFrameId: { type: Schema.Types.ObjectId, ref: "RoleFrame", default: null },
    nombreRol: { type: String, default: "" },
    mes: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    contratoId: { type: Schema.Types.ObjectId, ref: "Contrato", required: true },
    nombreContrato: { type: String, default: "" },
    desde: { type: String, required: true },
    hasta: { type: String, required: true },
    cubreA: { type: [new Schema({ userId: { type: Schema.Types.ObjectId, ref: "User" }, desde: String, hasta: String }, { _id: false })], default: [] },
    solicitudId: { type: Schema.Types.ObjectId, ref: "User" },
    estado: { type: String, enum: ["propuesto", "solicitado", "cancelado"], default: "propuesto" },
    creadoPor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    creadoAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const planVacacionesSchema = new Schema<IPlanVacaciones>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    nombre: { type: String, required: true, trim: true },
    ventanaDesde: { type: String, required: true },
    ventanaHasta: { type: String, required: true },
    anioDeSaldo: { type: Number, required: true },
    topeDiasPorPersona: { type: Number, default: 15 },
    estado: { type: String, enum: ESTADOS_PLAN, default: "borrador" },
    equipo: { type: [miembroSchema], default: [] },
    equipoActualizadoAt: { type: Date, default: Date.now },
    items: { type: [itemSchema], default: [] },
    reemplazos: { type: [reemplazoSchema], default: [] },
    creadoPor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    enviadoPor: { type: Schema.Types.ObjectId, ref: "User" },
    enviadoAt: { type: Date },
    cerradoAt: { type: Date },
    canceladoAt: { type: Date },
  },
  { timestamps: true, collection: "planes_vacaciones" },
);

planVacacionesSchema.index({ tenantId: 1, projectId: 1, ventanaDesde: -1 });
planVacacionesSchema.index({ tenantId: 1, estado: 1 });
// «¿Esta persona ya está en otro plan?» y «¿qué bloque creó esta vacación?».
planVacacionesSchema.index({ tenantId: 1, "items.userId": 1 });
planVacacionesSchema.index({ tenantId: 1, "items.vacationId": 1 }, { sparse: true });

export const PlanVacaciones = mongoose.model<IPlanVacaciones>("PlanVacaciones", planVacacionesSchema);
