import mongoose, { Document, Types } from "mongoose";
import { type EstadoItem, type EstadoPlan } from "../compartido/planVacaciones/estado.js";
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
    /** La sede de la fila área × turno × sede (ver `compartido/areaTurno.ts`); sin sede = todas. */
    sedeId?: number | null;
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
    /** La sede de la fila área × turno × sede (ver `compartido/areaTurno.ts`); sin sede = todas. */
    sedeId?: number | null;
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
    /** La sede de la fila área × turno × sede (ver `compartido/areaTurno.ts`); sin sede = todas. */
    sedeId?: number | null;
    rolFrameId: Types.ObjectId | null;
    nombreRol: string;
    mes: string;
    /** La persona contratada para cubrir el mes. */
    userId: Types.ObjectId;
    contratoId: Types.ObjectId;
    nombreContrato: string;
    desde: string;
    hasta: string;
    cubreA: Array<{
        userId: Types.ObjectId;
        desde: string;
        hasta: string;
    }>;
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
export declare const PlanVacaciones: mongoose.Model<IPlanVacaciones, {}, {}, {}, mongoose.Document<unknown, {}, IPlanVacaciones, {}, {}> & IPlanVacaciones & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
