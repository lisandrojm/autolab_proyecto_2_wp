import { IInfo } from "../models/Info.js";
import { IUserProject } from "../models/UserProject.js";
/** Único evento que puede disparar una transición automática hacia un Estado. */
export type EventoTransicionAutomatica = "dropbox_carpeta";
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
/**
 * Muta `up.contracts[contractIndex]` (estado_id + nombre_estado_empleado) y persiste. Re-valida
 * "hacia adelante" tomando el estado actual DEL DOCUMENTO en este instante (defensivo: `up` pudo
 * cargarse hace rato), así que es seguro invocarla especulativamente. Idempotente: si el contrato ya
 * está en ese estado o más adelante, no hace nada. No hace falta que el destino sea el paso inmediato
 * siguiente: alcanza con que esté más adelante que el actual (el evento certifica que ya llegó ahí).
 */
export declare function aplicarTransicion(up: IUserProject, contractIndex: number, estadoPedido: IInfo): Promise<ResultadoTransicion>;
/**
 * EL ESTADO AL QUE LLEVA UN TRÁMITE: el que tiene configurada una carpeta de Dropbox con ese
 * propósito («alta_temprana», «constancia_cuit»). Es el mismo estado al que mueve el escaneo de
 * carpetas cuando ve el archivo; lo usan los caminos que ya saben que el trámite terminó (el alta
 * registrada, la constancia archivada) para avanzar en el momento y no esperar la próxima pasada.
 */
export declare function estadoDestinoPorProposito(proposito: string): Promise<IInfo | null>;
