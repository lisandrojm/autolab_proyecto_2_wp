/**
 * SINCRONIZACIÓN INCREMENTAL DE LAS RELACIONES LABORALES CON ARCA. SÓLO LEE EN ARCA.
 *
 * Para cada empleadora con CUIT, consulta en Simplificación Registral los movimientos (altas y
 * bajas) ingresados en los últimos `meses` meses —«Fecha de ingreso de movimientos» → «Mes
 * determinado»— y baja el TXT de todas las páginas. Lo parsea con el mismo parser del seed y lo
 * guarda por clave natural: una baja ACTUALIZA la relación que ya estaba (ver
 * `relacionesArcaStore.ts`). Al final recalcula la antigüedad de los CUIL tocados y de todos los
 * que tienen una relación abierta (a esos la antigüedad les crece un día por día).
 *
 * Comparte con las otras corridas la sesión de ARCA (`navegador.ts`, `sesionTibia.ts`) y el candado
 * por tenant (`candadoArca.ts`, tipo `relaciones`): si hay otra corrida, no arranca. Una sola
 * sesión para todas las empleadoras: se cambia de CUIT en el selector, como hace la validación de
 * obras sociales. Si la sesión se cae a mitad de camino se abre una nueva UNA vez; si vuelve a
 * caerse, se aborta con el motivo.
 *
 * Si ARCA muestra una pantalla que el motor no reconoce, se guarda el HTML anonimizado en
 * `server/tmp/arca-relaciones/` y se aborta la corrida con la ruta en el resumen: así el motor se
 * ajusta mirando la pantalla real y no probando a ciegas contra el organismo.
 *
 * El resumen de cada corrida queda en `Tenant.integrations.arcaSimplificacion.sincronizacionRelaciones.ultimaSync`.
 */
export interface ResumenSyncMes {
    mes: string;
    resultado: "ok" | "sin_datos" | "error";
    paginas: number;
    filas: number;
    descartes: number;
    error?: string;
}
export interface ResumenSyncEmpresa {
    cuit: string;
    razonSocial: string;
    meses: ResumenSyncMes[];
    nuevas: number;
    actualizadas: number;
    bajasAplicadas: number;
    sinCambios: number;
    error?: string;
}
export interface ResumenSync {
    fecha: string;
    hoy: string;
    meses: string[];
    automatica: boolean;
    empresas: ResumenSyncEmpresa[];
    cuilsRecalculados: number;
    filasAntiguedad: number;
    duracionMs: number;
    error?: string;
    /** Ruta del HTML guardado cuando ARCA mostró una pantalla desconocida. */
    htmlGuardado?: string;
}
export interface EstadoSync {
    desde: Date;
    automatica: boolean;
    progreso: string[];
}
/** La corrida en curso de ese tenant, o `null`. Lo lee la pantalla mientras espera. */
export declare const syncEnCurso: (tenantId: string) => EstadoSync | null;
/** Los últimos `n` meses contando el de `hoy`: "2026-10-12", 2 → ["2026-10", "2026-09"]. */
export declare function mesesAtras(hoy: string, n: number): string[];
export declare function sincronizarRelacionesTenant(tenantId: string, o?: {
    meses?: number;
    automatica?: boolean;
}): Promise<ResumenSync>;
