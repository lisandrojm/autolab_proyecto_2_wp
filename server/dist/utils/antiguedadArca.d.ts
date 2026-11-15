/**
 * LA ANTIGÜEDAD DE UNA PERSONA A PARTIR DE SUS RELACIONES LABORALES EN ARCA. Cálculo puro: recibe
 * las relaciones de UN CUIL (de una empleadora o de todas) y «hoy», y devuelve las métricas que se
 * guardan en `AntiguedadArca`. Sin Mongo, sin reloj: todo entra por parámetro.
 *
 * Se devuelven LAS DOS medidas porque las dos se usan:
 *  - `antiguedadDesdePrimeraAlta`: días corridos entre la primera alta y hoy, con huecos y todo.
 *  - `diasTrabajados`: los días de cada relación (fin − inicio + 1), FUSIONANDO las que se solapan
 *    para no contar un día dos veces. Una relación abierta cuenta hasta hoy; una que termina después
 *    de hoy, también hasta hoy (lo que falta no se trabajó todavía).
 *
 * Fechas como "YYYY-MM-DD"; los días se cuentan en UTC para que ningún cambio de hora reste uno.
 */
export interface RelacionParaAntiguedad {
    /** 11 dígitos. */
    empleadoraCuit: string;
    /** ISO YYYY-MM-DD. */
    fechaInicio: string;
    /** ISO, o `null` si sigue abierta. */
    fechaFin: string | null;
    apellidoNombre?: string;
}
export interface MetricasAntiguedad {
    apellidoNombre: string;
    primeraAlta: string;
    /** La mayor fecha de fin; si hay una relación abierta, hoy. */
    ultimaFecha: string;
    antiguedadDesdePrimeraAlta: {
        dias: number;
        anios: number;
    };
    diasTrabajados: number;
    aniosTrabajados: number;
    cantidadContratos: number;
    tieneRelacionAbierta: boolean;
    /** Los CUIT que aportan, ordenados. */
    empresas: string[];
}
export interface Tramo {
    desde: string;
    hasta: string;
}
/** Días corridos de `a` a `b` (b − a). Negativo si `b` es anterior. */
export declare const diasEntre: (a: string, b: string) => number;
/** Años con dos decimales, a 365,25 días el año. */
export declare const aniosDe: (dias: number) => number;
/**
 * Une los tramos que se tocan o se solapan. Dos relaciones 10→20 y 15→25 son un solo tramo 10→25;
 * 10→20 y 21→25 también (son días consecutivos). 10→20 y 22→25 quedan como dos.
 */
export declare function fusionarTramos(tramos: Tramo[]): Tramo[];
/** Días de un tramo, inclusive de las dos puntas (10→10 es un día). */
export declare const diasDeTramo: (t: Tramo) => number;
/**
 * El tramo efectivamente trabajado de una relación al día de hoy: hasta el fin, o hasta hoy si está
 * abierta o si el fin es futuro. `null` si todavía no empezó.
 */
export declare function tramoTrabajado(r: RelacionParaAntiguedad, hoy: string): Tramo | null;
/** Las métricas de un CUIL. `null` si no hay relaciones. */
export declare function antiguedadDe(relaciones: RelacionParaAntiguedad[], hoy: string): MetricasAntiguedad | null;
/**
 * Las filas que van a `AntiguedadArca` para un CUIL: una por empleadora y la global (todas juntas,
 * `empleadoraCuit: null`). Si la persona tiene una sola empleadora, la global es igual a la de ella.
 * Desde el 15/11/2026 la global queda para auditar: las vacaciones toman la antigüedad de UNA
 * empleadora (`empresaDeComputo`), no la suma de todas.
 */
export declare function antiguedadesDe(relaciones: RelacionParaAntiguedad[], hoy: string): Array<{
    empleadoraCuit: string | null;
    metricas: MetricasAntiguedad;
}>;
/** Lo mínimo de cada empleadora para elegir: sale de las filas de `AntiguedadArca` o de los contratos de WeProdu. */
export interface FilaEmpresaParaComputo {
    /** CUIT de 11 dígitos (o el id de la empresa si no tiene CUIT cargado). */
    empleadoraCuit: string;
    tieneRelacionAbierta: boolean;
    /** ISO YYYY-MM-DD: el último día de la relación (hoy si está abierta). */
    ultimaFecha: string;
    /** ISO YYYY-MM-DD: la primera alta con esa empleadora. */
    primeraAlta: string;
}
/** Fecha guardada (Date o string) a "YYYY-MM-DD"; "" si no hay. */
export declare const isoDia: (v: unknown) => string;
/** La empleadora vigente (ver la regla arriba). `null` si no hay filas. */
export declare function empresaVigenteDe<T extends FilaEmpresaParaComputo>(filas: T[], hoy: string): T | null;
export type ModoComputoAntiguedad = "empresaVigente" | "precedenciaManual";
export type MotivoEmpresaComputo = "vigente" | "unica" | "precedencia";
/**
 * La empleadora cuya antigüedad cuenta y por qué. `precedencia`: CUITs en orden, la primera presente
 * gana (sólo en modo manual). Una sola empleadora es «unica» sea cual sea el modo.
 */
export declare function empresaDeComputo<T extends FilaEmpresaParaComputo>(filas: T[], hoy: string, config?: {
    modo?: ModoComputoAntiguedad;
    precedencia?: string[];
}): {
    fila: T;
    motivo: MotivoEmpresaComputo;
} | null;
