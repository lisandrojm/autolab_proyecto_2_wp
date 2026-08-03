import { Info, IInfo } from "../models/Info.js";
import { IUserProject } from "../models/UserProject.js";

/** Único evento que puede disparar una transición automática hacia un Estado. */
export type EventoTransicionAutomatica = "dropbox_carpeta";

export interface ResultadoTransicion {
  aplicada: boolean;
  /** Solo si NO se aplicó, para logs. */
  motivo?: string;
  estadoAnteriorId?: number;
  estadoNuevo?: { id: number; nombre: string };
}

const ESTADO_TYPE = "estado-empleado";

/** Estados (catálogo global) configurados con este evento. Ya validado al guardar: todos tienen `ordenDependencia`. */
export async function cargarEstadosPorEvento(evento: EventoTransicionAutomatica): Promise<IInfo[]> {
  return Info.find({ type: ESTADO_TYPE, "data.transicionAutomatica.evento": evento });
}

/** Paso del flujo de dependencias de un Estado por su `estado_id` numérico. Sin estado = "paso 0" (antes del flujo). */
async function ordenDependenciaDelEstado(estadoId: number | undefined | null): Promise<number> {
  if (estadoId === undefined || estadoId === null) return 0;
  const estado = await Info.findOne({ type: ESTADO_TYPE, "data.id": estadoId }).select("data.ordenDependencia").lean();
  const orden = (estado as any)?.data?.ordenDependencia;
  return typeof orden === "number" ? orden : 0;
}

/**
 * Muta `up.contracts[contractIndex]` (estado_id + nombre_estado_empleado) y persiste. Re-valida
 * "hacia adelante" tomando el estado actual DEL DOCUMENTO en este instante (defensivo: `up` pudo
 * cargarse hace rato), así que es seguro invocarla especulativamente. Idempotente: si el contrato ya
 * está en ese estado o más adelante, no hace nada. No hace falta que el destino sea el paso inmediato
 * siguiente: alcanza con que esté más adelante que el actual (el evento certifica que ya llegó ahí).
 */
export async function aplicarTransicion(up: IUserProject, contractIndex: number, estadoDestino: IInfo): Promise<ResultadoTransicion> {
  const contrato = up.contracts[contractIndex] as any;
  if (!contrato) return { aplicada: false, motivo: "contrato_inexistente" };

  const destinoId = estadoDestino.data?.id;
  const destinoOrden = estadoDestino.data?.ordenDependencia;
  if (typeof destinoId !== "number" || typeof destinoOrden !== "number") return { aplicada: false, motivo: "estado_destino_invalido" };

  const estadoAnteriorId = contrato.estado_id as number | undefined;
  if (estadoAnteriorId === destinoId) return { aplicada: false, motivo: "ya_estaba" };

  const ordenActual = await ordenDependenciaDelEstado(estadoAnteriorId);
  if (destinoOrden <= ordenActual) return { aplicada: false, motivo: "no_es_hacia_adelante" };

  up.contracts[contractIndex] = { ...contrato.toObject(), estado_id: destinoId, nombre_estado_empleado: estadoDestino.name } as any;
  up.markModified("contracts");
  await up.save();

  return { aplicada: true, estadoAnteriorId, estadoNuevo: { id: destinoId, nombre: estadoDestino.name } };
}
