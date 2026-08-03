export declare const initEstadoDropboxScheduler: () => void;
export interface ResultadoEscaneoManual {
    /** Ya había un escaneo (manual o del cron) en curso — no se disparó uno nuevo. */
    enCurso?: boolean;
    error?: "dropbox_no_conectado" | "sin_transiciones_configuradas";
    estadosEscaneados?: number;
    transicionesAplicadas?: number;
}
/**
 * Dispara un escaneo inmediato de UN tenant (botón "Forzar escaneo ahora" de la UI), sin esperar al
 * cron. Comparte el candado `isRunning` con `scanDropboxTriggers` para que nunca corran dos escaneos en
 * simultáneo, sea manual o automático.
 */
export declare function escanearTenantAhora(tenantId: string): Promise<ResultadoEscaneoManual>;
