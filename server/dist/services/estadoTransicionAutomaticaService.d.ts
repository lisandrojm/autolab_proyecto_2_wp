import { IInfo } from "../models/Info.js";
import { IUserProject } from "../models/UserProject.js";
/** Eventos que pueden disparar una transición automática hacia un Estado. */
export type EventoTransicionAutomatica = "alta_documento_subido" | "dropbox_carpeta";
export interface ResultadoTransicion {
    aplicada: boolean;
    /** Solo si NO se aplicó, para logs. */
    motivo?: string;
    estadoAnteriorId?: number;
    estadoNuevo?: {
        id: number;
        nombre: string;
    };
}
/** Estados (catálogo global) configurados con este evento. Ya validado al guardar: todos tienen `ordenDependencia`. */
export declare function cargarEstadosPorEvento(evento: EventoTransicionAutomatica): Promise<IInfo[]>;
/** Del catálogo de estados con este evento, el que ocupa EXACTAMENTE el paso siguiente (nunca salta pasos). */
export declare function estadoDestinoDesdeCatalogo(catalogo: IInfo[], ordenDependenciaActual: number): IInfo | null;
/** Estado destino aplicable para este evento, dado el estado actual del contrato (o null si no corresponde). */
export declare function buscarEstadoDestino(evento: EventoTransicionAutomatica, estadoActualId: number | undefined | null): Promise<IInfo | null>;
/**
 * Muta `up.contracts[contractIndex]` (estado_id + nombre_estado_empleado) y persiste. Re-valida
 * "hacia adelante" tomando el estado actual DEL DOCUMENTO en este instante (defensivo: `up` pudo
 * cargarse hace rato), así que es seguro invocarla especulativamente. Idempotente: si el contrato ya
 * está en ese estado o más adelante, no hace nada.
 */
export declare function aplicarTransicion(up: IUserProject, contractIndex: number, estadoDestino: IInfo): Promise<ResultadoTransicion>;
/** Combina `buscarEstadoDestino` + `aplicarTransicion` — punto de entrada único para un evento puntual. */
export declare function intentarTransicionPorEvento(up: IUserProject, contractIndex: number, evento: EventoTransicionAutomatica): Promise<ResultadoTransicion>;
