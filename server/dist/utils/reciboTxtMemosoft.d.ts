/**
 * LECTURA DEL TXT DE RECIBOS DE MEMOSOFT (módulo Recibos de sueldo, pedido del 21/10/2026).
 *
 * MEMOSOFT exporta, junto con la sábana PDF, un TXT con los mismos recibos en texto de ancho fijo: un
 * bloque por hoja («ORIGINAL» y después «COPIA» de cada persona), en el mismo orden que las páginas del
 * PDF. El PDF dibuja los datos como trazos (hay que pasarlo por OCR, con errores); el TXT los trae
 * tal cual. Por eso, cuando se sube el TXT, los datos salen de acá y el PDF sólo se parte por páginas:
 * el bloque N del TXT es la página N del PDF.
 *
 * Viene en Latin-1 con fin de línea CRLF. Los valores se ubican por los rótulos del formato (la línea
 * de datos va debajo de la de rótulos), no por número de línea, y lo que no se encuentra queda vacío.
 *
 * Puro, sin base ni archivos: se testea con texto.
 */
export interface ConceptoRecibo {
    codigo: string;
    concepto: string;
    unidad: string;
    monto: string;
    /** La sección del recibo: «CONTRIBUCIONES EMPRESA», «REMUNERATIVO», «DESCUENTOS», etc. */
    seccion: string;
}
export interface DatosReciboTxt {
    cuil: string;
    empleadorCuit: string;
    empresa: string;
    /** «APELLIDO, Nombres», con los espacios de más colapsados. */
    nombre: string;
    legajo: string;
    basico: string;
    /** «dd/mm/aaaa», o "" si el recibo la trae vacía («  /  /»). */
    ingreso: string;
    antiguedad: string;
    sector: string;
    modalidad: string;
    categoria: string;
    tarea: string;
    periodoDeposito: string;
    fechaDeposito: string;
    bancoDeposito: string;
    /** "YYYY-MM" del período liquidado. */
    periodo: string;
    periodoTexto: string;
    costoTotal: string;
    contribucionesEmpleador: string;
    sueldoBruto: string;
    remunerativo: string;
    noRemunerativo: string;
    descuentos: string;
    sueldoNeto: string;
    otros: string;
    /** Neto a cobrar. */
    neto: string;
    formaPago: string;
    fechaPago: string;
    numeroRecibo: string;
    conceptos: ConceptoRecibo[];
    cuitsEncontrados: string[];
}
export interface BloqueTxt {
    /** «ORIGINAL» o «COPIA». */
    tipo: string;
    texto: string;
}
/** El contenido del archivo como texto: Latin-1 (lo que exporta MEMOSOFT); si fuera UTF-8 válido, como UTF-8. */
export declare function decodificarTxt(buffer: Buffer): string;
/** Los bloques del TXT, uno por hoja, en orden. */
export declare function bloquesDelTxt(contenido: string): BloqueTxt[];
/**
 * Los recibos: cada «ORIGINAL» abre uno y las hojas que siguen (la «COPIA») se le suman. Devuelve los
 * índices de bloque (base 0), que son los índices de página del PDF.
 */
export declare function agruparBloques(bloques: BloqueTxt[]): number[][];
/** Los datos de un recibo a partir de su bloque «ORIGINAL» (la copia repite lo mismo). */
export declare function leerBloque(texto: string): DatosReciboTxt;
/** Todo el TXT: un recibo por persona, con sus hojas (índices base 0) y lo leído de su «ORIGINAL». */
export declare function leerTxtDeRecibos(contenido: string): {
    bloques: BloqueTxt[];
    recibos: Array<{
        hojas: number[];
        texto: string;
        datos: DatosReciboTxt;
    }>;
};
