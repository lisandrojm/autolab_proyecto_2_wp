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
