/**
 * CAMBIO DE TURNO: lo que comparten server y front (26/11/2026).
 *
 * Es un TIPO DE PEDIDO DE SISTEMA: cada tenant lo tiene (lo garantiza `services/orderConfigInitService.ts`),
 * no se borra, y su tipo de dato no se cambia. La persona pide pasar de su turno actual a otro de la misma
 * área, desde una fecha y, si quiere, hasta otra. Al aprobarse (y firmarse, si el tipo firma), el server
 * mueve a la persona en el equipo del proyecto con la misma escritura que la Jerarquía.
 *
 * Puro, sin imports: lo usa el front vía `@compartido`.
 */

/** El `categoryType` del tipo de pedido. */
export const CATEGORIA_CAMBIO_TURNO = "cambio_turno" as const;
/** La `systemKey` con la que el init lo reconoce (una por tenant). */
export const SYSTEM_KEY_CAMBIO_TURNO = "cambio_turno" as const;
/** El nombre con el que nace (y con el que se asimila uno existente). Después se puede renombrar. */
export const NOMBRE_CAMBIO_TURNO = "Cambio de turno";
/** El `code` de la plantilla PDF del tipo. */
export const PLANTILLA_CAMBIO_TURNO = "cambioTurno" as const;

/** Reglas configurables del tipo (viven en `OrderConfig.config.reglasCambioTurno`). */
export interface ReglasCambioTurno {
  /** Días corridos mínimos entre hoy y `fechaDesde`. */
  diasAnticipacion: number;
  /** Si se puede pedir con `fechaHasta` (cambio temporal). Sin ella el cambio es permanente. */
  permitirTemporal: boolean;
  /** Tope de personas en el turno de destino; null = sin tope. */
  cupoMaximoPorTurno: number | null;
}

export const REGLAS_CAMBIO_TURNO_POR_DEFECTO: ReglasCambioTurno = { diasAnticipacion: 3, permitirTemporal: true, cupoMaximoPorTurno: null };

/** Las reglas de un tipo, completando con los defaults lo que no esté guardado (o esté mal guardado). */
export function reglasCambioTurnoDe(config: any): ReglasCambioTurno {
  const r = (config && typeof config === "object" ? config.reglasCambioTurno : null) || {};
  const dias = Number(r.diasAnticipacion);
  const cupo = Number(r.cupoMaximoPorTurno);
  return {
    diasAnticipacion: Number.isInteger(dias) && dias >= 0 ? dias : REGLAS_CAMBIO_TURNO_POR_DEFECTO.diasAnticipacion,
    permitirTemporal: r.permitirTemporal === undefined || r.permitirTemporal === null ? REGLAS_CAMBIO_TURNO_POR_DEFECTO.permitirTemporal : !!r.permitirTemporal,
    cupoMaximoPorTurno: Number.isInteger(cupo) && cupo > 0 ? cupo : null,
  };
}

/** Lo que la persona pide (va en `Order.dynamicValue`). Fechas "YYYY-MM-DD"; `fechaHasta` null = permanente. */
export interface PedidoCambioTurno {
  projectId: string;
  areaId: string;
  /** La fila del área (sede); null = la fila sin sede. */
  sedeId: number | null;
  /** El turno en el que está hoy en esa fila (el server lo vuelve a tomar del equipo: es sólo lectura). */
  shiftActualId: string;
  shiftSolicitadoId: string;
  fechaDesde: string;
  fechaHasta: string | null;
  motivo: string;
}

/** Un error de validación, con código estable para el front y mensaje para la persona. */
export interface ErrorCambioTurno {
  codigo: string;
  mensaje: string;
}

/** Suma días corridos a una fecha "YYYY-MM-DD" sin pasar por la zona horaria del proceso. */
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d + dias);
  return new Date(t).toISOString().slice(0, 10);
}

/** Dos rangos de fechas (hasta null = abierto) se pisan. Inclusivos. */
export function rangosSePisan(a: { desde: string; hasta: string | null }, b: { desde: string; hasta: string | null }): boolean {
  const aHasta = a.hasta || "9999-12-31";
  const bHasta = b.hasta || "9999-12-31";
  return a.desde <= bHasta && b.desde <= aHasta;
}
