/**
 * LECTURA DE UN RECIBO DE SUELDO a partir del texto de sus páginas (módulo Recibos de sueldo, 20/10/2026).
 *
 * El PDF que se sube es una sábana: todos los recibos del mes, uno atrás del otro, de a dos páginas por
 * persona. Acá se lee lo que identifica a cada uno —el CUIL de la persona, su nombre, el período, el
 * legajo, el neto— con expresiones tolerantes al formato, porque el texto que devuelve el extractor
 * trae saltos de línea y espacios donde el recibo tenía columnas.
 *
 * El CUIL es el dato fuerte: con él se busca a la persona en la plataforma. Lo demás es informativo y
 * puede faltar sin que el recibo quede inválido. Lo que NO se pudo leer queda vacío, nunca inventado,
 * y el texto crudo se guarda entero para poder verlo (y exportarlo) cuando algo no cierra.
 *
 * Puro, sin base ni PDF: se testea con texto.
 */
export interface DatosRecibo {
    /** El CUIL de la persona (11 dígitos, prefijo de persona física), o "". */
    cuil: string;
    /** El CUIT de la empleadora (prefijo 30/33/34), o "". */
    empleadorCuit: string;
    nombre: string;
    /** "YYYY-MM", o "". */
    periodo: string;
    legajo: string;
    neto: string;
    /** Todos los CUIL/CUIT válidos que aparecen, en orden: para revisar cuando el fuerte no es el esperado. */
    cuitsEncontrados: string[];
}
/** El dígito verificador (módulo 11) de los diez primeros dígitos de un CUIT/CUIL. */
export declare function digitoVerificador(diez: string): string;
/**
 * Todos los números de 11 dígitos (con o sin guiones) que son un CUIT/CUIL válido, sin repetir.
 *
 * También «20-37008740-» o «27-21471133-.»: el OCR suele perder el último dígito, que queda pegado al
 * borde de la celda. Ese dígito es el verificador y sale de los otros diez, así que se recalcula: el
 * CUIL completo es único para esos diez dígitos, no se inventa nada.
 */
export declare function cuitsDelTexto(texto: string): string[];
/**
 * El período del recibo como "YYYY-MM". Acepta «Período: 08/2026», «PERIODO 2026/08», «Agosto 2026»,
 * «AGOSTO/2026», «08-2026» y «2026-08». Toma el primero que encuentra con rótulo; sin rótulo, el primer
 * «mes año» en letras, que es lo que un recibo suele poner en el título.
 */
export declare function periodoDelTexto(textoCrudo: string): string;
/** El nombre de la persona, por los rótulos habituales de un recibo o por la línea «APELLIDO, Nombres legajo». "" si no se reconoce. */
export declare function nombreDelTexto(texto: string): string;
export declare function legajoDelTexto(texto: string): string;
/** «Mart n Fernando» → el OCR perdió una tilde: se deja un comodín para comparar nombres sin tildes. */
export declare const normalizarNombre: (s: string) => string;
export declare function netoDelTexto(texto: string): string;
/** Lee todo lo que se pueda del texto de un recibo (una o varias páginas concatenadas). */
export declare function leerRecibo(textoCrudo: string): DatosRecibo;
/**
 * CÓMO SE PARTE LA SÁBANA EN RECIBOS. Cada página se lee por su cuenta; una página con CUIL propio
 * empieza un recibo nuevo salvo que sea el mismo CUIL del recibo abierto y a éste le falten páginas
 * (`paginasPorRecibo`, normalmente 2: la segunda hoja repite el CUIL). Una página sin CUIL se pega al
 * recibo abierto (la segunda hoja a veces no lo trae). Si ninguna página tiene CUIL —un PDF escaneado,
 * sin texto— se parte a ciegas de a `paginasPorRecibo`, para que al menos se pueda revisar a mano.
 *
 * Devuelve los grupos como índices de página (base 0).
 */
export declare function agruparPaginas(textosPorPagina: string[], paginasPorRecibo?: number): number[][];
