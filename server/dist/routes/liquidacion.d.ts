/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LIQUIDACIÓN — fase 0: el padrón y el catálogo de conceptos
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Todavía no calcula un solo concepto. Lo que contesta es la pregunta previa: para este período,
 * quién entra, con qué legajo, en qué empresa, en qué centro de costo y bajo qué régimen —y qué
 * queda sin resolver.
 *
 * Pide `admin_contracts:view` porque de eso habla: son contratos, empresas y sueldos. Que el
 * permiso sea el mismo que el de Gestión de Contratos no es pereza, es que quien puede ver un
 * contrato puede ver de qué empresa es.
 */
export declare const liquidacionRouter: import("express-serve-static-core").Router;
