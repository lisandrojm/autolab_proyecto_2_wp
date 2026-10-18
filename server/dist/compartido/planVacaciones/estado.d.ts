/**
 * LOS ESTADOS DEL PLAN Y DE SUS BLOQUES (pedido del 18/10/2026: «las vacaciones las tiene que aprobar
 * el coordinador del proyecto antes de que se convierta en un pedido real»).
 *
 *   Bloque: propuesto → enviado → aprobado | rechazado  (+ cancelado)
 *     · `propuesto`: lo armó el planificador; se puede mover, borrar, re-repartir.
 *     · `enviado`: está en manos del coordinador; ya no se toca.
 *     · `aprobado`: existe la `Vacation` (pre-aprobada) y sigue el circuito de siempre.
 *     · `rechazado`: vuelve al planificador con el motivo; se re-arma y se reenvía.
 *     · `cancelado`: se dio de baja (si tenía `Vacation`, se canceló también).
 *   Plan: se DERIVA de sus bloques; se guarda para listar e indexar, nunca se edita a mano.
 */
export type EstadoItem = "propuesto" | "enviado" | "aprobado" | "rechazado" | "cancelado";
export type EstadoPlan = "borrador" | "enviado" | "parcial" | "cerrado" | "cancelado";
export declare const ESTADOS_ITEM: EstadoItem[];
export declare const ESTADOS_PLAN: EstadoPlan[];
/** El estado del plan según sus bloques (un plan cancelado se queda cancelado: eso lo decide quien lo cancela). */
export declare function estadoDerivado(items: Array<{
    estado: EstadoItem | string;
}>): Exclude<EstadoPlan, "cancelado">;
/** Los bloques que el planificador todavía puede tocar. */
export declare const esEditable: (estado: EstadoItem | string) => boolean;
export declare const TEXTO_ESTADO_ITEM: Record<EstadoItem, string>;
export declare const TEXTO_ESTADO_PLAN: Record<EstadoPlan, string>;
