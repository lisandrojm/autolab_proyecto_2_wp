/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DE QUÉ EMPRESA ES UN CONTRATO Y BAJO QUÉ RÉGIMEN SE LIQUIDA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Las dos preguntas que definen en qué HOJA del archivo de Memosoft cae cada persona (una hoja por
 * empresa × centro de costo × régimen). Están acá, puras y sin Mongo, porque son lo que hay que
 * poder probar sin levantar nada: si esto se equivoca, la plata va a la hoja equivocada.
 *
 * NINGUNA DE LAS DOS ADIVINA. Cuando no puede resolver, devuelve una excepción con el motivo, y esa
 * excepción termina en el anexo para que la resuelva una persona. Un default silencioso acá es una
 * liquidación mal hecha que nadie revisa.
 *
 * ── Lo que se midió antes de escribir esto (producción, 2026-09-20) ──
 *
 * EMPRESA: de 7.462 contratos, 24 tienen `empresaContratoId`. En el resto la empresa está adentro
 * del TEXTO de `nombre_contrato` ("Jornada 2030 SRL", "Servicios - FZERO SRL"). Por eso el orden es
 * campo primero, texto después: el campo es la verdad cuando está, y el texto es de dónde sale el
 * backfill que lo va a completar.
 *
 * RÉGIMEN: `tipo_contrato_id` usa 13 valores distintos en los contratos vigentes, y el catálogo
 * FRAME (`infos` type=contrato) sólo define 8 (ids 1 a 8). 116 de 578 contratos vigentes apuntan a
 * un tipo que no existe. Lo que sí discrimina limpio es `cantidad_jornadas_laborales`: 339
 * contratos en 1 y 175 en 30. Por eso el régimen se resuelve por tipo cuando el tipo se conoce, y
 * por jornadas cuando no —y si los dos hablan y se contradicen, es excepción, no desempate.
 */
/** Lo que cada función necesita del contrato. Un subconjunto, para poder testear sin construir el doc entero. */
export interface ContratoParaLiquidar {
    empresaContratoId?: unknown;
    nombre_contrato?: string | null;
    tipo_contrato_id?: number | null;
    cantidad_jornadas_laborales?: number | null;
    fecha_alta_contrato?: string | Date | null;
    fecha_baja_contrato?: string | Date | null;
}
export interface EmpresaConocida {
    id: string;
    razonSocial: string;
}
export type Regimen = "mensual" | "jornalero";
export type MotivoSinResolver = "empresa_sin_dato" | "empresa_ambigua" | "regimen_sin_dato" | "regimen_contradictorio";
export interface Resuelto<T> {
    valor: T;
    /** De dónde salió. Sirve para saber cuánto confiar y para medir cuánto falta backfillear. */
    origen: "campo" | "nombre_contrato" | "jornadas" | "tipo_contrato";
}
export interface SinResolver {
    valor: null;
    motivo: MotivoSinResolver;
    /** Para el anexo: qué se miró y qué se encontró, en castellano. */
    detalle: string;
}
export type Resolucion<T> = Resuelto<T> | SinResolver;
export declare const resolvio: <T>(r: Resolucion<T>) => r is Resuelto<T>;
/**
 * Saca puntos y espacios de más, pasa a mayúsculas, y pega las siglas sueltas: "S.R.L." y "S R L"
 * quedan los dos en "SRL".
 *
 * NO SACA LA FORMA JURÍDICA. Es parte del nombre, y es lo único que separa a FZERO S.R.L. —la
 * empleadora argentina— de FZERO CORP, que es la entidad de Estados Unidos y no emplea a nadie acá.
 * Sacarla las haría ver iguales, y los 651 centros de costo de la CORP terminarían en las hojas
 * de la SRL.
 */
export declare const normalizarRazonSocial: (texto: string) => string;
/**
 * DE QUÉ EMPRESA ES ESTE CONTRATO.
 *
 * Primero el campo. Si no está, se busca la razón social COMPLETA dentro del nombre del contrato:
 * "2030 SRL" resuelve, "FZERO" suelto no.
 *
 * Y SI HAY OTRA EMPRESA MENCIONADA A MEDIAS, TAMPOCO RESUELVE. Son 57 contratos vigentes llamados
 * "Plazo fijo 5x10 2030 SRL + Release JSA FZERO": la razón social entera que aparece es una sola,
 * pero la otra empresa está ahí, y cuál emplea y cuál recibe el release lo decide RRHH. El backfill
 * los agrupa por nombre para que se decida una vez por cada nombre distinto —son 16—, y no una vez
 * por contrato.
 */
export declare function empresaDelContrato(contrato: ContratoParaLiquidar, empresas: EmpresaConocida[]): Resolucion<string>;
/**
 * BAJO QUÉ RÉGIMEN SE LIQUIDA.
 *
 * Mira las dos señales que existen —el tipo y la cantidad de jornadas— y sólo devuelve algo cuando
 * no se pelean. Si se contradicen, la excepción dice exactamente qué dijo cada una: un contrato
 * "Tiempo Indeterminado" con 1 jornada está mal cargado, y eso se arregla en el contrato, no acá.
 */
export declare function regimenDelContrato(contrato: ContratoParaLiquidar): Resolucion<Regimen>;
/** Una fecha que puede venir como Date o como string, a "AAAA-MM-DD". Vacía = sin fecha. */
export declare const aDia: (f: string | Date | null | undefined) => string;
/**
 * Si el contrato estuvo vigente en algún momento del período.
 *
 * Sin baja = sigue vigente: es lo que significa un contrato de tiempo indeterminado, y también lo
 * que queda cuando nadie cargó la baja todavía. Tratar la falta de baja como "terminado" sacaría de
 * la liquidación justo a los de planta permanente.
 */
export declare function contratoVigenteEn(contrato: ContratoParaLiquidar, desde: string, hasta: string): boolean;
/** El primer y el último día de un período "AAAA-MM", como strings comparables. */
export declare function limitesDelPeriodo(periodo: string): {
    desde: string;
    hasta: string;
};
