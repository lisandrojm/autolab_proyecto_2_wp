export declare const MAX_REINTENTOS = 2;
export declare const ESPERA_REINTENTO_MS: number;
/** Cuándo reintentar después de una corrida automática, o `null` si no corresponde. Pura: se prueba sin ARCA. */
export declare function siguienteReintento(error: string | undefined, intentosHechos: number, ahora: Date): {
    numero: number;
    desde: Date;
} | null;
export declare const HORA_POR_DEFECTO = "06:00";
export declare const MESES_POR_DEFECTO = 1;
/** "HH:MM" → { hora, minuto }. Lo que no se entiende cae al default. */
export declare function horaDe(texto: unknown): {
    hora: number;
    minuto: number;
};
export declare function configSyncDe(guardado: any): {
    activa: boolean;
    hora: string;
    meses: number;
};
export declare function initSincronizacionRelacionesScheduler(): void;
