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
export const CATEGORIA_CAMBIO_TURNO = "cambio_turno";
/** La `systemKey` con la que el init lo reconoce (una por tenant). */
export const SYSTEM_KEY_CAMBIO_TURNO = "cambio_turno";
/** El nombre con el que nace (y con el que se asimila uno existente). Después se puede renombrar. */
export const NOMBRE_CAMBIO_TURNO = "Cambio de turno";
/** El `code` de la plantilla PDF del tipo. */
export const PLANTILLA_CAMBIO_TURNO = "cambioTurno";
export const REGLAS_CAMBIO_TURNO_POR_DEFECTO = { diasAnticipacion: 3, permitirTemporal: true, cupoMaximoPorTurno: null };
/** Las reglas de un tipo, completando con los defaults lo que no esté guardado (o esté mal guardado). */
export function reglasCambioTurnoDe(config) {
    const r = (config && typeof config === "object" ? config.reglasCambioTurno : null) || {};
    const dias = Number(r.diasAnticipacion);
    const cupo = Number(r.cupoMaximoPorTurno);
    return {
        diasAnticipacion: Number.isInteger(dias) && dias >= 0 ? dias : REGLAS_CAMBIO_TURNO_POR_DEFECTO.diasAnticipacion,
        permitirTemporal: r.permitirTemporal === undefined || r.permitirTemporal === null ? REGLAS_CAMBIO_TURNO_POR_DEFECTO.permitirTemporal : !!r.permitirTemporal,
        cupoMaximoPorTurno: Number.isInteger(cupo) && cupo > 0 ? cupo : null,
    };
}
/** Suma días corridos a una fecha "YYYY-MM-DD" sin pasar por la zona horaria del proceso. */
export function sumarDias(fecha, dias) {
    const [y, m, d] = fecha.split("-").map(Number);
    const t = Date.UTC(y, m - 1, d + dias);
    return new Date(t).toISOString().slice(0, 10);
}
/** Dos rangos de fechas (hasta null = abierto) se pisan. Inclusivos. */
export function rangosSePisan(a, b) {
    const aHasta = a.hasta || "9999-12-31";
    const bHasta = b.hasta || "9999-12-31";
    return a.desde <= bHasta && b.desde <= aHasta;
}
