export declare const DEFAULT_INTERVAL_MINUTES = 20;
export declare const MIN_INTERVAL_MINUTES = 5;
export declare const MAX_INTERVAL_MINUTES: number;
export declare const initEstadoDropboxScheduler: () => void;
export interface ResultadoEscaneoManual {
    /** Ya había un escaneo en curso para ESTE tenant — no se disparó uno nuevo. */
    enCurso?: boolean;
    error?: "dropbox_no_conectado" | "sin_transiciones_configuradas";
    estadosEscaneados?: number;
    transicionesAplicadas?: number;
}
/**
 * Dispara un escaneo inmediato de UN tenant (botón "Forzar escaneo ahora" de la UI), sin esperar a que
 * le toque el turno según su intervalo configurado. Actualiza `lastScanAt` igual que un escaneo
 * automático, así el conteo regresivo del próximo escaneo se reinicia desde acá.
 */
export declare function escanearTenantAhora(tenantId: string): Promise<ResultadoEscaneoManual>;
export interface EscaneoConfig {
    intervalMinutos: number;
    ultimoEscaneoAt: number | null;
    proximoEscaneoAt: number | null;
}
/** Config + estado actual del escaneo automático de un tenant, para mostrar en la UI (intervalo, cuenta
 *  regresiva al próximo escaneo). */
export declare function getEscaneoConfig(tenantId: string): Promise<EscaneoConfig>;
/** Cambia el intervalo de escaneo de un tenant (minutos, acotado a [MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES]). */
export declare function setEscaneoIntervalo(tenantId: string, minutos: number): Promise<EscaneoConfig>;
