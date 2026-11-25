import type { RespuestaBase } from './tipos';

/**
 * De dónde salió el error:
 * - `tango`: Tango respondió `succeeded: false` (casi siempre con HTTP 200) o un error HTTP;
 * - `connector`: el connector rechazó el request (key, permisos, validación);
 * - `red`: no hubo respuesta usable (timeout, sin conexión, 502/503/504 de nginx);
 * - `cancelado`: la plataforma abortó el request con su `signal`.
 */
export type OrigenError = 'tango' | 'connector' | 'red' | 'cancelado';

/** El request que falló, para los logs. Nunca incluye la API key. */
export interface RequestFallido {
  ruta: string;
  tenant: string;
  empresa: string;
  query: Record<string, string>;
}

/** Un error de lectura, con el detalle real (`exceptionInfo.messages`) a mano. */
export class ErrorTango extends Error {
  constructor(
    readonly origen: OrigenError,
    readonly status: number,
    /** El detalle: lo que importa. El `message` de Tango casi siempre es genérico. */
    readonly mensajes: string[],
    /** La respuesta completa, si la hubo. */
    readonly respuesta?: unknown,
    /** El request que falló. */
    readonly request?: RequestFallido,
    /** Si tiene sentido reintentar: fallas de red o del túnel, no rechazos ni errores de datos. */
    readonly reintentable = false,
    opciones?: { cause?: unknown },
  ) {
    const detalle = mensajes.length ? mensajes.join(' | ') : `Error de ${origen} (HTTP ${status})`;
    const donde = request ? ` [${request.ruta} ${new URLSearchParams(request.query)}]` : '';
    super(detalle + donde, opciones);
    this.name = 'ErrorTango';
  }
}

/** Respuestas de error que no tienen la forma de Tango, como el 401 de Tango (problem+json). */
interface ProblemJson {
  title?: string;
  detail?: string;
}

/** Los mensajes de una respuesta de error, del más específico al más general, sin repetir. */
export function mensajesDe(r: (RespuestaBase & ProblemJson) | null | undefined): string[] {
  if (!r || typeof r !== 'object') return [];
  const info = r.exceptionInfo;
  const detalle = [...(info?.detailMessages ?? []), ...(info?.messages ?? [])].filter(Boolean);
  const todos = detalle.length
    ? detalle
    : [r.message, r.title, r.detail].filter((m): m is string => typeof m === 'string' && m !== '');
  return [...new Set(todos)];
}
