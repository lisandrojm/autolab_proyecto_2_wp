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
/**
 * Normaliza "YYYY-MM-DD...", "DD/MM/YYYY" y "DD-MM-YYYY" a "YYYY-MM-DD". "" si no se puede.
 * OJO: en la base hay contratos con la fecha de baja guardada como el STRING "null" (no el valor
 * null), así que hay que tratarla explícitamente como vacía: un `if (!baja)` la daría por válida.
 */
export declare function fechaISO(valor?: string | null): string;
/** Vigente = sin fecha de baja (tiempo indeterminado) o con baja de hoy en adelante. */
export declare function esContratoVigente(contrato: ContratoVigenciaLike | null | undefined, hoy?: string): boolean;
/** Igual que `esContratoVigente`, recibiendo solo la fecha de baja. */
export declare function esFechaBajaVigente(fechaBaja: string | null | undefined, hoy?: string): boolean;
/** Un contrato es de tiempo indeterminado cuando no tiene fecha de baja: no vence. */
export declare function esTiempoIndeterminado(contrato: ContratoVigenciaLike | null | undefined): boolean;
/**
 * Contrato que representa la situación actual, por orden de prioridad:
 *
 *  1. TIEMPO INDETERMINADO: si tiene uno (sin fecha de baja) ese es el que rige, aunque después
 *     figuren cargados contratos a plazo. Un contrato sin fecha de fin sigue abierto.
 *  2. Si no hay indeterminado, el vigente de alta más reciente.
 *  3. Si no hay ninguno vigente, el último cargado (para seguir mostrando el histórico).
 */
export declare function getContratoActivo<T extends ContratoVigenciaLike>(contratos: T[] | null | undefined, hoy?: string): T | null;
