/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL ARCHIVO REAL DE AGOSTO 2026, como se le entregó a Memosoft
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Es la única fuente de verdad que existe sobre qué tiene que producir el motor. Todo lo demás
 * —la tabla de conceptos, el mapeo, las reglas— son descripciones de esto.
 *
 * ── Qué está transcripto y qué no ──
 *
 * El PDF imprime las hojas con `d8par1` y `d8par2` en páginas SEPARADAS para las dos primeras, así
 * que ahí no se puede aparear fila con valor sin adivinar. Por eso están completas sólo las hojas
 * donde las dos columnas van en la misma línea, que son las de JORNALEROS —las que se comparan
 * directo contra el 0000 que emite el motor— más el censo de conceptos de todo el archivo.
 *
 * Transcribir a mano las 745 filas a ojo sería meter errores de tipeo en el patrón de oro. Lo que
 * está acá es lo que se puede leer sin ambigüedad.
 */
export interface FilaReal {
    legajo: string;
    nombre: string;
    concepto: string;
    /** Días u horas. En los jornaleros el jornal va en par2. */
    par1: number;
    par2: number;
}
/**
 * LAS DOS HOJAS DE JORNALEROS, completas.
 *
 * Cada persona tiene exactamente dos filas: 0000 Jornal con los días en par2, y 0501 S.A.C.
 * Proporcional con EL MISMO número en par1. Esa igualdad se repite en las 72 personas sin una sola
 * excepción, así que el S.A.C. proporcional de un jornalero es derivable de sus días.
 */
export declare const JORNALEROS_AGOSTO: {
    legajo: string;
    nombre: string;
    dias: number;
}[];
/**
 * QUÉ CONCEPTOS APARECEN EN EL ARCHIVO REAL, contados sobre las 745 filas.
 *
 * Es el censo, no el detalle: sirve para ver de una qué emite el archivo y qué no, que es la
 * pregunta que más rápido muestra dónde está parado el motor.
 */
export declare const CENSO_DE_CONCEPTOS: {
    codigo: string;
    descripcion: string;
    nota: string;
}[];
/**
 * LOS CONCEPTOS QUE EL ARCHIVO REAL **NO** TIENE, y que conviene tener presentes:
 * 0012 Licencia por Enfermedad, 0010 Inasistencia, 0013, 0020, 0029, 0030, 0040, 0041, 0042,
 * 0043, 0080, 0081, 0500, 0604, 0701, 0008, 0009.
 */
export declare const CONCEPTOS_AUSENTES: string[];
