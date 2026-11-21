export type EstadoContrato = "VIGENTE" | "FINALIZADO" | "SIN_DETERMINAR";
export interface EstadoCalculado {
    estado: EstadoContrato;
    motivo?: string;
}
/**
 * @param tipoIndeterminado el tipo del contrato (ABM de Contratos) es de tiempo indeterminado; `undefined`
 *   si no se pudo saber cuál es el tipo.
 */
export declare function estadoSegunDatosLocales(c: {
    fecha_alta_contrato?: unknown;
    fecha_baja_contrato?: unknown;
}, tipoIndeterminado: boolean | undefined, hoy: string): EstadoCalculado;
/**
 * La vigencia por estado. Desde el 19/11/2026 ES `esContratoVigente` (los helpers ya la usan; el reporte
 * `reporteEstadoVsVigencia` la comparó con la vieja antes del cambio). Rige hoy = estado VIGENTE, ya
 * arrancó, y si tiene baja todavía no pasó. Sin estado, o con cualquier otro, no rige: no se adivina.
 */
export declare function rigeHoySegunEstado(c: {
    estadoContrato?: unknown;
    fecha_alta_contrato?: unknown;
    fecha_baja_contrato?: unknown;
}, hoy: string): boolean;
/** El tipo del contrato es indeterminado: por `contrato_id`, y si no, por el nombre exacto del tipo. */
export declare function tipoEsIndeterminado(c: {
    contrato_id?: unknown;
    nombre_contrato?: unknown;
}, porId: Map<string, boolean>, porNombre: Map<string, boolean>): boolean | undefined;
/**
 * LA TRANSICIÓN DIARIA, EN UN SOLO SENTIDO (decisión del usuario): un VIGENTE cuya baja ya pasó pasa a
 * FINALIZADO. Nunca al revés, y nada más: ni SIN_DETERMINAR, ni ANULADO, ni un VIGENTE sin baja (un
 * indeterminado abierto sólo se cierra con una baja). `null` = no cambia. Puro.
 */
export declare function transicionDiaria(c: {
    estadoContrato?: unknown;
    fecha_baja_contrato?: unknown;
}, hoy: string): "FINALIZADO" | null;
