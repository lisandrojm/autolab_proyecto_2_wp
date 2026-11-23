import mongoose, { Schema, Document, Types } from "mongoose";
import type { EstadoInvitacion } from "../compartido/vacaciones/campania.js";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CAMPAÑA DE GOCE DE VACACIONES (15/11/2026)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Una por temporada y tenant: invita a cada persona activa con días disponibles (y, si la campaña lo
 * pide, con su contrato vigente de ciertos tipos: `tiposContratoInvitar`) a elegir sus fechas
 * dentro de la ventana, con fecha límite; si no elige, la empresa le asigna un tramo único. Las reglas
 * puras están en `compartido/vacaciones/campania.ts`, el circuito en `services/vacaciones/campaniaVacaciones.ts`.
 *
 * Los plazos se copian de `VacationConfig.campania` al crearla: cambiar la configuración no le mueve
 * las reglas a una campaña que ya está corriendo.
 *
 * Los índices NO van en el schema (ver `scripts/indicesCampaniaVacaciones.ts`, lo corre el usuario).
 */

export type EstadoCampania = "borrador" | "lanzada" | "cerrada";

export interface ICampaniaVacaciones extends Document {
  tenantId: Types.ObjectId;
  /** El año de saldo del que descuentan las vacaciones que otorga (`Vacation.periodoSaldo`). */
  anio: number;
  nombre: string;
  /** La ventana de la temporada, con año ("YYYY-MM-DD"). */
  ventanaDesde: string;
  ventanaHasta: string;
  plazoParaDefinirDias: number;
  avisoMinimoDias: number;
  minDiasPorTramo: number;
  /** "YYYY-MM-DD": se fija al lanzarla (hoy + plazo). */
  fechaLimite?: string | null;
  /**
   * A QUIÉN SE INVITA (16/11/2026): los `tipo_contrato_id` cuyo contrato vigente en la empresa de cómputo
   * hace que se invite a la persona. Vacío = todos los tipos habilitados. Se elige en borrador.
   */
  /** Tipos del catálogo (`_id` de `contratos`). Las lanzadas antes del 23/11/2026 pueden tener números de FRAME. */
  tiposContratoInvitar: string[];
  /**
   * LO QUE SE USÓ AL LANZAR, para que quede escrito: los tipos que entraron (con su nombre de ese día y
   * cuántas personas), si fue «todos los habilitados», y cuántas con días quedaron afuera por cada motivo.
   */
  lanzamiento?: {
    todosLosTipos: boolean;
    /** `id`: el tipo del catálogo; en las lanzadas antes del 23/11/2026, el número de FRAME. */
    tipos: { id: string | number; nombre: string; invitadas: number }[];
    excluidas: { tipoDeshabilitado: number; tipoNoIncluido: number; sinContrato: number };
  } | null;
  estado: EstadoCampania;
  creadaPor?: Types.ObjectId;
  lanzadaPor?: Types.ObjectId;
  lanzadaAt?: Date;
  cerradaPor?: Types.ObjectId;
  cerradaAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const campaniaSchema = new Schema<ICampaniaVacaciones>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    anio: { type: Number, required: true },
    nombre: { type: String, required: true },
    ventanaDesde: { type: String, required: true },
    ventanaHasta: { type: String, required: true },
    plazoParaDefinirDias: { type: Number, required: true },
    avisoMinimoDias: { type: Number, required: true },
    minDiasPorTramo: { type: Number, required: true },
    fechaLimite: { type: String, default: null },
    tiposContratoInvitar: { type: [String], default: [] },
    lanzamiento: {
      type: new Schema(
        {
          todosLosTipos: Boolean,
          tipos: [{ _id: false, id: Schema.Types.Mixed, nombre: String, invitadas: Number }],
          excluidas: { tipoDeshabilitado: Number, tipoNoIncluido: Number, sinContrato: Number },
        },
        { _id: false },
      ),
      default: null,
    },
    estado: { type: String, enum: ["borrador", "lanzada", "cerrada"], default: "borrador" },
    creadaPor: { type: Schema.Types.ObjectId, ref: "User" },
    lanzadaPor: { type: Schema.Types.ObjectId, ref: "User" },
    lanzadaAt: { type: Date },
    cerradaPor: { type: Schema.Types.ObjectId, ref: "User" },
    cerradaAt: { type: Date },
  },
  { timestamps: true, collection: "campanias_vacaciones" },
);

export const CampaniaVacaciones = mongoose.model<ICampaniaVacaciones>("CampaniaVacaciones", campaniaSchema);

/**
 * LA INVITACIÓN DE UNA PERSONA: su recorrido por la campaña, con todo lo que hace falta de respaldo
 * legal — cuándo se la invitó, cuándo acusó recibo, qué propuso o qué le asignó la empresa, el aviso
 * por escrito y su acuse — y un historial de quién hizo qué y cuándo.
 */
export interface ITramoInvitacion {
  desde: string;
  hasta: string;
  dias: number;
  vacationId?: Types.ObjectId;
}

export interface IInvitacionVacaciones extends Document {
  tenantId: Types.ObjectId;
  campaniaId: Types.ObjectId;
  userId: Types.ObjectId;
  nombre: string;
  /** Los días a otorgar al invitarla (`display.available` del año de la campaña). Se recalcula al proponer y al asignar. */
  diasDisponibles: number;
  /** Cómo se cuentan sus días (configuración efectiva de su proyecto): corridos o de lunes a viernes. */
  diasCorridos: boolean;
  /** Su ventana efectiva (área > proyectos > global), si tiene; vacía = la de la campaña. */
  ventanaPersona?: { enabled: boolean; tramos: { inicio: string; fin: string }[] };
  fechaLimite: string;
  estado: EstadoInvitacion;
  invitadoAt?: Date;
  acuseInvitacionAt?: Date | null;
  propuestaAt?: Date | null;
  /** Lo que propuso (uno o más tramos): cada uno es una `Vacation` que sube por la jerarquía. */
  tramos: ITramoInvitacion[];
  rechazo?: { motivo?: string; at: Date } | null;
  /** El tramo único que fija la empresa si no eligió: sugerido por el sistema, movible por el admin, confirmado. */
  asignacion?: { desde: string; hasta: string; dias: number; sugeridaAt?: Date; editadaPor?: Types.ObjectId; confirmadaPor?: Types.ObjectId; confirmadaAt?: Date; vacationId?: Types.ObjectId; problema?: string | null } | null;
  /** El aviso por escrito del otorgamiento: cuándo salió, qué decía y los PDF (uno por vacación). */
  notificacion?: { enviadaAt: Date; texto: string; pdfUrls: string[] } | null;
  acuseOtorgamientoAt?: Date | null;
  historial: { accion: string; porUserId?: Types.ObjectId | null; at: Date; detalle?: string }[];
  recordatorios: { at: Date; porUserId?: Types.ObjectId | null; automatico: boolean }[];
  createdAt: Date;
  updatedAt: Date;
}

const tramoSchema = new Schema<ITramoInvitacion>({ desde: String, hasta: String, dias: Number, vacationId: { type: Schema.Types.ObjectId, ref: "Vacation" } }, { _id: false });

const invitacionSchema = new Schema<IInvitacionVacaciones>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    campaniaId: { type: Schema.Types.ObjectId, ref: "CampaniaVacaciones", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    nombre: { type: String, default: "" },
    diasDisponibles: { type: Number, default: 0 },
    diasCorridos: { type: Boolean, default: true },
    ventanaPersona: { enabled: Boolean, tramos: [{ _id: false, inicio: String, fin: String }] },
    fechaLimite: { type: String, required: true },
    estado: {
      type: String,
      enum: ["pendiente_de_invitar", "invitado", "acuso_recibo", "propuso_fechas", "rechazada", "aprobado_notificado", "vencido_sin_definir", "asignado_por_empresa_notificado", "sin_dias_pendientes"],
      default: "pendiente_de_invitar",
    },
    invitadoAt: { type: Date },
    acuseInvitacionAt: { type: Date, default: null },
    propuestaAt: { type: Date, default: null },
    tramos: { type: [tramoSchema], default: [] },
    rechazo: { type: new Schema({ motivo: String, at: Date }, { _id: false }), default: null },
    asignacion: {
      type: new Schema(
        {
          desde: String,
          hasta: String,
          dias: Number,
          sugeridaAt: Date,
          editadaPor: { type: Schema.Types.ObjectId, ref: "User" },
          confirmadaPor: { type: Schema.Types.ObjectId, ref: "User" },
          confirmadaAt: Date,
          vacationId: { type: Schema.Types.ObjectId, ref: "Vacation" },
          problema: { type: String, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    notificacion: { type: new Schema({ enviadaAt: Date, texto: String, pdfUrls: [String] }, { _id: false }), default: null },
    acuseOtorgamientoAt: { type: Date, default: null },
    historial: [{ _id: false, accion: String, porUserId: { type: Schema.Types.ObjectId, ref: "User" }, at: Date, detalle: String }],
    recordatorios: [{ _id: false, at: Date, porUserId: { type: Schema.Types.ObjectId, ref: "User" }, automatico: Boolean }],
  },
  { timestamps: true, collection: "invitaciones_vacaciones" },
);

export const InvitacionVacaciones = mongoose.model<IInvitacionVacaciones>("InvitacionVacaciones", invitacionSchema);
