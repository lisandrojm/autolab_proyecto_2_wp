/**
 * Vigencia de contratos: mismo criterio que usa el front (`frontend/src/utils/contratoVigencia.ts`).
 *
 * Un contrato de TIEMPO INDETERMINADO se guarda con `fecha_baja_contrato` vacía, así que la
 * ausencia de fecha de baja es lo que lo identifica como sin fecha de fin.
 *
 * LA VIGENCIA SALE DEL ESTADO (etapa 3, 19/11/2026; antes salía sólo de las fechas). Un contrato RIGE
 * HOY si su `estadoContrato` es VIGENTE, ya arrancó (alta <= hoy) y, si tiene baja, todavía no pasó
 * (baja >= hoy). Con cualquier otro estado no rige: FINALIZADO, ANULADO, SIN_DETERMINAR (lo decide una
 * persona) y también SIN ESTADO (null o el campo ausente): nunca se adivina a partir de las fechas
 * (decisión del usuario). El estado lo pone el modelo al guardar y lo mantiene la tarea diaria
 * (`services/estadoContratoAlGuardar.ts`, `services/transicionEstadoContratos.ts`).
 *
 * El campo AUSENTE casi siempre es una proyección que se olvidó de pedir `contracts.estadoContrato`:
 * se avisa por consola una vez por lugar (`proyeccionesConEstado.test.ts` lo exige en el código).
 *
 * Las tres copias de esta regla tienen que moverse juntas: `utils/contratosQueRigen.ts` (adentro de
 * Mongo), `services/filtrosDeNovedades.ts` (ídem) y `frontend/src/utils/contratoVigencia.ts`.
 *
 * `esTiempoIndeterminado` sigue siendo «sin fecha de baja»: decide la prioridad entre vigentes, no la
 * vigencia.
 */
export interface ContratoVigenciaLike {
    estadoContrato?: string | null;
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
 * ¿Es la LÁPIDA de un contrato anulado? (etapa 2b, ver `utils/anulacionContrato.ts`). No tiene fechas, y
 * sin esta guarda «sin alta» se leía como «ya arrancó» y «sin baja» como «indeterminado»: la lápida
 * quedaba vigente para siempre y `getContratoActivo` la elegía.
 */
export declare const esContratoAnulado: (contrato: {
    estadoContrato?: unknown;
} | null | undefined) => boolean;
/**
 * Rige hoy = estado VIGENTE, ya arrancó (Alta <= hoy) y no terminó (sin Baja, o Baja >= hoy). Sin
 * estado, o con cualquier otro, no rige: no se adivina por las fechas.
 */
export declare function esContratoVigente(contrato: ContratoVigenciaLike | null | undefined, hoy?: string): boolean;
/** Igual que `esContratoVigente`, recibiendo solo la fecha de baja. */
export declare function esFechaBajaVigente(fechaBaja: string | null | undefined, hoy?: string): boolean;
/** Un contrato es de tiempo indeterminado cuando no tiene fecha de baja: no vence. */
export declare function esTiempoIndeterminado(contrato: ContratoVigenciaLike | null | undefined): boolean;
/**
 * Contrato que representa la situación actual, por orden de prioridad:
 *
 *  1. Entre los VIGENTES (estado VIGENTE, ya arrancaron y no terminaron), el TIEMPO INDETERMINADO manda, aunque
 *     después figuren cargados contratos a plazo. Un contrato sin fecha de fin sigue abierto.
 *  2. Si no hay indeterminado vigente, el vigente más reciente.
 *  3. Si no hay ninguno vigente (ni siquiera uno que todavía no arrancó), el más reciente de todos
 *     (para seguir mostrando el histórico).
 */
export declare function getContratoActivo<T extends ContratoVigenciaLike>(todos: T[] | null | undefined, hoy?: string): T | null;
