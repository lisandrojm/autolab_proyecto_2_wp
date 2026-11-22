/**
 * ¿HAY UNA RELACIÓN EN ARCA SOBRE LA CUAL OPERAR? (22/11/2026, pedido del usuario). La condición que decide si
 * un contrato puede ir a Relaciones Laborales → Modificaciones y Bajas (baja, modificación o anulación). La
 * usan los dos lados, así nunca dicen cosas distintas:
 *   · el panel (`services/arca/reglasOperacionRelacion.ts`), antes de mirar la operación pedida;
 *   · la bandeja Contratos (`contracts-overview` → `relacionArca`), para mostrar o no el ícono y para el filtro
 *     «Con relación para operar».
 *
 * La relación existe si el alta está presentada (desde WeProdu, hallada al verificar o adoptada) o si el
 * espejo de Relaciones Laborales tiene una con la MISMA empleadora, el mismo CUIL y la misma fecha de inicio.
 * Lo segundo cubre las altas hechas a mano en ARCA que no se adoptaron: no salieron de WeProdu, pero están.
 *
 * Pura: el espejo lo resuelve quien llama (`enEspejo`).
 */
export const TRAMITE_ALTA_ARCA = "alta_temprana_afip";
const dig = (s) => String(s ?? "").replace(/\D/g, "");
const esISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
export function relacionParaOperar(c) {
    const no = (motivo) => ({ puede: false, motivo, via: null });
    if (c.tramite !== undefined && c.tramite !== TRAMITE_ALTA_ARCA)
        return no("Este contrato no es de trámite ARCA (alta temprana): no tiene una relación en ARCA sobre la cual operar.");
    if (c.estadoContrato === "ANULADO")
        return no("El contrato está anulado en WeProdu.");
    if (dig(c.cuil).length !== 11)
        return no("La persona no tiene un CUIL de 11 dígitos.");
    if (dig(c.empresaCuit).length !== 11)
        return no("La empleadora del contrato no tiene CUIT: sin eso no se puede elegir en ARCA.");
    if (!esISO(c.alta))
        return no("El contrato no tiene una fecha de alta válida.");
    const a = c.altaArcaPresentada;
    const r = String(a?.resultado || "");
    if (r === "presentando" || r === "indeterminado")
        return no("El alta de este contrato está sin confirmar en ARCA: primero resolvé eso (mirala en Relaciones Laborales → Consultas).");
    if (r === "anulada")
        return no("El alta de este contrato fue anulada en ARCA: ya no hay relación sobre la que operar.");
    if (r === "presentada")
        return { puede: true, motivo: "", via: a?.via === "externa" ? "adoptada" : a?.via === "verificacion" ? "verificacion" : "weprodu" };
    if (c.enEspejo)
        return { puede: true, motivo: "", via: "espejo" };
    return no("Este contrato no tiene el alta presentada en ARCA ni figura en las Relaciones Laborales sincronizadas: no hay relación sobre la cual operar.");
}
