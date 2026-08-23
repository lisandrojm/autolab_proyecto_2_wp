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
 * lo leen para saber a quién pertenece, y los dos leen EXACTAMENTE los campos que acá se marcan como
 * requeridos —el CUIT y las fechas del período— con las expresiones de `utils/anclasNombre.ts`:
 *
 *   - `dropboxSignMailService` → el nombre llega en el asunto de un aviso de Dropbox Sign
 *   - `estadoDropboxCronService` → el nombre llega del listado de una carpeta de Dropbox
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
 * TODOS los tipos tienen que poder leerse de vuelta. Sin excepción.
 *
 * Al principio esto se acotó a "los que van a Dropbox Sign", y estaba mal por los dos lados:
 *
 *  - Pedidos y Vacaciones TAMBIÉN se firman y vuelven;
 *  - la Constancia de CUIT no se firma, pero igual hay que poder levantarla de Dropbox y saber de
 *    quién es — el archivo llega a la carpeta y lo único que lo identifica es su nombre.
 *
 * O sea que la regla no era "se firma", era "el archivo vuelve a entrar al sistema por su nombre", y
 * eso vale para los siete. Lo que cambia entre tipos no es SI hay datos obligatorios, sino CUÁLES:
 * un documento de contrato se ancla con las fechas del período, y un pedido con su número.
 */
export declare const TIPOS_NOMBRE_SE_LEE_DE_VUELTA: TipoNomenclatura[];
export interface VariableNomenclatura {
    variable: string;
    descripcion: string;
    /** Sin esta variable el archivo no se puede reencontrar: el ABM no deja guardar sin ella. */
    requerida?: boolean;
    /**
     * De qué habla la variable. El editor las agrupa por esto, igual que el de Plantillas de Contrato.
     *
     * Doce chips en una sola bolsa se leen como una lista de códigos; agrupados por de dónde sale cada
     * dato —la persona, el período, la empleadora— se leen como las partes de un nombre.
     */
    grupo: string;
}
/** El orden en que se muestran los grupos: sigue el orden de los campos en el nombre. */
export declare const ORDEN_GRUPOS: string[];
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
/**
 * Tope de un nombre de archivo, en BYTES.
 *
 * Son dos límites que caen en el mismo número: Dropbox corta en 255 caracteres y el filesystem del
 * server (ext4) en 255 bytes por componente del path. El que manda es el de bytes, porque siempre es
 * mayor o igual: si el nombre entra en 255 bytes, entra en 255 caracteres.
 *
 * Y la diferencia NO es teórica. Medir en caracteres reventó en producción con
 * `Carlos-Andrés_…`: 255 caracteres, 256 bytes por la tilde, y el `writeFileSync` falló con
 * ENAMETOOLONG antes de poder generar el release.
 */
export declare const MAX_NOMBRE = 255;
/** Lo que ocupa de verdad. `"é"` es UN carácter y DOS bytes, y el filesystem cuenta bytes. */
export declare const largoEnBytes: (s: string) => number;
/**
 * Deja el nombre dentro del tope, midiendo en BYTES.
 *
 * Recorta el campo NO ancla más largo, de a un carácter, hasta que entre. Se hace así y no cortando
 * la cola porque la cola es justamente lo que se agregó para poder leer el nombre —el email y la
 * empleadora rotulados—: tijeretear ahí devolvería el problema que esto viene a resolver. Recortando
 * el más largo, el nombre conserva todos sus bloques y todas sus etiquetas, y lo que se pierde son
 * caracteres del final de los valores más gordos, que es donde menos información hay.
 *
 * `reservar` es lo que el llamador va a pegar después y todavía no está en el string: como mínimo la
 * extensión.
 *
 * Si aun con todo en el piso no entra, avisa y corta la cola. Es el peor caso y no debería pasar
 * nunca; queda como red y no como comportamiento esperado.
 */
export declare function recortarNombre(nombre: string, reservar?: number): string;
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
 * Tope de caracteres por campo, para los que dependen de lo que alguien cargó en su ABM.
 *
 * Por qué un tope FIJO y no solo el recorte de `recortarNombre`: ese recorta el campo más largo
 * cuando el total se pasa, así que el MISMO proyecto podía salir entero en un archivo y cortado en
 * otro, según qué tan largo fuera el resto del nombre. Con un tope por campo, un valor siempre se
 * escribe igual — y el largo total del nombre es predecible antes de generar nada.
 *
 * Los números salen de la distribución real de los 6.780 contratos (`npm run nomenclatura:medir`),
 * elegidos para que corten poco y solo la cola:
 *
 *   proyecto 32 → corta 7,5 %   (el numérico del principio, que es lo que identifica, queda entero)
 *   apellido 20 → corta 0,01 %  (un solo apellido del padrón)
 *   contrato 32 → corta 2,3 %
 *   docName  32 · empresa 24 · extra 24 — no están en los patrones de fábrica, pero se ofrecen
 *
 * LO QUE NO TIENE TOPE, y es una decisión:
 *
 *  - `email`, aunque sea el campo más largo (44). Un email cortado PARECE una dirección y no lo es:
 *    quien lo lea —o la extensión que arme la solicitud de firma— le va a escribir a una dirección
 *    inexistente. Era todo el punto de codificar el "@" como `-ARROBA-`, que se pueda reconstruir.
 *  - `cuit`, `fechaAlta`, `fechaBaja`, `numero`, `empresaCuit`: son lo que los servicios leen para
 *    reencontrar el archivo. Cortarles un dígito no acorta el nombre, lo rompe.
 *  - `tipo`, `fecha`, `anio`, `timestamp`: los define la plataforma y ya son cortos.
 */
export declare const TOPES_CAMPO: Record<string, number>;
/**
 * Aplica el patrón. Devuelve el nombre SIN extensión.
 *
 * Los segmentos vacíos se colapsan: una variable sin valor no puede dejar un "__" en el medio ni un
 * "_" colgando al final. Es el mismo resultado que daba el `parts.filter(...).join("_")` de antes.
 */
export declare function renderNomenclatura(patron: string, datos: Record<string, unknown>): string;
