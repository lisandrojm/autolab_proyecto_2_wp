/**
 * VALIDA LAS VARIABLES DE UNA PLANTILLA MIRANDO LAS LLAVES, no buscando formas conocidas.
 *
 * POR QUÉ NO ALCANZA CON DOS REGEX. La verificación que dejó pasar el error contaba `{{nombre}}` por
 * un lado y `{nombre}` por el otro, y concluyó «0 llaves simples, 23 variables, todas válidas». Pero
 * lo que había era `{nombre}}`: una llave de apertura y dos de cierre. No es ninguna de las dos
 * formas buscadas, así que pasó por el agujero entre los dos patrones y el chequeo dijo «ok» porque
 * no miraba donde estaba el problema.
 *
 * Acá se hace al revés: NO se busca lo que se espera encontrar, se recorren TODAS las llaves del
 * documento y se exige que cada una pertenezca a un `{{...}}` bien formado. Lo que sobra se reporta,
 * tenga la forma que tenga — incluidas las que todavía no se nos ocurrieron.
 *
 * El caso real que lo motiva: al insertar la variable, el editor cortó por un borde de celda de tabla
 * y quedó `DATE: {` en una celda y `{fechaAltaContrato}}` en la siguiente. En el PDF eso no imprime
 * el dato: imprime las llaves.
 */
export interface ProblemaVariable {
    /** Qué se encontró, tal cual está en el documento. */
    fragmento: string;
    /** Posición en el contenido, para poder ubicarlo. */
    indice: number;
    motivo: string;
}
export interface AnalisisPlantilla {
    /** Nombres de variable bien formadas: `{{x}}`. */
    variables: string[];
    problemas: ProblemaVariable[];
}
/**
 * Analiza el contenido de una plantilla.
 *
 * Recorre las corridas de llaves —`{`, `{{`, `{{{`, y sus cierres— y las empareja. Una variable
 * válida es exactamente `{{` + nombre sin llaves + `}}`. Todo lo demás es un problema con nombre.
 */
export declare const analizarPlantilla: (contenido: string) => AnalisisPlantilla;
/** `true` si la plantilla no tiene ninguna llave fuera de una variable bien formada. */
export declare const plantillaSana: (contenido: string) => boolean;
