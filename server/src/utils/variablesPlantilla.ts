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

/** Contexto alrededor de una posición, con el HTML colapsado para que se pueda leer. */
const contexto = (texto: string, i: number, largo: number): string =>
  texto
    .slice(Math.max(0, i - 45), i + largo + 45)
    .replace(/\s+/g, " ")
    .trim();

/**
 * Analiza el contenido de una plantilla.
 *
 * Recorre las corridas de llaves —`{`, `{{`, `{{{`, y sus cierres— y las empareja. Una variable
 * válida es exactamente `{{` + nombre sin llaves + `}}`. Todo lo demás es un problema con nombre.
 */
export const analizarPlantilla = (contenido: string): AnalisisPlantilla => {
  const texto = String(contenido || "");
  const variables: string[] = [];
  const problemas: ProblemaVariable[] = [];

  // Todas las corridas de llaves del documento, en orden.
  const corridas: Array<{ i: number; llaves: string }> = [];
  for (const m of texto.matchAll(/\{+|\}+/g)) corridas.push({ i: m.index ?? 0, llaves: m[0] });

  let k = 0;
  while (k < corridas.length) {
    const abre = corridas[k];
    if (abre.llaves[0] !== "{") {
      problemas.push({ fragmento: contexto(texto, abre.i, abre.llaves.length), indice: abre.i, motivo: `cierre «${abre.llaves}» sin apertura` });
      k++;
      continue;
    }
    const cierra = corridas[k + 1];
    if (!cierra || cierra.llaves[0] !== "}") {
      problemas.push({ fragmento: contexto(texto, abre.i, abre.llaves.length), indice: abre.i, motivo: `apertura «${abre.llaves}» sin cierre` });
      k++;
      continue;
    }
    const entre = texto.slice(abre.i + abre.llaves.length, cierra.i);
    const nombre = entre.trim();
    if (abre.llaves.length === 2 && cierra.llaves.length === 2 && /^[A-Za-z0-9_]+$/.test(nombre)) {
      variables.push(nombre);
    } else if (abre.llaves.length !== cierra.llaves.length) {
      /*
        EL CASO QUE SE ESCAPÓ. `{x}}` y `{{x}` tienen distinta cantidad de llaves de cada lado: el
        renderer no los reconoce como variable y los imprime tal cual en el PDF.
      */
      problemas.push({
        fragmento: contexto(texto, abre.i, cierra.i + cierra.llaves.length - abre.i),
        indice: abre.i,
        motivo: `llaves desbalanceadas: ${abre.llaves.length} de apertura y ${cierra.llaves.length} de cierre alrededor de «${nombre.slice(0, 40)}»`,
      });
    } else if (abre.llaves.length === 1) {
      problemas.push({ fragmento: contexto(texto, abre.i, cierra.i + 1 - abre.i), indice: abre.i, motivo: `llave simple: «{${nombre.slice(0, 40)}}» no lo reemplaza el renderer` });
    } else if (nombre.includes("<") || nombre.includes(">")) {
      // Una variable partida por un borde de celda deja HTML adentro de las llaves.
      problemas.push({ fragmento: contexto(texto, abre.i, cierra.i + cierra.llaves.length - abre.i), indice: abre.i, motivo: `variable partida por marcado: hay HTML entre las llaves` });
    } else {
      problemas.push({ fragmento: contexto(texto, abre.i, cierra.i + cierra.llaves.length - abre.i), indice: abre.i, motivo: `no es un nombre de variable válido: «${nombre.slice(0, 40)}»` });
    }
    k += 2;
  }

  return { variables, problemas };
};

/** `true` si la plantilla no tiene ninguna llave fuera de una variable bien formada. */
export const plantillaSana = (contenido: string): boolean => analizarPlantilla(contenido).problemas.length === 0;
