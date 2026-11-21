/**
 * LA IMPORTACIÓN DE FRAME ESTÁ PAUSADA, Y ESO QUEDA ESCRITO (19/11/2026).
 *
 * Qué se sabe:
 *  - El cron automático (`importconfigs.isEnabled`) está apagado desde el 12/06/2026. No hay commit de
 *    esa fecha que lo explique: se apagó desde la configuración y no se sabe quién ni por qué.
 *  - La última sincronización (manual) fue el 21/09/2026.
 *  - El 18/11/2026 se limpiaron contratos duplicados app/FRAME (372 grupos, ver la memoria
 *    «duplicados-app-frame»): el import no reconocía los contratos de la app por la categoría. El import
 *    ya se arregló (identidad por proyecto, persona, alta y tipo; diferencias → `discrepancias_frame`),
 *    pero una sincronización después de meses trae TODO FRAME de nuevo sobre la base.
 *
 * Por eso sincronizar es una OPERACIÓN, no una prueba: copia fresca de la base, el log a mano y revisión
 * después. Para que no pase por accidente, tanto disparar la sincronización como prender el cron exigen
 * escribir la fecha de la última sincronización (`confirmacionValida`). Sin eso, 428.
 *
 * Mientras no se sincronice, `discrepancias_frame` queda vacía y `stats.discrepanciasFrame` no aparece:
 * no es que no haya diferencias, es que nadie las está mirando. El código está y sirve si se reactiva.
 */
export declare const IMPORT_FRAME_PAUSADO: {
    cronApagadoDesde: string;
    motivo: string;
    advertencia: string;
    discrepancias: string;
};
/** La fecha de una corrida como la muestra la pantalla y como hay que escribirla: DD/MM/AAAA, hora argentina. */
export declare function fechaDeCorrida(fecha: Date | string | null | undefined): string;
/**
 * ¿Lo escrito es la fecha de la última sincronización? Sin ninguna previa, hay que escribir «PRIMERA».
 * Se toleran espacios y guiones en vez de barras; nada más.
 */
export declare function confirmacionValida(ultima: Date | string | null | undefined, escrita: unknown): boolean;
