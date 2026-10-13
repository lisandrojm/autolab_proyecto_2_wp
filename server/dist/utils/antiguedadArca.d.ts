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
 * `empleadoraCuit: null`). Si la persona tiene una sola empleadora, la global es igual a la de ella
 * y se guarda también: la pantalla lee siempre la global para el total.
 */
export declare function antiguedadesDe(relaciones: RelacionParaAntiguedad[], hoy: string): Array<{
    empleadoraCuit: string | null;
    metricas: MetricasAntiguedad;
}>;
