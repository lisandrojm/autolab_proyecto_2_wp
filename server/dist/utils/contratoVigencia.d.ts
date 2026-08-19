/**
 * Vigencia de contratos: mismo criterio que usa el front (`frontend/src/utils/contratoVigencia.ts`).
 *
 * Un contrato de TIEMPO INDETERMINADO se guarda con `fecha_baja_contrato` vacía, así que la
 * ausencia de fecha de baja es lo que lo identifica como sin fecha de fin.
 *
 * Vigente = ya arrancó (fecha_alta_contrato <= hoy) Y no terminó (sin fecha_baja_contrato, o
 * fecha_baja_contrato >= hoy). Un contrato con Alta futura (todavía no arrancó) NO es vigente,
 * aunque no tenga fecha de baja.
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
/**
 * Vigente = ya arrancó (Alta <= hoy) y no terminó (sin Baja, o Baja >= hoy). Si la Alta es futura,
 * el contrato todavía no rige, aunque no tenga fecha de baja (tiempo indeterminado).
 */
export declare function esContratoVigente(contrato: ContratoVigenciaLike | null | undefined, hoy?: string): boolean;
/** Igual que `esContratoVigente`, recibiendo solo la fecha de baja. */
export declare function esFechaBajaVigente(fechaBaja: string | null | undefined, hoy?: string): boolean;
/** Un contrato es de tiempo indeterminado cuando no tiene fecha de baja: no vence. */
export declare function esTiempoIndeterminado(contrato: ContratoVigenciaLike | null | undefined): boolean;
/**
 * Contrato que representa la situación actual, por orden de prioridad:
 *
 *  1. Entre los VIGENTES (ya arrancaron y no terminaron), el TIEMPO INDETERMINADO manda, aunque
 *     después figuren cargados contratos a plazo. Un contrato sin fecha de fin sigue abierto.
 *  2. Si no hay indeterminado vigente, el vigente más reciente.
 *  3. Si no hay ninguno vigente (ni siquiera uno que todavía no arrancó), el más reciente de todos
 *     (para seguir mostrando el histórico).
 */
export declare function getContratoActivo<T extends ContratoVigenciaLike>(contratos: T[] | null | undefined, hoy?: string): T | null;
