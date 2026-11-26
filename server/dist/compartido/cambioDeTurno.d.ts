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
export declare const CATEGORIA_CAMBIO_TURNO: "cambio_turno";
/** La `systemKey` con la que el init lo reconoce (una por tenant). */
export declare const SYSTEM_KEY_CAMBIO_TURNO: "cambio_turno";
/** El nombre con el que nace (y con el que se asimila uno existente). Después se puede renombrar. */
export declare const NOMBRE_CAMBIO_TURNO = "Cambio de turno";
/** El `code` de la plantilla PDF del tipo. */
export declare const PLANTILLA_CAMBIO_TURNO: "cambioTurno";
/** Reglas configurables del tipo (viven en `OrderConfig.config.reglasCambioTurno`). */
export interface ReglasCambioTurno {
    /** Días corridos mínimos entre hoy y `fechaDesde`. */
    diasAnticipacion: number;
    /** Si se puede pedir con `fechaHasta` (cambio temporal). Sin ella el cambio es permanente. */
    permitirTemporal: boolean;
    /** Tope de personas en el turno de destino; null = sin tope. */
    cupoMaximoPorTurno: number | null;
}
export declare const REGLAS_CAMBIO_TURNO_POR_DEFECTO: ReglasCambioTurno;
/** Las reglas de un tipo, completando con los defaults lo que no esté guardado (o esté mal guardado). */
export declare function reglasCambioTurnoDe(config: any): ReglasCambioTurno;
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
export declare function sumarDias(fecha: string, dias: number): string;
/** Dos rangos de fechas (hasta null = abierto) se pisan. Inclusivos. */
export declare function rangosSePisan(a: {
    desde: string;
    hasta: string | null;
}, b: {
    desde: string;
    hasta: string | null;
}): boolean;
