export type TipoColumna = "texto" | "fecha" | "hora" | "numero" | "entero";
export interface ColumnaHoja {
    titulo: string;
    /** Por defecto, texto. */
    tipo?: TipoColumna;
    /** Ancho en caracteres. */
    ancho?: number;
}
export interface HojaXlsx {
    /** Hasta 31 caracteres (límite de Excel). */
    nombre: string;
    columnas: ColumnaHoja[];
    /** Una celda por columna; `null` o «» = celda vacía. Fechas «AAAA-MM-DD», horas «HH:mm». */
    filas: (string | number | null)[][];
    /** Hoja de datos: encabezados en la fila 1, autofiltro y primera fila congelada. Si no, texto libre. */
    tabla?: boolean;
    /** Índices (base 0, sobre `filas`) de las filas que van resaltadas enteras: «a esta persona le faltan datos». */
    filasResaltadas?: number[];
    /** Para una tabla sin filas: lo que dice la hoja en vez de quedar en blanco. */
    vacioDice?: string;
}
export declare function xlsxDesdeHojas(hojas: HojaXlsx[]): Promise<Buffer>;
