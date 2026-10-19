import { Types } from "mongoose";
import { type IPlanVacaciones, type IMiembroDelPlan } from "../../models/PlanVacaciones.js";
/**
 * EL PLAN DE VACACIONES POR PROYECTO: lo que hace cada endpoint de `routes/planVacaciones.ts`.
 * Ver el modelo (`models/PlanVacaciones.ts`) para el porqué de cada estado.
 */
export declare class ErrorPlan extends Error {
    status: number;
    extra?: unknown;
    constructor(message: string, status?: number, extra?: unknown);
}
/**
 * La clave de un grupo área × turno (× sede) × rol (el rol por `_id`, o por nombre si el contrato no lo
 * tiene resuelto). Sin sede es "area::turno::rol", igual que siempre; con sede, "area::turno::s12::rol".
 */
export declare const claveDeGrupo: (g: {
    areaId: any;
    shiftId: any;
    sedeId?: any;
    rolFrameId?: any;
    nombreRol?: string;
}) => string;
export interface GrupoDelPlan {
    clave: string;
    areaId: string;
    areaNombre: string;
    shiftId: string;
    shiftNombre: string;
    /** La sede de la fila (área × turno × sede), o null. */
    sedeId: number | null;
    sedeNombre: string;
    rolFrameId: string | null;
    nombreRol: string;
    userIds: string[];
}
export interface EquipoParaPlan {
    proyecto: {
        _id: string;
        name: string;
    };
    equipo: IMiembroDelPlan[];
    grupos: GrupoDelPlan[];
    areas: Array<{
        _id: string;
        name: string;
    }>;
    shifts: Array<{
        _id: string;
        name: string;
        startTime: string;
        endTime: string;
    }>;
    /** Miembros activos con contrato vigente pero sin área/turno asignado: no entran en la grilla. */
    sinGrupo: Array<{
        userId: string;
        nombre: string;
    }>;
}
/**
 * EL EQUIPO DEL PROYECTO TAL COMO LO VE EL PLAN: los miembros activos con contrato vigente en el
 * proyecto, agrupados por área × turno (misma precedencia que la Jerarquía: `teamConfig`, si no el
 * contrato) y por rol empresa (el del contrato que rige; si no, el del vínculo), con los días
 * disponibles del año de saldo según la MISMA cuenta de «Gestión por Usuario» (`saldosDeVacaciones`).
 */
export declare function equipoParaPlan(tenantObjectId: Types.ObjectId, tenantId: string, projectId: string, anioDeSaldo: number): Promise<EquipoParaPlan>;
export declare function crearPlan(tenantObjectId: Types.ObjectId, tenantId: string, creadorId: string, body: any): Promise<IPlanVacaciones>;
export declare function cargarPlan(tenantObjectId: Types.ObjectId, planId: string): Promise<IPlanVacaciones>;
export declare function listarPlanes(tenantObjectId: Types.ObjectId, o: {
    projectId?: string;
    estado?: string;
    proyectos: Types.ObjectId[] | null;
    pendientesDeMi?: Types.ObjectId[] | null;
}): Promise<{
    _id: string;
    projectId: string;
    proyecto: any;
    nombre: any;
    ventanaDesde: any;
    ventanaHasta: any;
    anioDeSaldo: any;
    topeDiasPorPersona: any;
    estado: any;
    enviadoAt: any;
    createdAt: any;
    updatedAt: any;
    contadores: {
        total: any;
        propuestos: any;
        enviados: any;
        aprobados: any;
        rechazados: any;
        cancelados: any;
        reemplazos: any;
    };
}[]>;
/** El plan como lo recibe la pantalla: con grupos, nombres, avisos y cobertura por grupo y mes. */
export declare function detalleDelPlan(tenantObjectId: Types.ObjectId, plan: IPlanVacaciones): Promise<any>;
export declare function actualizarPlan(tenantObjectId: Types.ObjectId, tenantId: string, plan: IPlanVacaciones, body: any): Promise<{
    quitados: number;
}>;
export declare function eliminarPlan(plan: IPlanVacaciones): Promise<void>;
export declare function cancelarPlan(plan: IPlanVacaciones): Promise<void>;
/** Vuelve a tomar el equipo del proyecto. Los bloques de quien ya no está no se borran: `avisos` los marca. */
export declare function refrescarEquipo(tenantObjectId: Types.ObjectId, tenantId: string, plan: IPlanVacaciones, guardar?: boolean): Promise<void>;
/**
 * ASIGNAR UN MES A UN GRUPO (área × turno × rol): reparte el mes entre sus personas con `repartirMes`
 * y reemplaza los bloques editables que el grupo tuviera en ese mes. Quien ya tiene un bloque vivo en
 * OTRO grupo o mes del plan se saltea (una persona se planifica una vez) y se informa. Si el grupo
 * tiene bloques enviados o aprobados en ese mes, no se toca nada (409).
 */
export declare function asignarMes(plan: IPlanVacaciones, body: any): Promise<{
    bloques: number;
    salteados: Array<{
        userId: string;
        nombre: string;
        motivo: string;
    }>;
}>;
export declare function quitarAsignacion(plan: IPlanVacaciones, body: any): Promise<{
    quitados: number;
}>;
export declare function crearItem(plan: IPlanVacaciones, body: any): Promise<string>;
export declare function actualizarItem(plan: IPlanVacaciones, itemId: string, body: any): Promise<void>;
export declare function eliminarItem(plan: IPlanVacaciones, itemId: string): Promise<void>;
/** Manda al coordinador los bloques editables (todos, o los indicados). Con errores de validación no se envía nada. */
export declare function enviarPlan(tenantObjectId: Types.ObjectId, plan: IPlanVacaciones, actorId: string, itemIds?: string[]): Promise<{
    enviados: number;
}>;
/**
 * APROBAR UN BLOQUE (el coordinador): se vuelve a mirar la verdad en ese momento —persona activa con
 * contrato vigente en el proyecto, saldo, sin pisarse con una vacación existente, reglas de
 * solapamiento contando los demás bloques enviados del plan— y recién ahí se crea la `Vacation`
 * (`pending`) y se pre-aprueba con su PDF. El bloque guarda `vacationId`.
 */
export declare function aprobarItem(tenantObjectId: Types.ObjectId, tenantId: string, plan: IPlanVacaciones, itemId: string, actorId: string): Promise<{
    vacationId: string;
}>;
export declare function rechazarItem(tenantObjectId: Types.ObjectId, plan: IPlanVacaciones, itemId: string, actorId: string, motivo: unknown): Promise<void>;
/** Aprueba todos los enviados, uno por uno (los PDF y la numeración son efectos externos: no hay transacción). Un fallo no frena a los demás. */
export declare function aprobarTodo(tenantObjectId: Types.ObjectId, tenantId: string, plan: IPlanVacaciones, actorId: string): Promise<{
    aprobados: number;
    fallidos: Array<{
        itemId: string;
        nombre: string;
        motivo: string;
    }>;
}>;
/**
 * CANCELAR UN BLOQUE. Si ya era una vacación, se cancela también —mientras no esté entregada ni
 * firmada— y se restituye el saldo. Con `reabrir` el bloque vuelve a `propuesto` (para re-armarlo);
 * si no, queda `cancelado`.
 */
export declare function cancelarItem(tenantObjectId: Types.ObjectId, plan: IPlanVacaciones, itemId: string, body: any): Promise<void>;
