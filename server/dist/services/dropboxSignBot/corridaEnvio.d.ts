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
    /** «Enviar ahora N»: cuántos pidió la persona (si no, el tamaño de tanda). El cupo de 24 h sigue mandando. */
    cantidad?: number;
}
export declare const corridaEnvioDe: (tenantId: string) => CorridaEnvio | undefined;
export declare const ocupadaPor: (tenantId: string) => {
    desde: Date;
    automatica: boolean;
    motivo: import("./candado.js").MotivoCandado;
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
    /** Cuándo saldría según el scheduler (ISO), si está en la cola y el envío automático está activo. */
    estimadoAt: string | null;
    /** El último intento que falló en la pantalla o la red, sin sacarlo de la cola (26/10/2026). */
    ultimoIntento?: {
        at: string;
        detalle: string;
    } | null;
}
/**
 * El estado de cada archivo del listado del tab: una query por lote, sin tocar Dropbox.
 *
 * `hashes` (opcional): el `contentHash` que la pantalla ya tiene del listado del Outbox. Con eso, y con
 * la fecha de las reglas y la versión de la plantilla, cada colocación guardada dice si quedó
 * DESACTUALIZADA (25/10/2026): antes se mostraba la de días atrás como si fuera el estado actual.
 */
export declare function estadoDeArchivos(tenantId: string, archivos: string[], hashes?: Record<string, string>): Promise<EstadoArchivo[]>;
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
    cantidad?: number;
}): Promise<Cola>;
/** Arranca una corrida y vuelve en el acto. Manual (botón) respeta sólo enfriamiento y cupo. */
export declare function arrancarCorridaEnvio(tenantId: string, opciones?: {
    automatica?: boolean;
    enSeco?: boolean;
    cantidad?: number;
}): Promise<{
    enSeco: boolean;
    cantidad: number | null;
}>;
/**
 * Mueve documentos de la cola: al principio, al fondo, o antes de otro (el arrastre). El resto conserva
 * su orden relativo y se renumera 1..n. Persiste en el servidor (`orden`), así que sobrevive a recargar
 * y es el que usa el planificador. Deja la cola marcada como «orden manual».
 */
export declare function reordenarCola(tenantId: string, codigos: string[], a: "tope" | "fondo" | {
    antesDe: string;
}): Promise<{
    movidos: number;
}>;
/** Vuelve al orden automático: de más reciente a menos reciente (el que usa el bot si nadie lo toca). */
export declare function ordenAutomaticoDeCola(tenantId: string): Promise<{
    total: number;
}>;
export interface ItemDeCola {
    posicion: number;
    archivo: string;
    codigo: string;
    firmante: string;
    tipo: string;
    /** en_cola | limite | enviando */
    estado: string;
    enOutbox: boolean;
    /** Entra en el cupo de las próximas 24 h (está arriba de la línea de corte). */
    entra: boolean;
    estimadoAt: string | null;
}
export interface VistaDeCola extends Cola {
    items: ItemDeCola[];
    resumen: {
        listos: number;
        entranAhora: number;
        quedan: number;
        cupo: number;
        enviados24h: number;
        tope: number;
        liberaAt: string | null;
        tamanoTanda: number;
    };
    ordenManual: boolean;
    trabados: Array<{
        tipo: string;
        titulo: string;
        accion: {
            texto: string;
            destino: string;
        };
        cantidad: number;
        items: Array<{
            archivo: string;
            codigo: string;
            detalle: string;
            firmante: string;
            verificadaAt: string | null;
        }>;
    }>;
    verificacion: {
        ultimaAt: string | null;
        desactualizada: boolean;
        corriendo: boolean;
    };
    estadoPanel: {
        tipo: string;
        texto: string;
    };
    corriendo: boolean;
}
/**
 * LA COLA DE VERDAD: lo que se va a enviar, en orden, con la línea de corte del cupo; lo trabado,
 * agrupado por motivo con su salida; y en qué estado está el envío. Lee de los registros (que escribe
 * «Verificar todos» y la corrida), no de una caché propia.
 */
export declare function vistaDeCola(tenantId: string): Promise<VistaDeCola>;
/** Saca de la lista de trabados (no se envían; si se vuelven a encolar, se re-evalúan). */
export declare function descartarTrabados(tenantId: string, codigos: string[]): Promise<{
    quitados: number;
}>;
