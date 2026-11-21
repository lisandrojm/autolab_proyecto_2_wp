export declare const TOPE_POR_DEFECTO = 20;
export declare const DETALLE_AUDITORIA = "cron sincronizacionRelaciones: bajas de ARCA a contratos";
/** El tope vigente: `TOPE_BAJAS_ARCA_AUTOMATICAS` (entero ≥ 1) o 20. */
export declare function topeBajasAutomaticas(valor?: unknown): number;
export interface ResumenBajasAutomaticas {
    /** Cuántas iban a aplicarse (evidencia fuerte, después del guardián y sin las empleadoras con error). */
    aplicables: number;
    aplicadas: number;
    /** Cambiaron entre el plan y la escritura (no se pisó nada). */
    cambiaron: number;
    /** Las que se listan para una persona (sin evidencia, revisión manual, granularidad…). */
    listadas: number;
    /** Con evidencia pero de una empleadora cuya lectura falló en esta corrida. */
    excluidasPorEmpleadora: number;
    frenada: boolean;
    tope: number;
    error?: string;
}
/**
 * La decisión, pura: qué claves se escriben, o nada si se pasa del tope.
 * `cuitsConError`: empleadoras cuya lectura falló en esta corrida (su espejo es viejo).
 */
export declare function decidirBajasAutomaticas(items: {
    contratoKey: string;
    aplicar: boolean;
    empleadoraCuit: string;
}[], tope: number, cuitsConError?: string[]): Pick<ResumenBajasAutomaticas, "aplicables" | "listadas" | "excluidasPorEmpleadora" | "frenada" | "tope"> & {
    claves: string[];
};
/** Después de una corrida automática sana: aplica (o frena) y deja el resultado en `ultimaSync.bajasContratos`. */
export declare function aplicarBajasArcaAutomaticas(tenantId: string, cuitsConError?: string[]): Promise<ResumenBajasAutomaticas>;
