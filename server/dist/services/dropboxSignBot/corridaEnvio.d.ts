import { type ResumenColocacion } from "../../models/DropboxSignEnvio.js";
import { type ILineaEnvio } from "../../models/DropboxSignEnvioLog.js";
import { type ConfigEnvio, type EstadoThrottle, type Plan } from "./planificador.js";
import { leerOutbox, resolverFirmante } from "./outbox.js";
export { leerOutbox, resolverFirmante };
export type EventoEnvio = {
    tipo: "abriendo" | "sesion" | "cola" | "documento" | "irreversible" | "resultado" | "limite" | "fin" | "fallo" | "info";
    at: Date;
    texto: string;
    archivo?: string;
    codigo?: string;
    estado?: string;
};
export interface CorridaEnvio {
    tenantId: string;
    enSeco: boolean;
    automatica: boolean;
    eventos: EventoEnvio[];
    terminada: boolean;
    /** Se está apretando «Enviar para firmar» de un documento: «Detener» espera a que termine ése. */
    irreversible: boolean;
    señal: {
        cortada: boolean;
    };
    arrancadaEl: Date;
    total: number;
    enviados: number;
    errores: number;
    limite: boolean;
    /** El archivo que está pasando por el wizard ahora. */
    actual: string | null;
    lineas: ILineaEnvio[];
}
export declare const corridaEnvioDe: (tenantId: string) => CorridaEnvio | undefined;
export declare const ocupadaPor: (tenantId: string) => {
    desde: Date;
    automatica: boolean;
};
/** Seco salvo que se diga lo contrario fuera de producción; en producción, real salvo que se fuerce seco. */
export declare function enSecoForzado(): boolean;
export declare function detenerCorridaEnvio(tenantId: string): {
    ok: boolean;
    motivo?: string;
};
/** La configuración y el estado del throttle del tenant, con los defaults. */
export declare function configDelTenant(tenantId: string): Promise<{
    config: ConfigEnvio;
    estado: EstadoThrottle;
    cc: string;
    bot: any;
}>;
/**
 * ENCOLAR desde «Para Firmar»: cada archivo se valida (`validarEncolado`) y entra con el próximo
 * `orden`. Lo que no pasa queda `requiere_revision` con su motivo (salvo lo ya enviado o encolado,
 * que no se toca). `todosElegibles` recorre el Outbox entero.
 */
export declare function encolar(tenantId: string, userId: string | undefined, pedido: {
    archivos?: string[];
    todosElegibles?: boolean;
}): Promise<{
    encolados: number;
    rechazados: Array<{
        archivo: string;
        motivo: string;
    }>;
    porMotivo: Record<string, number>;
}>;
/** Saca de la cola. Sólo afecta `en_cola`: lo enviado, lo frenado por el límite y lo demás no se toca. */
export declare function desencolar(tenantId: string, codigos: string[]): Promise<{
    quitados: number;
}>;
export interface EstadoArchivo {
    archivo: string;
    codigo: string;
    /** `en_cola` | `enviando` | `enviado` | `limite` | `error` | `requiere_revision` | `seco` | "" (sin encolar) */
    estado: string;
    detalle: string;
    enviadoAt: string | null;
    /** Posición en la cola (1 = próximo), si está en ella. */
    posicion: number | null;
    /** La última detección del ancla de la firma (✓/✗ con página, rótulo y motivo), si se hizo. */
    colocacion: ResumenColocacion | null;
}
/** El estado de cada archivo del listado del tab: una query por lote, sin tocar Dropbox. */
export declare function estadoDeArchivos(tenantId: string, archivos: string[]): Promise<EstadoArchivo[]>;
export interface Cola extends Plan {
    outbox: string | null;
    archivosEnOutbox: number;
    enCola: number;
    /** Por qué el scheduler no correría ahora (informativo). */
    motivoNoCorre: string | null;
}
/** Qué enviaría la próxima tanda: la cola contra el Outbox, planificada. No envía nada. */
export declare function armarCola(tenantId: string, opciones?: {
    manual?: boolean;
}): Promise<Cola>;
/** Arranca una corrida y vuelve en el acto. Manual (botón) respeta sólo enfriamiento y cupo. */
export declare function arrancarCorridaEnvio(tenantId: string, opciones?: {
    automatica?: boolean;
    enSeco?: boolean;
}): Promise<{
    enSeco: boolean;
}>;
