/**
 * Lo que se puede volver a LEER del nombre de un archivo: sus ANCLAS.
 *
 * Un ancla es un campo que la nomenclatura marca como OBLIGATORIO —`{{cuit}}`, `{{fechaAlta}}`,
 * `{{fechaBaja}}`— y que se puede reconocer dentro del nombre sin saber en qué posición quedó. Son
 * los únicos datos con los que los dos circuitos de vuelta pueden decidir a qué documento se refiere
 * un archivo:
 *
 *   - `dropboxSignMailService`  → el nombre viene en el ASUNTO de un aviso de Dropbox Sign
 *   - `estadoDropboxCronService` → el nombre viene del listado de una carpeta de Dropbox
 *
 * POR QUÉ ESTO VIVE EN UN SOLO ARCHIVO
 *
 * Antes cada servicio traía su propia copia de las expresiones, y el test de nomenclatura una
 * tercera. Tres copias de la misma regla es una forma lenta de que se separen: cambiar el patrón por
 * defecto arreglaba un servicio y dejaba al otro leyendo un formato que ya no se emite. De hecho
 * pasó — el `CUIL-` etiquetado quedó como camino principal en el servicio de correo mucho después de
 * que la nomenclatura dejara de escribirlo.
 *
 * QUÉ SE PUEDE LEER Y QUÉ NO
 *
 *   20331501027   el CUIT/CUIL de la persona: once dígitos aislados, sin etiqueta. Es el PRIMERO del
 *                 nombre, y eso lo garantiza `validarPatron`, que no deja poner `{{empresaCuit}}`
 *                 antes que `{{cuit}}`.
 *   CUIL-2033…    la forma vieja, etiquetada. Ya no se emite; se sigue leyendo por los archivos que
 *                 quedaron en las carpetas de antes del cambio.
 *   DNI-33150102  el documento, cuando la persona no tiene CUIL (39 en producción). Va etiquetado
 *                 porque un documento suelto no se distingue de cualquier otro número.
 *   20260810      las fechas del período, YYYYMMDD. Se excluyen las que vengan pegadas a una
 *                 etiqueta de documento: un DNI de ocho dígitos parece una fecha válida.
 *
 * `{{numero}}` (obligatorio en Pedidos y Vacaciones) NO se puede leer: en el patrón por defecto va
 * pelado —`{{tipo}}_{{numero}}_{{fecha}}`— y un número sin etiqueta no se distingue del id de
 * proyecto ni de ningún otro. Hoy no hace falta, porque ninguno de los dos circuitos procesa pedidos
 * ni vacaciones (los candidatos de los dos son contratos). El día que haga falta, la solución es
 * rotularlo en el patrón (`N-{{numero}}`) y agregarlo acá — no adivinar por posición.
 */
/**
 * El CUIT/CUIL pelado: once dígitos que no estén pegados a otros. Los guiones internos son opcionales.
 *
 * SE SALTEA EL DE LA EMPLEADORA, y no es una precaución teórica. La regla que separa a los dos es el
 * ORDEN —`validarPatron` no deja poner `{{empresaCuit}}` antes que `{{cuit}}`— y esa regla se cae en
 * el único caso en que más importa: cuando la persona NO tiene CUIL, `{{cuit}}` renderiza vacío, el
 * campo desaparece del nombre, y el primer número de once dígitos pasa a ser el de la empleadora. El
 * archivo se leía entonces como si fuera de la empresa, y no matcheaba con nadie.
 *
 * Por eso el rótulo `Empresa-` del patrón por defecto no es decorativo: es lo que permite descartarlo.
 * `validarPatron` exige que `{{empresaCuit}}` vaya siempre precedido de un rótulo por este motivo.
 */
export declare const RE_CUIT_SUELTO: RegExp;
/** La forma vieja, etiquetada. Se lee por los archivos anteriores al cambio; ya no se escribe. */
export declare const RE_CUIL_ETIQUETADO: RegExp;
/**
 * El documento de quien no tiene CUIL.
 *
 * El "_" delante de la sigla es obligatorio y NO se admite el inicio de cadena: desde que los campos
 * usan "-" para sus espacios internos, un apellido como "LE ROY" queda "LE-ROY", y como la persona
 * va primera en el nombre, sin ese anclaje se leería como tipo LE + número ROY.
 */
export declare const RE_DOCUMENTO: RegExp;
/** Una fecha YYYYMMDD aislada, salteando las que son en realidad el número de documento. */
export declare const RE_FECHA: RegExp;
/**
 * El email, que dentro del nombre lleva el "@" escrito como `-ARROBA-` (ver `emailNomenclatura`).
 *
 * Es el ÚNICO identificador que siempre está. El CUIT no: son 39 personas del padrón sin CUIL válido
 * —31 con contratos— y sus archivos no tenían con qué identificarse más que el documento, que
 * tampoco todas tienen cargado. El email es obligatorio al registrarse, así que siempre hay uno.
 *
 * El "_" NO entra en la parte local aunque sea legal en un email: adentro del nombre de archivo es
 * el separador de campos, y `campoNomenclatura` ya convirtió a "-" cualquiera que viniera en el
 * valor. Si entrara, la expresión se comería el campo anterior.
 */
export declare const RE_EMAIL: RegExp;
/**
 * La misma dirección, tolerando que el separador de la marca haya cambiado.
 *
 * El nombre que llega por el asunto de un aviso pasó por Dropbox Sign, que transforma algunos
 * símbolos. Las letras de `ARROBA` no las toca —por eso la marca es una palabra y no un símbolo—
 * pero los guiones de los costados sí pueden salir como "_" o como espacio. Se prueba segunda para
 * que un nombre intacto se lea siempre con la expresión estricta.
 */
export declare const RE_EMAIL_TOLERANTE: RegExp;
/** Un "@" literal, para los archivos que alguien renombró a mano en Dropbox. */
export declare const RE_EMAIL_LITERAL: RegExp;
export interface AnclasNombre {
    /** CUIT/CUIL de la persona, once dígitos sin guiones. "" si el nombre no lo trae. */
    cuit: string;
    /** Sigla del documento (DNI, PAS…) en mayúsculas, cuando no hay CUIL. */
    tipoDoc: string;
    /** Número del documento, tal como está escrito en el nombre. */
    documento: string;
    /** Todas las fechas YYYYMMDD del nombre, en el orden en que aparecen. */
    fechas: string[];
    /** Email reconstruido (con su "@"), en minúsculas. "" si el nombre no lo trae. */
    email: string;
}
/**
 * Compara direcciones sin depender de los símbolos.
 *
 * Un email que pasó por el asunto de un aviso puede volver con los puntos o los guiones cambiados.
 * Comparando solo letras y números, `juan.perez@gmail.com` y `juan-perez@gmail.com` se leen igual —
 * que es lo que hace falta acá y no es lo mismo que decir que son la misma dirección: esto no se usa
 * para escribirle a nadie, solo para reconocer de quién es un archivo que ya existe.
 */
export declare const normalizarEmail: (email: string) => string;
/** Las anclas de un nombre de archivo. Nunca falla: lo que no encuentra queda vacío. */
export declare function leerAnclas(nombreArchivo: string): AnclasNombre;
/**
 * ¿Estos dos nombres hablan del MISMO documento?
 *
 * Para comparar dos NOMBRES entre sí —el del asunto del aviso contra el del archivo en la carpeta—,
 * que es lo que necesita el circuito de Dropbox Sign. No sirve para comparar un nombre contra un
 * contrato de la base: ahí las fechas del contrato son dos campos con nombre propio y la comparación
 * es otra (ver `estadoDropboxCronService`).
 *
 * Son DOS cosas distintas y las dos hacen falta:
 *
 *   QUIÉN   el CUIT o, si no está, el email. Ver `mismaPersona`.
 *   CUÁL    las fechas del período. Con el CUIT solo, dos documentos de la misma persona —un
 *           contrato y su renovación— son indistinguibles, y el circuito no tenía forma de saberlo:
 *           se plantaba o, peor, daba por movido un documento mirando otro.
 *
 * Sin ninguno de los dos identificadores devuelve `false` aunque las fechas coincidan: un documento
 * sin identificar no se confirma por su período, que comparte con cualquier otro del mismo rango.
 */
export declare function mismoDocumento(a: AnclasNombre, b: AnclasNombre): boolean;
/**
 * ¿Estos dos nombres son de la misma persona?
 *
 * El CUIT manda cuando los dos lo tienen: es el identificador fuerte y no cambia nunca. Si a alguno
 * le falta, decide el EMAIL, que es el único dato que siempre está —el CUIL no lo tienen 39 personas
 * del padrón, 31 de ellas con contratos, y el documento tampoco lo tienen todas cargado; el email es
 * obligatorio al registrarse—.
 *
 * Se comparan de a uno y no los dos juntos a propósito. Exigir que coincidan los dos parece más
 * estricto y en realidad pierde archivos: el email de una persona puede cambiar después de generado
 * el documento, y el archivo, que ya está en la carpeta con el email viejo, seguiría siendo suyo.
 * Con el CUIT presente eso no importa; sin CUIT, el email viejo es lo único que hay y sirve igual
 * para reconocer el archivo que se generó entonces.
 */
export declare function mismaPersona(a: AnclasNombre, b: AnclasNombre): boolean;
/**
 * ¿Este campo del nombre es un ancla?
 *
 * Lo usa `recortarNombre` para saber qué NO puede tocar cuando el nombre no entra en 255 bytes.
 * Cortarle un dígito a un CUIL o a una fecha no acorta el nombre: lo rompe, y el archivo se sube
 * igual y después no se puede asociar a nadie.
 */
export declare function esCampoAncla(campo: string): boolean;
