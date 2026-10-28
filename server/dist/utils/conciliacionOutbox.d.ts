import { ArchivoConNombre } from "./coincidenciaDeNombre.js";
/**
 * LO QUE YA SE ENVIÓ NO SE QUEDA EN OUTBOX (28/10/2026). La decisión, SIN Dropbox ni base: es lo que se
 * testea. La ejecución está en `services/conciliacionOutboxService.ts`.
 *
 * El aviso por mail de Dropbox Sign (`dropboxSignMailService.ts`) era la única señal de que un documento
 * se había enviado: si no llegaba, no entraba en la ventana de 30 días o el asunto no matcheaba, el
 * archivo quedaba en Outbox para siempre, aunque ya estuviera esperando firma o hasta firmado. Así quedaron
 * 20 recibos del PERIODO_09, que en cuanto existiera la regla de colocación se habrían vuelto a mandar.
 *
 * Las carpetas son la otra fuente, y la más confiable: si el código del documento («ID-000429») está en
 * Pendbox o en Requested signatures, se envió. Por cada archivo del Outbox:
 *   · con código y ese código en Firmados → `firmado` (gana sobre Pendbox: ya volvió);
 *   · con código y ese código en Pendbox → `esperando_firma`;
 *   · si no, se queda: `sin_codigo` (no se adivina por persona ni CUIL: hay personas con dos documentos,
 *     BENITEZ con ID-000448 e ID-000510) o `sin_rastro`.
 * Los que se van se MUEVEN (nunca se borran): un match equivocado se recupera.
 */
export type EstadoYaEnviado = "firmado" | "esperando_firma";
export interface YaEnviado {
    archivo: ArchivoConNombre;
    codigo: string;
    estado: EstadoYaEnviado;
    /** El archivo de Pendbox o Firmados que lo prueba. */
    prueba: string;
}
export interface Queda {
    archivo: ArchivoConNombre;
    motivo: "sin_codigo" | "sin_rastro";
}
export interface PlanConciliacion {
    mover: YaEnviado[];
    quedan: Queda[];
}
/** Código → primer archivo que lo trae, de una carpeta. */
export declare function codigosDe(archivos: ArchivoConNombre[]): Map<string, string>;
export declare function planConciliacionOutbox(outbox: ArchivoConNombre[], pendbox: ArchivoConNombre[], firmados: ArchivoConNombre[]): PlanConciliacion;
/** Si el código ya está en Pendbox o Firmados, cuál de los dos (la red de la corrida de envío). */
export declare function yaEnviadoPorCarpeta(codigo: string, carpetas: {
    pendbox: Map<string, string>;
    firmados: Map<string, string>;
}): EstadoYaEnviado | null;
export declare const TEXTO_ESTADO: Record<EstadoYaEnviado, string>;
/** El resumen del modo seco: totales y una línea por archivo que se movería. */
export declare function describirConciliacion(plan: PlanConciliacion, enSeco: boolean): string[];
