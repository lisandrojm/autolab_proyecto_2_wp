import { getTenantDropboxConfig } from "./dropboxService.js";
import { PlanConciliacion, posiblesPorNombre } from "../utils/conciliacionOutbox.js";
/**
 * LA EJECUCIÓN de la conciliación Outbox ↔ Pendbox/Firmados (la decisión es `utils/conciliacionOutbox.ts`).
 *
 * Lista las tres carpetas, arma el plan y, si no es en seco, MUEVE cada duplicado a `CARPETA_YA_ENVIADOS`
 * (hermana del Outbox: fuera de «Para Firmar» y de la cola del bot, que listan el Outbox sin subcarpetas)
 * y cierra su registro de la cola de envío: deja de figurar en cola o como trabado. Nunca borra. Si un
 * movimiento falla, el archivo se queda en Outbox y se reintenta en la próxima pasada.
 *
 * La llaman el escaneo de carpetas (`estadoDropboxCronService.scanTenant`) y el script
 * `scripts/conciliarOutbox.ts`. El escaneo la corre EN SECO hasta que una pasada real del script la
 * confirme (`integrations.dropbox.conciliacionOutboxConfirmadaAt`): primero se revisa la lista.
 */
type TenantDropboxConfig = NonNullable<ReturnType<typeof getTenantDropboxConfig>>;
export declare const CARPETA_YA_ENVIADOS = "Outbox_ya_enviados";
export interface ResultadoConciliacion {
    plan: PlanConciliacion;
    movidos: number;
    registrosCerrados: number;
    destino: string | null;
    fallas: Array<{
        archivo: string;
        error: string;
    }>;
    salteada?: "sin_carpetas";
    /** Qué se leyó de cada carpeta, para entender un plan vacío (lo imprime el script). */
    diagnostico?: {
        carpetas: Array<{
            cual: string;
            ruta: string | null;
            archivos: number;
            conCodigo: number;
            ejemplos: string[];
        }>;
        posibles: ReturnType<typeof posiblesPorNombre>;
    };
}
/** Los códigos que ya están en Pendbox y en Firmados: dos listados. La red de la corrida de envío. */
export declare function codigosYaEnviados(tenantId: string, cfg: TenantDropboxConfig): Promise<{
    pendbox: Map<string, string>;
    firmados: Map<string, string>;
} | null>;
export declare function conciliarOutbox(tenantId: string, cfg: TenantDropboxConfig, opts: {
    enSeco: boolean;
    log?: (linea: string) => void;
}): Promise<ResultadoConciliacion>;
/**
 * YA ENVIADOS CONFIRMADOS A MANO: códigos que una persona verificó en Dropbox Sign (enviados por fuera de
 * estas carpetas, sin rastro en Pendbox ni Firmados). Mismo destino y mismo cierre del registro que la
 * conciliación; nunca borra. Por cada código devuelve, como evidencia para revisar, lo que hay en Pendbox
 * y en Firmados del MISMO CUIL (no decide nada con eso).
 */
export declare function moverConfirmadosAMano(tenantId: string, cfg: TenantDropboxConfig, codigos: string[], opts: {
    enSeco: boolean;
}): Promise<{
    destino: string;
    filas: {
        codigo: string;
        archivo: string | null;
        evidencia: string[];
        movido: boolean;
        error?: string;
    }[];
}>;
/** ¿Ya hubo una pasada real confirmada a mano? Hasta entonces el escaneo la corre en seco. */
export declare function conciliacionConfirmada(tenantId: string): Promise<boolean>;
export {};
