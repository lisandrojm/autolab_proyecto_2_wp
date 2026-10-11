import { getTenantDropboxConfig } from "./dropboxService.js";
import { PlanLimpieza } from "../utils/limpiezaPendbox.js";
/**
 * LA EJECUCIÓN de la limpieza de Pendbox (la decisión es `utils/limpiezaPendbox.ts`).
 *
 * Lista Requested signatures («Firmados») y, sólo si hay algo que emparejar, Pendbox —que puede tener
 * cientos de archivos— una sola vez. Arma el plan y, si no es en seco, lo aplica: renombra el firmado
 * (moveEntry) y recién si eso terminó bien borra el original (deleteEntry). Si algo falla, el
 * original se queda y se vuelve a intentar en la próxima pasada.
 *
 * La llaman el escaneo de carpetas (`estadoDropboxCronService.scanTenant`, cada pasada) y el script
 * `scripts/limpiarPendbox.ts` (a mano, con DRY_RUN).
 */
/** El tipo no está exportado por dropboxService: se toma del getter. */
type TenantDropboxConfig = NonNullable<ReturnType<typeof getTenantDropboxConfig>>;
export interface ResultadoLimpieza {
    plan: PlanLimpieza;
    renombrados: number;
    borrados: number;
    fallas: Array<{
        firmado: string;
        paso: "renombrar" | "borrar";
        error: string;
    }>;
    /** Faltaba una carpeta o Firmados estaba vacía: no se listó Pendbox. */
    salteada?: "sin_carpetas" | "firmados_vacia";
}
export declare function limpiarPendbox(tenantId: string, cfg: TenantDropboxConfig, opts: {
    enSeco: boolean;
    log?: (linea: string) => void;
}): Promise<ResultadoLimpieza>;
export {};
