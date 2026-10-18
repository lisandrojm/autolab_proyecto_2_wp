import { Types } from "mongoose";
import { type IVacation } from "../../models/Vacation.js";
import { type VacacionVirtual } from "./solapamiento.js";
/**
 * CREAR Y PRE-APROBAR UNA VACACIÓN, PARA CUALQUIER PERSONA.
 *
 * Era el cuerpo de `POST /vacations` (la persona pide desde la app) y de `PUT /vacations/:id/pre-approve`
 * (RR.HH. la pre-aprueba y sale el PDF). Vive acá porque el plan de vacaciones por proyecto crea la
 * vacación de un tercero cuando el coordinador aprueba su bloque, y tiene que salir IGUAL que una
 * pedida a mano: mismo cálculo de días, mismo saldo, mismo snapshot de reglas, mismo PDF y mismo número.
 */
export declare class ErrorVacacion extends Error {
    status: number;
    constructor(message: string, status?: number);
}
/** Mantiene al día el override de la grilla (`UserVacationBalance`) cuando una solicitud cambia de estado. */
export declare function adjustBalanceOnRequestChange(tenantId: any, userId: any, year: number, days: number, type: "create" | "approve" | "reject" | "cancel" | "deliver" | "sign"): Promise<void>;
/**
 * La configuración que rige para la persona, resuelta entre todos sus proyectos (regla de siempre
 * para multiproyecto): fraccionar gana si ALGUNO lo permite (y con el menor mínimo), y días hábiles
 * gana sobre corridos si ALGUNO los usa.
 */
export declare function configEfectivaDe(tenantId: any, user: any, globalConfig: any): Promise<{
    permiteFraccionadas: boolean;
    minDiasFraccion: number;
    diasCorridos: boolean;
}>;
/** Cuántos días pide un rango: corridos inclusive, o hábiles de lunes a viernes (los feriados no se descuentan, como siempre). */
export declare function contarDias(start: Date, end: Date, diasCorridos: boolean): number;
export interface PedidoDeVacacion {
    tenantId: any;
    userId: string;
    startDate: string | Date;
    endDate: string | Date;
    reason?: string;
    /** Lo demás que vino en el body de la app (se guarda como antes, debajo de los campos calculados). */
    extra?: Record<string, unknown>;
    origen: "solicitud" | "plan";
    planVacacionesId?: Types.ObjectId | string;
    projectId?: Types.ObjectId | string;
    /** De qué año descuenta. Sin él, el año en que empieza. */
    periodoSaldo?: number;
    /** Bloques del plan que todavía no son vacaciones pero cuentan para las reglas de solapamiento. */
    vacacionesVirtuales?: VacacionVirtual[];
}
/**
 * Crea la vacación en `pending` con todas las validaciones del POST de siempre: fechas, que no se
 * pise con otra propia, reglas de solapamiento, días según la configuración efectiva, saldo (con el
 * override de la grilla si existe) y el snapshot de reglas. Lanza `ErrorVacacion` con el status.
 */
export declare function crearVacacionParaPersona(o: PedidoDeVacacion): Promise<IVacation>;
/**
 * `pending` → `pre_approved`, y el PDF de pre-aprobación con la plantilla del snapshot (`rules.pdfId`)
 * o, si no hay, la plantilla activa de código «vacaciones». Un problema con el PDF no deshace la
 * pre-aprobación: se loguea y la vacación queda sin `pdfPreAprobacionUrl` (se puede regenerar).
 */
export declare function preAprobarVacacion(vacation: IVacation, actorId: string, tenantObjectId: any): Promise<IVacation>;
