import mongoose, { Schema } from "mongoose";
import { ESTADOS_ITEM, ESTADOS_PLAN } from "../compartido/planVacaciones/estado.js";
const grupoSchema = new Schema({
    areaId: { type: Schema.Types.ObjectId, ref: "Area", required: true },
    shiftId: { type: Schema.Types.ObjectId, ref: "Shift", required: true },
    rolFrameId: { type: Schema.Types.ObjectId, ref: "RoleFrame", default: null },
    nombreRol: { type: String, default: "" },
}, { _id: false });
const miembroSchema = new Schema({
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
}, { _id: false });
const itemSchema = new Schema({
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
}, { _id: true });
const reemplazoSchema = new Schema({
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
}, { _id: true });
const planVacacionesSchema = new Schema({
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
}, { timestamps: true, collection: "planes_vacaciones" });
planVacacionesSchema.index({ tenantId: 1, projectId: 1, ventanaDesde: -1 });
planVacacionesSchema.index({ tenantId: 1, estado: 1 });
// «¿Esta persona ya está en otro plan?» y «¿qué bloque creó esta vacación?».
planVacacionesSchema.index({ tenantId: 1, "items.userId": 1 });
planVacacionesSchema.index({ tenantId: 1, "items.vacationId": 1 }, { sparse: true });
export const PlanVacaciones = mongoose.model("PlanVacaciones", planVacacionesSchema);
