/**
 * Vigencia de contratos: mismo criterio que usa el front (`frontend/src/utils/contratoVigencia.ts`).
 *
 * Un contrato de TIEMPO INDETERMINADO se guarda con `fecha_baja_contrato` vacía, así que la
 * ausencia de fecha de baja es lo que lo identifica como vigente. El punto importante es CUÁL
 * contrato se evalúa: tomar siempre el último del array daba NO VIGENTE a quien tenía un
 * indeterminado abierto seguido de un contrato viejo ya vencido.
 *
 * El flag `esTiempoIndeterminado` del tipo de contrato no se usa acá: si un contrato indeterminado
 * tiene fecha de baja cargada, esa baja es real y se respeta.
 */
export interface ContratoVigenciaLike {
    fecha_alta_contrato?: string;
    fecha_baja_contrato?: string;
    [key: string]: any;
}
/** "Hoy" en hora de Argentina (el VPS puede correr en UTC), como "YYYY-MM-DD". */
export declare function hoyArgentina(): string;
/** Normaliza "YYYY-MM-DD...", "DD/MM/YYYY" y "DD-MM-YYYY" a "YYYY-MM-DD". "" si no se puede. */
export declare function fechaISO(valor?: string | null): string;
/** Vigente = sin fecha de baja (tiempo indeterminado) o con baja de hoy en adelante. */
export declare function esContratoVigente(contrato: ContratoVigenciaLike | null | undefined, hoy?: string): boolean;
/** Igual que `esContratoVigente`, recibiendo solo la fecha de baja. */
export declare function esFechaBajaVigente(fechaBaja: string | null | undefined, hoy?: string): boolean;
/**
 * Contrato que representa la situación actual: el más reciente de los VIGENTES y, si no hay
 * ninguno vigente, el último cargado (para seguir mostrando el histórico).
 */
export declare function getContratoActivo<T extends ContratoVigenciaLike>(contratos: T[] | null | undefined, hoy?: string): T | null;
