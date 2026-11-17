import { type IVacation } from "../../models/Vacation.js";
import { type Nivel } from "../../compartido/vacaciones/etapaDeAprobacion.js";
/**
 * Después de cada paso: si falta un nivel, se le avisa; si no falta ninguno, se pre-aprueba y pasa a la
 * bandeja del admin. `actorId` es quien aprobó el último paso (null si nació sin jerarquía).
 */
export declare function avanzar(v: IVacation, tenantObjectId: any, actorId: string | null): Promise<IVacation>;
/** Al crearla: la foto de quién aprueba cada nivel, y el primer paso. */
export declare function iniciarAprobacion(v: IVacation, tenantObjectId: any): Promise<IVacation>;
/** Aprueba el paso en que está, si le toca a esta persona. */
export declare function aprobarEtapa(v: IVacation, userId: string, tenantObjectId: any): Promise<IVacation>;
/**
 * Rechaza: lo usa el supervisor o coordinador en su paso y el admin en cualquier momento. Devuelve el
 * saldo y avisa a quien la pidió.
 */
export declare function rechazarVacacion(v: IVacation, rechazo: {
    userId: string;
    nivel: Nivel | "admin";
    motivo?: string;
}): Promise<IVacation>;
/**
 * LA APROBACIÓN FINAL DEL ADMIN (lo que hacía `PUT /:id/approve`, 15/11/2026: lo usa también la campaña de
 * goce al confirmar lo que asigna la empresa). Espera una `pre_approved`. Firma, saldo y aviso como siempre.
 */
export declare function aprobarComoAdmin(vacation: IVacation, approverId: string): Promise<IVacation>;
export declare function rechazarEtapa(v: IVacation, userId: string, motivo?: string): Promise<IVacation>;
/** ¿Ya se le recordó hoy al supervisor? (uno por día, para no llenarle la campanita). */
export declare const recordadaHoy: (v: Pick<IVacation, "recordatorios">, hoy?: string) => boolean;
/** El coordinador le pide al supervisor que apruebe. No aprueba por él (decisión del usuario). */
export declare function recordarAlSupervisor(v: IVacation, userId: string): Promise<IVacation>;
export interface ItemDeAprobacion {
    _id: string;
    vacationNumber: string;
    persona: {
        _id: string;
        nombre: string;
    };
    proyectos: string[];
    startDate: Date;
    endDate: Date;
    daysRequested: number;
    reason?: string;
    createdAt: Date;
    etapa: Nivel;
    aprobadoPorSupervisor?: string | null;
    recordadaHoy: boolean;
}
/**
 * LA BANDEJA «APROBACIONES» DE LA APP.
 *   · `paraAprobar`: lo que espera MI aprobación (supervisor o coordinador, en su paso).
 *   · `esperandoSupervisor`: sólo para el coordinador, lo de sus proyectos que todavía no aprobó el supervisor.
 */
export declare function bandejaDeAprobaciones(tenantObjectId: any, userId: string): Promise<{
    paraAprobar: ItemDeAprobacion[];
    esperandoSupervisor: ItemDeAprobacion[];
}>;
/** Cuántas esperan MI aprobación (el número de la tarjeta). No cuenta lo que espera al supervisor. */
export declare function contarParaAprobar(tenantObjectId: any, userId: string): Promise<number>;
/** Lo que hice yo con una solicitud: un renglón por cada paso (si aprobé como supervisor y como coordinador, son dos). */
export interface ItemDeHistorial extends Omit<ItemDeAprobacion, "etapa" | "aprobadoPorSupervisor" | "recordadaHoy"> {
    accion: "aprobada" | "rechazada";
    nivel: Nivel;
    at: Date;
    motivo?: string;
    /** Dónde está hoy la solicitud. */
    status: IVacation["status"];
    /** Si sigue pendiente, qué nivel falta («admin» = espera al administrador). */
    etapaActual: Nivel | "admin" | null;
}
/**
 * EL HISTORIAL DE «APROBACIONES» (17/11/2026, pedido del usuario): lo que aprobé o rechacé como supervisor
 * o coordinador, lo más nuevo primero. Sale de lo que ya guarda cada solicitud (`aprobaciones.<nivel>` y
 * `rechazo`), así que incluye lo aprobado antes de que existiera esta pantalla. El rechazo del admin no va:
 * es de la web.
 */
export declare function historialDeAprobaciones(tenantObjectId: any, userId: string, limite?: number): Promise<ItemDeHistorial[]>;
