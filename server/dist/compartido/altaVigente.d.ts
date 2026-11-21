/**
 * ═══════════════════════════════════════════════════════════════════════
 * ¿UN ALTA DE ARCA QUE YA TIENE OBLIGA A CONTRATAR POR SERVICIOS? (21/11/2026)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Antes: cualquier contrato de ARCA que se cruzara con las fechas dejaba sólo Servicios. Un indeterminado
 * lo justifica, pero una jornada —o un plazo fijo que termina mañana— también trababa darle hoy otra
 * jornada. Ahora decide la MODALIDAD DE LIQUIDACIÓN del alta que ya tiene, y la empleadora:
 *
 *   Alta existente que se cruza          misma empleadora (CUIT)        otra empleadora
 *   ─────────────────────────────────    ───────────────────────────    ──────────────────
 *   MENSUAL (liquidación ≠ 8, o sin dato) sólo Servicios                 sólo Servicios
 *   JORNAL  (liquidación 8)               no otra alta esos días (*)     se puede (pluriempleo)
 *
 *   (*) ARCA admite UNA alta activa por persona y empleadora: con esa empresa, Servicios, otras fechas u
 *       otra empleadora.
 *
 * La modalidad de contrato no sirve para distinguir: la Jornada usa 022 (tiempo completo determinado),
 * la misma que un plazo fijo mensual. Lo que cambia es que se liquida por jornal.
 *
 * El dato del alta existente sale, en este orden, de la relación en ARCA (el espejo de Relaciones
 * Laborales: es la verdad) y del tipo de contrato (su código, con la cascada). Sin dato, MENSUAL: el lado
 * prudente, que es la regla de antes.
 *
 * Puro: las fechas ya vienen filtradas (lo que se cruza lo decide `contratoEnLasFechas`).
 */
export type Liquidacion = "jornal" | "mensual";
/** Código de ARCA de la modalidad de liquidación «Jornal» (posición 73 del registro de alta). */
export declare const CODIGO_LIQUIDACION_JORNAL = "8";
/** Del código del tipo de contrato (ya resuelto con la cascada). Sin código, `null`: no se sabe. */
export declare function liquidacionDeCodigo(codigo: unknown): Liquidacion | null;
/** Del texto del espejo de ARCA («MES», «JORNAL», «8 - Jornal»…). Vacío, `null`. */
export declare function liquidacionDeTextoArca(texto: unknown): Liquidacion | null;
/** ARCA primero; si no, el tipo; si ninguno dice nada, mensual. */
export declare function liquidacionDelAlta(deArca: unknown, delTipo: unknown): {
    liquidacion: Liquidacion;
    origen: "arca" | "tipo" | "sin_dato";
};
export interface AltaExistente {
    proyectoNombre: string;
    /** "YYYY-MM-DD" */
    desde: string;
    /** "YYYY-MM-DD"; vacío = sin baja. */
    hasta: string;
    /** La empresa del contrato (`empresaContratoId`). */
    empresaId?: string;
    empresaNombre?: string;
    liquidacion: Liquidacion;
    /** El tipo de contrato («Tiempo Indeterminado», «Jornada»…). */
    nombreContrato?: string;
    /** La modalidad de contrato de ARCA, como la dice ARCA o el código del tipo con su nombre. */
    modalidadContrato?: string;
    /** La modalidad de liquidación, ídem («MES», «1 - Mensual»…). */
    liquidacionTexto?: string;
    /** `hasta` es la baja según ARCA. */
    bajaSegunArca?: unknown;
}
export interface DecisionAltaVigente<T extends AltaExistente = AltaExistente> {
    /** Un alta mensual en esas fechas: sólo tipos de Servicios. */
    soloServicios: T | null;
    /** Un alta por jornada CON LA MISMA EMPRESA en esas fechas: no otra alta de ARCA con esa empresa. */
    mismaEmpleadora: T | null;
}
/**
 * Qué impide un alta de ARCA nueva, dadas las altas de ARCA que ya tiene EN ESAS FECHAS. `empresaId`: la
 * empresa del contrato nuevo; sin ella no se puede saber si es la misma empleadora y esa parte no frena
 * (la vuelve a mirar quien la sepa: la aprobación).
 */
export declare function decidirAltaVigente<T extends AltaExistente>(altasEnFechas: T[], empresaId?: string | null): DecisionAltaVigente<T>;
type Detalle = Pick<AltaExistente, "proyectoNombre" | "desde" | "hasta" | "bajaSegunArca" | "empresaNombre" | "nombreContrato" | "modalidadContrato" | "liquidacionTexto">;
/**
 * QUÉ ALTA ES, CON NOMBRE Y APELLIDO (pedido del 21/11/2026): el tipo de contrato, la empresa, el proyecto
 * y el período, y entre paréntesis la modalidad de contrato y la de liquidación de ARCA. «Tiene un contrato
 * mensual» solo no alcanzaba para entender por qué quedaba sólo Servicios.
 */
export declare function detalleDelAlta(a: Detalle): string;
/** El mensaje de «sólo Servicios», igual en el formulario y en el rechazo del server. */
export declare function mensajeSoloServicios(a: Detalle): string;
/** El mensaje de «misma empleadora». */
export declare function mensajeMismaEmpleadora(a: Detalle): string;
/** El aviso cuando todavía no hay fechas (el puesto de un equipo): no recorta, avisa qué va a pasar. */
export declare function avisoSinFechas(a: Detalle & Pick<AltaExistente, "liquidacion">): string;
export {};
