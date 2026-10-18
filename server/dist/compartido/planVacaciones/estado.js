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
export const ESTADOS_ITEM = ["propuesto", "enviado", "aprobado", "rechazado", "cancelado"];
export const ESTADOS_PLAN = ["borrador", "enviado", "parcial", "cerrado", "cancelado"];
/** El estado del plan según sus bloques (un plan cancelado se queda cancelado: eso lo decide quien lo cancela). */
export function estadoDerivado(items) {
    const vivos = items.filter((i) => i.estado !== "cancelado");
    const n = (e) => vivos.filter((i) => i.estado === e).length;
    const aprobados = n("aprobado");
    const enviados = n("enviado");
    const propuestos = n("propuesto");
    const rechazados = n("rechazado");
    if (vivos.length === 0 || (aprobados === 0 && enviados === 0 && rechazados === 0))
        return "borrador";
    if (aprobados > 0 && enviados === 0 && propuestos === 0 && rechazados === 0)
        return "cerrado";
    if (aprobados > 0)
        return "parcial";
    if (enviados > 0)
        return "enviado";
    // sólo rechazados (y quizás propuestos): volvió al planificador
    return "borrador";
}
/** Los bloques que el planificador todavía puede tocar. */
export const esEditable = (estado) => estado === "propuesto" || estado === "rechazado";
export const TEXTO_ESTADO_ITEM = {
    propuesto: "Propuesto",
    enviado: "Esperando al coordinador",
    aprobado: "Aprobado",
    rechazado: "Rechazado",
    cancelado: "Cancelado",
};
export const TEXTO_ESTADO_PLAN = {
    borrador: "Borrador",
    enviado: "Enviado al coordinador",
    parcial: "Aprobado en parte",
    cerrado: "Cerrado",
    cancelado: "Cancelado",
};
