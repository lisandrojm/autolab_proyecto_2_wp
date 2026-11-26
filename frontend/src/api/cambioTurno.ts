import axios from "./axiosConfig";
import type { ErrorCambioTurno, PedidoCambioTurno, ReglasCambioTurno } from "@compartido/cambioDeTurno";

/**
 * CAMBIO DE TURNO (tipo de pedido de sistema, 26/11/2026): lo que el móvil necesita para armar el pedido y
 * anticipar los errores. Las reglas viven en el server (`services/cambioDeTurno.ts`); acá no se calcula nada.
 */
export interface TurnoParaPedir {
  id: string;
  nombre: string;
  horario: string;
  dias: number[];
}

export interface FilaParaPedir {
  areaId: string;
  areaNombre: string;
  sedeId: number | null;
  sedeNombre: string;
  /** El turno (o turnos) en que está hoy en esa fila. */
  turnosActuales: TurnoParaPedir[];
  /** A dónde puede pedir pasar. */
  turnosPosibles: TurnoParaPedir[];
}

export interface ContextoCambioTurno {
  hoy: string;
  reglas: ReglasCambioTurno;
  /** La primera fecha desde válida (hoy + anticipación). */
  fechaMinima: string;
  proyectos: { projectId: string; nombre: string; filas: FilaParaPedir[] }[];
  tipo: { _id: string; nombre: string; isActive: boolean };
}

export const cambioTurnoAPI = {
  /** Los proyectos donde la persona tiene turno hoy, con su turno actual y los posibles, más las reglas. */
  contexto: async (): Promise<ContextoCambioTurno> => {
    const { data } = await axios.get<ContextoCambioTurno>("/orders/cambio-turno/contexto");
    return data;
  },
  /** La misma lista de errores que daría el envío, sin crear nada. */
  validar: async (pedido: PedidoCambioTurno): Promise<{ ok: boolean; errores: ErrorCambioTurno[] }> => {
    const { data } = await axios.post<{ ok: boolean; errores: ErrorCambioTurno[] }>("/orders/validate-cambio-turno", pedido);
    return data;
  },
};
