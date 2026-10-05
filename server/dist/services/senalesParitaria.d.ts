/**
 * SEÑALES DE UN ACUERDO, leídas de su texto plano. NO LEE IMPORTES.
 *
 * La capa 3 va a extraer escalas y aplicarlas: eso es escribir, en un campo que termina en el TXT de
 * alta temprana como retribución pactada. Estas señales son lo que hace que esa capa se pueda
 * construir sin miedo, porque contestan antes las tres preguntas que un número solo no contesta:
 *
 *   1. ¿este acuerdo es de un convenio que usamos?
 *   2. ¿desde cuándo rige?
 *   3. ¿los importes son mensuales, o por jornada?
 *
 * Módulo puro y sin dependencias: se prueba con un string, sin base ni PDF. Lo usan el script de
 * extracción y sus tests.
 *
 * REGLA QUE ATRAVIESA TODO: ninguna señal viaja sin el fragmento del que salió. Una detección sin su
 * origen no se puede verificar sin volver a abrir el PDF, que es exactamente el trabajo que esto
 * viene a evitar.
 */
/** Una señal y el texto donde apareció. El fragmento es lo que hace verificable la detección. */
export interface Senal<T = string> {
    valor: T;
    /** El entorno de la coincidencia, con los espacios colapsados para que entre en un tooltip. */
    fragmento: string;
}
export interface SenalesTexto {
    /** Códigos de CCT normalizados a 4 dígitos ("0131/75"), en orden de aparición y sin repetir. */
    conveniosMencionados: Senal[];
    periodoMencionado: Senal | null;
    expediente: Senal | null;
    /** Presente = el documento dice que sus importes NO son mensuales. Ver `PATRONES_UNIDAD`. */
    unidadSospechosa: Senal | null;
}
/**
 * "131/75" → "0131/75". Los PDF escriben el número sin ceros a la izquierda y el catálogo con ellos.
 *
 * Sin esto, comparar lo mencionado contra lo asignado da siempre «ninguno coincide», que es una
 * respuesta tranquilizadoramente falsa: parecería que ningún acuerdo es nuestro.
 */
export declare const normalizarConvenio: (codigo: string) => string;
export declare const conveniosMencionados: (texto: string) => Senal[];
/**
 * TODOS los períodos que nombra el documento, no el primero.
 *
 * Un acuerdo del SATSAID trae varios: «ACUERDO SALARIAL 2022-2023 (PRIMER TRAMO: OCTUBRE-NOVIEMBRE-
 * DICIEMBRE 2022)» tiene adentro una sección por mes, cada una con su propio «PERIODO OCTUBRE 2022».
 * Quedarse con el primero y compararlo contra el enlace daba «no coinciden» en 7 de 31 publicaciones
 * —todas correctas—, porque el enlace anuncia el rango entero y el PDF encabeza un tramo.
 */
export declare const periodosMencionados: (texto: string) => Senal[];
/** El primero, que es el que se muestra como etiqueta. La comparación usa todos. */
export declare const periodoMencionado: (texto: string) => Senal | null;
export declare const expediente: (texto: string) => Senal | null;
export declare const unidadSospechosa: (texto: string) => Senal | null;
export declare const detectarSenales: (texto: string) => SenalesTexto;
/**
 * Cómo se lleva lo que el acuerdo menciona con lo que la fuente dice alimentar.
 *
 * TRES RESULTADOS, NO DOS, y la diferencia importa:
 *
 *   coinciden   · menciona al menos uno de los convenios de la fuente.
 *   ajeno       · menciona convenios, y NINGUNO es de la fuente. Es el caso del SATSAID: su página
 *                 cuelga acuerdos de 0223/75, que es otro gremio y no usamos. 16 de las 31
 *                 publicaciones de esa fuente son de ese convenio.
 *   sin_mencion · el texto no nombra ningún CCT. NO es lo mismo que ajeno: los tarifarios de la
 *                 Asociación Argentina de Actores son tablas de escala que no citan el número de
 *                 convenio en ninguna parte, y son perfectamente nuestros.
 *
 * Fundir los dos últimos en un «no coincide» convertiría un documento válido en uno sospechoso, y
 * quien mira la pantalla no tendría cómo distinguirlos sin abrir el PDF.
 *
 * NADA DE ESTO DESCARTA UNA PUBLICACIÓN. Es información para quien decide, no una regla para borrar.
 */
export type CotejoConvenios = "coinciden" | "ajeno" | "sin_mencion";
export declare const cotejarConvenios: (mencionados: string[], deLaFuente: string[]) => CotejoConvenios;
/**
 * ¿El período que dice el PDF es el mismo que anuncia el enlace?
 *
 * Los enlaces del SATSAID ya traen el período —«ACUERDO SALARIAL 2025-2026 - PERIODO JULIO - AGOSTO
 * 2025»—, así que compararlo con lo que dice el PDF por dentro es gratis y detecta el caso feo: que
 * el gremio haya colgado bajo un enlace el acuerdo de otro mes. Ahí la vigencia que se cargue sale
 * mal, y ningún importe lo delata.
 *
 * `null` = no hay con qué comparar, que no es lo mismo que «no coinciden».
 */
export declare const coincidePeriodo: (periodosPdf: string[] | string | null | undefined, textoEnlace: string | null | undefined) => boolean | null;
