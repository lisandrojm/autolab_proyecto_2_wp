import { Types } from "mongoose";
import { z } from "zod";
import { type ContextoDeSede } from "../compartido/areaTurno.js";
import { type ErrorCambioTurno, type PedidoCambioTurno, type ReglasCambioTurno } from "../compartido/cambioDeTurno.js";
export interface Ausencia {
    tipo: "vacaciones" | "licencia";
    desde: string;
    hasta: string;
}
/** Todo lo que necesitan las reglas, ya cargado. */
export interface ContextoCambioTurno {
    hoy: string;
    reglas: ReglasCambioTurno;
    pedido: PedidoCambioTurno;
    /** Turnos (ids) que la persona tiene HOY en esa fila (área + sede) del proyecto. Vacío = no está ahí. */
    turnosActuales: string[];
    /** Turnos (ids) de esa fila en `areasConfig`; null = la fila (área o sede) no existe en el proyecto. */
    turnosDeLaFila: string[] | null;
    /** El turno pedido existe en el tenant. */
    destinoExiste: boolean;
    /** Otros pedidos de cambio de turno de la persona en juego (pendientes, preaprobados o aprobados). */
    otrosPedidos: {
        desde: string;
        hasta: string | null;
    }[];
    /** Vacaciones y licencias aprobadas de la persona. */
    ausencias: Ausencia[];
    /** Cuántas personas hay hoy en el turno de destino (sólo se calcula si el tipo tiene cupo); null = no se calculó. */
    ocupacionDestino: number | null;
    /**
     * Al APROBAR o APLICAR se vuelve a validar, pero la anticipación es una regla del momento de pedir: una
     * aprobación que llega tarde no la cumple y no por eso el cambio deja de valer. Con esto no se mira.
     */
    alAprobar?: boolean;
}
export interface ResultadoValidacion {
    ok: boolean;
    errores: ErrorCambioTurno[];
}
/**
 * LAS REGLAS. Devuelve TODOS los errores, no el primero: el móvil los muestra juntos antes de enviar.
 * Códigos estables (el front puede engancharse a ellos); mensajes para la persona.
 */
export declare function validarCambioDeTurno(ctx: ContextoCambioTurno): ResultadoValidacion;
/** `Order.dynamicValue` de un pedido de cambio de turno, tal como lo manda el móvil. */
export declare const pedidoCambioTurnoSchema: z.ZodObject<{
    projectId: z.ZodEffects<z.ZodString, string, string>;
    areaId: z.ZodEffects<z.ZodString, string, string>;
    sedeId: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodNumber>>, number, number>;
    shiftActualId: z.ZodEffects<z.ZodString, string, string>;
    shiftSolicitadoId: z.ZodEffects<z.ZodString, string, string>;
    fechaDesde: z.ZodString;
    fechaHasta: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>, string, string>;
    motivo: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    projectId?: string;
    motivo?: string;
    areaId?: string;
    sedeId?: number;
    shiftActualId?: string;
    shiftSolicitadoId?: string;
    fechaDesde?: string;
    fechaHasta?: string;
}, {
    projectId?: string;
    motivo?: string;
    areaId?: string;
    sedeId?: number;
    shiftActualId?: string;
    shiftSolicitadoId?: string;
    fechaDesde?: string;
    fechaHasta?: string;
}>;
interface Situacion {
    proyecto: any | null;
    /** La persona pertenece al proyecto (`User.projectIds`). */
    pertenece: boolean;
    ctxSede: ContextoDeSede;
    /** Sus claves "area::turno[::sN]" hoy en el proyecto. */
    claves: Set<string>;
}
/** Las claves de UNA persona en UN proyecto: su fila del equipo con el contrato que rige encima. */
export declare function situacionEnElProyecto(tenantId: Types.ObjectId, userId: string, proyecto: any, hoy: string): Promise<Situacion>;
/** El contexto completo para `validarCambioDeTurno`, leído de la base. */
export declare function contextoDeCambioDeTurno(tenantId: Types.ObjectId, userId: string, pedido: PedidoCambioTurno, reglas: ReglasCambioTurno, opciones?: {
    excluirOrderId?: string;
    hoy?: string;
}): Promise<ContextoCambioTurno>;
/** El tipo de sistema del tenant (null si el init todavía no corrió). */
export declare const tipoCambioDeTurno: (tenantId: Types.ObjectId) => import("mongoose").Query<import("mongoose").Document<unknown, {}, import("../models/OrderConfig.js").IOrderConfig, {}, {}> & import("../models/OrderConfig.js").IOrderConfig & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, import("mongoose").Document<unknown, {}, import("../models/OrderConfig.js").IOrderConfig, {}, {}> & import("../models/OrderConfig.js").IOrderConfig & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, {}, import("../models/OrderConfig.js").IOrderConfig, "findOne", {}>;
/** Cargar el contexto y validar: lo que corren POST /orders, validate-cambio-turno y la aprobación. */
export declare function validarPedidoCambioDeTurno(tenantId: Types.ObjectId, userId: string, pedido: PedidoCambioTurno, opciones?: {
    reglas?: ReglasCambioTurno;
    excluirOrderId?: string;
    hoy?: string;
    alAprobar?: boolean;
}): Promise<ResultadoValidacion & {
    ctx: ContextoCambioTurno;
}>;
export interface FotoCambioTurno {
    proyectoNombre: string;
    areaNombre: string;
    sedeNombre: string;
    turnoActualNombre: string;
    turnoSolicitadoNombre: string;
    /** Cuándo se aplicó el cambio en el equipo (null = todavía no). */
    aplicado: {
        el: string;
        por: string | null;
    } | null;
    /** Cuándo se volvió al turno original (sólo con `fechaHasta`). */
    revertido: {
        el: string;
    } | null;
}
export declare function fotoDeCambioDeTurno(tenantId: Types.ObjectId, pedido: PedidoCambioTurno): Promise<FotoCambioTurno>;
export interface TurnoParaPedir {
    id: string;
    nombre: string;
    horario: string;
    dias: number[];
}
export interface FilaParaPedir {
    areaId: string;
    areaNombre: string;
    sedeId: number | null;
    sedeNombre: string;
    /** El turno (o turnos) en que está hoy en esa fila. */
    turnosActuales: TurnoParaPedir[];
    /** A dónde puede pedir pasar: los turnos de la fila que no son el suyo. */
    turnosPosibles: TurnoParaPedir[];
}
export interface ContextoParaPedir {
    hoy: string;
    reglas: ReglasCambioTurno;
    /** La primera `fechaDesde` válida (hoy + anticipación). */
    fechaMinima: string;
    proyectos: {
        projectId: string;
        nombre: string;
        filas: FilaParaPedir[];
    }[];
}
/**
 * Los proyectos donde la persona tiene turno hoy, con cada fila de área (área + sede), su turno actual y
 * los otros turnos de la fila. Sólo filas con turno actual: sin turno no hay de dónde cambiarse.
 */
export declare function contextoParaPedir(tenantId: Types.ObjectId, userId: string, reglas: ReglasCambioTurno): Promise<ContextoParaPedir>;
export {};
