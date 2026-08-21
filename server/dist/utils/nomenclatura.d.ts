/**
 * Nomenclatura de los archivos que genera la plataforma.
 *
 * Un patrón con `{{variables}}` por tipo de documento, configurable por tenant. Misma idea que las
 * Plantillas de PDF —lista de variables por tipo, se insertan con un click— pero para el NOMBRE del
 * archivo en vez de su contenido.
 *
 * ⚠ POR QUÉ ESTO NO ES COSMÉTICO
 *
 * El nombre se PARSEA DE VUELTA. Cuando un documento firmado regresa de Dropbox Sign, dos servicios
 * lo leen para saber a quién pertenece:
 *
 *   - `dropboxSignMailService.extraerIdentidadDeArchivo()` → `_CUIL-\d{11}` y `_(DNI|CI|…)-\w+`
 *   - `estadoDropboxCronService.extraerFechasDeNombre()`   → tokens sueltos de 8 dígitos (YYYYMMDD)
 *
 * Un patrón sin esos bloques hace que los documentos vuelvan de la firma y **no se puedan asociar a
 * ninguna persona**. Y falla en silencio: el archivo se genera igual, se firma igual, y recién se
 * descubre cuando alguien busca un contrato que "se perdió".
 *
 * Por eso `validarPatron()` NO deja guardar un patrón al que le falten esos bloques en los tipos que
 * viajan a la firma. Es la única validación de este archivo que no se puede relajar.
 */
/** Los tipos de documento que la plataforma nombra. El orden es el que se muestra en el ABM. */
export declare const TIPOS_NOMENCLATURA: readonly ["Contrato", "Release", "AltaAFIP", "ConstanciaCUIT", "Documentacion", "Pedido", "Vacacion"];
export type TipoNomenclatura = (typeof TIPOS_NOMENCLATURA)[number];
/**
 * Los que van a Dropbox Sign y vuelven. En estos, el bloque de identidad y las fechas son
 * OBLIGATORIOS: son las dos cosas que el parseo de vuelta necesita para reencontrar a la persona y
 * al contrato.
 */
export declare const TIPOS_QUE_VUELVEN_DE_LA_FIRMA: TipoNomenclatura[];
export interface VariableNomenclatura {
    variable: string;
    descripcion: string;
    /** Sin esta variable el archivo no se puede reencontrar: el ABM no deja guardar sin ella. */
    requerida?: boolean;
}
/**
 * Qué variables ofrece cada tipo, y cuáles son obligatorias.
 *
 * Ofrecer solo las que ese documento realmente tiene evita el peor resultado posible: un patrón que
 * se ve bien en el ABM y renderiza vacío en producción. Un contrato no tiene `{{numero}}` y un
 * pedido no tiene `{{fechaAlta}}`.
 */
export declare const VARIABLES_POR_TIPO: Record<TipoNomenclatura, VariableNomenclatura[]>;
/**
 * Lo que se usa cuando el tenant no configuró nada.
 *
 * Son EXACTAMENTE los nombres que la plataforma generaba antes de que esto existiera, expresados
 * como patrón. Que el default reproduzca el comportamiento anterior es lo que permite soltar esta
 * función sin migrar nada ni renombrar un solo archivo ya generado.
 */
export declare const PATRON_POR_DEFECTO: Record<TipoNomenclatura, string>;
/**
 * Un valor listo para ir adentro de un nombre de archivo.
 *
 * El "_" es el separador de CAMPOS del nombre, así que los espacios internos de cada valor van como
 * "-". Cuando convivían los dos, el nombre en disco no coincidía con el nombre lógico guardado en la
 * base, y el matching de vuelta fallaba sin motivo aparente.
 */
export declare const campoNomenclatura: (v: unknown) => string;
/**
 * Variables cuyo valor YA viene armado y no se vuelve a normalizar.
 *
 * `identidad` es un BLOQUE de dos campos —`CUIL-…_DNI-…`— y ese "_" del medio es estructural: el
 * parseo de vuelta (`/_(DNI|CI|…)-(\w+)/`) lo exige. Pasarlo por la normalización lo convertía en
 * "-", el nombre quedaba `CUIL-20331501027-DNI-33150102`, y el documento firmado volvía sin poder
 * identificar el documento de la persona. Se veía perfecto y estaba roto.
 */
export declare const VARIABLES_COMPUESTAS: Set<string>;
/** Las variables que un patrón menciona, en orden y sin repetir. */
export declare const variablesUsadas: (patron: string) => string[];
export interface ErrorPatron {
    campo: "patron";
    motivo: string;
}
/**
 * ¿Se puede guardar este patrón?
 *
 * Tres cosas, en orden de gravedad:
 *
 *  1. las variables OBLIGATORIAS están (sin ellas el archivo no se reencuentra al volver de la firma);
 *  2. no hay variables inventadas (renderizarían vacío en producción, y el ABM se vería bien);
 *  3. queda algo además de separadores (un patrón que rinde "" produce archivos sin nombre).
 */
export declare function validarPatron(tipo: TipoNomenclatura, patron: string): ErrorPatron[];
/**
 * Aplica el patrón. Devuelve el nombre SIN extensión.
 *
 * Los segmentos vacíos se colapsan: una variable sin valor no puede dejar un "__" en el medio ni un
 * "_" colgando al final. Es el mismo resultado que daba el `parts.filter(...).join("_")` de antes.
 */
export declare function renderNomenclatura(patron: string, datos: Record<string, unknown>): string;
