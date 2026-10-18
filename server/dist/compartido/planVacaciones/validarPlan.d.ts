/**
 * LAS REGLAS DEL PLAN, puras: reciben el plan y un contexto ya resuelto (saldos, vacaciones existentes,
 * configuración, equipo) y devuelven avisos. No consultan nada: lo que hace falta de la base lo arma el
 * server antes (`services/vacaciones/planVacaciones.ts`) y la pantalla puede reusar la función con lo
 * que ya tiene cargado para avisar antes de guardar.
 *
 * `error` frena el envío al coordinador; `aviso` se muestra y se deja decidir.
 */
export type NivelDeAviso = "error" | "aviso";
export type CodigoDeAviso = "fuera_de_ventana" | "supera_tope" | "supera_saldo" | "se_pisa_consigo" | "persona_fuera_del_equipo" | "vacacion_existente" | "en_otro_plan" | "fraccion_minima" | "fraccionamiento_no_permitido" | "contrato_vence_antes" | "solapamiento_regla";
export interface Aviso {
    nivel: NivelDeAviso;
    codigo: CodigoDeAviso;
    itemId?: string;
    userId?: string;
    mensaje: string;
}
export interface ItemParaValidar {
    id: string;
    userId: string;
    desde: string;
    hasta: string;
    dias: number;
    estado: string;
}
export interface PlanParaValidar {
    ventanaDesde: string;
    ventanaHasta: string;
    topeDiasPorPersona: number;
    items: ItemParaValidar[];
}
export interface ContextoDeValidacion {
    /** Días disponibles de cada persona en el período del plan (de `saldosDeVacaciones`). */
    disponiblesDe: Record<string, number>;
    nombreDe?: Record<string, string>;
    /** Vacaciones que ya existen (pedidas por la app o de otro plan ya aprobado), no rechazadas ni canceladas. */
    vacacionesExistentes?: Record<string, Array<{
        desde: string;
        hasta: string;
        estado: string;
    }>>;
    /** Bloques de OTROS planes todavía no aprobados. */
    itemsDeOtrosPlanes?: Record<string, Array<{
        desde: string;
        hasta: string;
        plan: string;
    }>>;
    config?: {
        permiteFraccionadas: boolean;
        minDiasFraccion: number;
    };
    /** Hasta cuándo rige el contrato de cada persona ("YYYY-MM-DD"; vacío o ausente = indeterminado). */
    contratoVenceEl?: Record<string, string>;
    /** Quiénes están hoy en el equipo del proyecto; un ítem de alguien que ya no está es un error. */
    personasDelEquipo?: string[];
    /** Por ítem, el mensaje de la regla de solapamiento que viola (lo resuelve el server). */
    solapamientos?: Record<string, string>;
}
export declare function validarPlan(plan: PlanParaValidar, ctx: ContextoDeValidacion): Aviso[];
export declare const hayErrores: (avisos: Aviso[]) => boolean;
