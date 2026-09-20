/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EMPAREJAR UN MOTIVO POR NOMBRE, CUANDO NO HAY OTRA COSA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * EL NOMBRE NO ES UNA CLAVE, Y ESTO NO ES TEÓRICO. El 20 de septiembre de 2026, mientras se escribía
 * este módulo, alguien renombró dos motivos en el ABM: "Compensatorios" pasó a "Compensatorio" y
 * "Cambios de Turno" a "Cambio de Turno". Los 556 renglones ya cargados siguen guardando el texto
 * viejo en `absenceReason`, así que de un momento a otro dejaron de emparejar con ningún motivo —y
 * la liquidación de esa gente salía vacía sin que nada fallara.
 *
 * La solución de fondo es `attendance.typeId`, que guarda el id y no el texto. Mientras los 7.938
 * renglones viejos no lo tengan, esto es lo que los sostiene.
 *
 * NO ES UN EMPAREJADOR "INTELIGENTE": iguala mayúsculas, acentos, espacios y el plural, y nada más.
 * Un parecido más flojo que eso —distancia de edición, palabras sueltas— terminaría liquidando
 * "Enfermedad" como "Enfermería" alguna vez, y nadie lo notaría hasta el recibo.
 */
/** Alias que no son variantes de escritura sino dos nombres para lo mismo. */
const ALIAS = {
    /*
      La app mobile, cuando suma a alguien que no es del proyecto sin elegir tipo, escribe
      "Presente (Adicional)"; el ABM lo llama "Otros Presentes". Son lo mismo, confirmado con el
      usuario, y son 323 renglones.
    */
    "presente (adicional)": "otros presentes",
    "presente adicional": "otros presentes",
};
const sinAcentos = (t) => String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
/** "Compensatorios" y "Compensatorio" tienen que caer en la misma clave. */
const singular = (palabra) => (palabra.length > 3 && palabra.endsWith("s") ? palabra.slice(0, -1) : palabra);
/**
 * La clave con la que se empareja un nombre de motivo.
 *
 * Se aplica a LOS DOS LADOS —al nombre del ABM y al texto guardado en el parte—, que es lo que hace
 * que el resultado no dependa de cuál de los dos se escribió primero.
 */
export function claveDeMotivo(nombre) {
    const limpio = sinAcentos(nombre);
    const conAlias = ALIAS[limpio] || limpio;
    return conAlias.split(" ").map(singular).join(" ");
}
/**
 * Arma el índice de "clave → algo" a partir de una lista de motivos.
 *
 * Si dos motivos colapsan en la misma clave —"Compensatorio" y "Compensatorios" conviviendo— gana
 * el primero y el segundo se devuelve en `colisiones`, para que el que llama lo pueda avisar en vez
 * de elegir uno en silencio.
 */
export function indexarPorNombre(motivos, valorDe) {
    const indice = new Map();
    const colisiones = [];
    for (const m of motivos) {
        const clave = claveDeMotivo(m.name);
        if (indice.has(clave)) {
            colisiones.push(m.name);
            continue;
        }
        indice.set(clave, valorDe(m));
    }
    return { indice, colisiones };
}
