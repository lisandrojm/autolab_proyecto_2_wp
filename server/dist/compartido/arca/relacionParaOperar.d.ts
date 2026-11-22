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
export declare const TRAMITE_ALTA_ARCA = "alta_temprana_afip";
export interface ContratoParaRelacion {
    /**
     * El trámite del tipo de contrato (`alta_temprana_afip`, `constancia_cuit`…). `undefined` = quien llama no
     * lo resolvió y no se mira; `null` u otro valor = no es de ARCA.
     */
    tramite?: string | null;
    estadoContrato?: string | null;
    cuil: string;
    empresaCuit: string;
    /** "YYYY-MM-DD" */
    alta: string;
    altaArcaPresentada?: {
        resultado?: string;
        via?: string;
    } | null;
    /** El espejo tiene la relación con esa empleadora, ese CUIL y esa fecha de inicio exacta. */
    enEspejo: boolean;
}
/** Por dónde se sabe que la relación existe. */
export type ViaRelacion = "weprodu" | "verificacion" | "adoptada" | "espejo";
export interface RelacionParaOperar {
    puede: boolean;
    /** Por qué no ("" si puede). */
    motivo: string;
    via: ViaRelacion | null;
}
export declare function relacionParaOperar(c: ContratoParaRelacion): RelacionParaOperar;
