export declare function transicionarEstados(opciones?: {
    escribir?: boolean;
    hoy?: string;
}): Promise<{
    finalizados: number;
    completados: number;
    vinculos: number;
}>;
export declare function initTransicionEstadoScheduler(): void;
