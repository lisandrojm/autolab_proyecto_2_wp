/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EMPAREJAR UN MOTIVO POR NOMBRE, CUANDO NO HAY OTRA COSA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * EL NOMBRE NO ES UNA CLAVE, Y ESTO NO ES TEÓRICO. El 20 de septiembre de 2026, mientras se escribía
 * este módulo, alguien renombró dos motivos en el ABM —"Compensatorios" pasó a "Compensatorio" y
 * "Cambios de Turno" a "Cambio de Turno"— y borró otros dos. Los renglones ya cargados siguen
 * guardando el texto viejo en `absenceReason`, así que de un momento a otro dejaron de emparejar con
 * ningún motivo, y la liquidación de esa gente salía vacía sin que nada fallara.
 *
 * HAY DOS CLAVES, Y LA DIFERENCIA ES IMPORTANTE:
 *
 *   · `claveDeMotivo` es TOLERANTE (iguala el plural) y se usa para LEER partes viejos. Equivocarse
 *     acá muestra mal una pantalla, y se nota.
 *
 *   · `claveExactaDeMotivo` NO perdona nada y se usa para ESCRIBIR el `typeId` en la base. Un match
 *     aproximado que acierta el 99% deja el 1% atado al tipo equivocado, y eso no falla nunca: queda
 *     mal para siempre y se liquida mal en silencio.
 *
 * NINGUNA USA EXPRESIONES REGULARES. La versión anterior tenía un `.replace(/s+/g, " ")` al que le
 * faltaba la barra del `\s`, así que reemplazaba LA LETRA "S": "Compensatorios" y "Compensatorio"
 * terminaban los dos en "compen atorio" y matcheaban. Se descubrió porque un conteo no cerraba, no
 * porque algo fallara. Con un bucle explícito ese error no se puede escribir.
 */
/**
 * LA CLAVE TOLERANTE, para leer.
 *
 * Se aplica a LOS DOS LADOS —al nombre del ABM y al texto guardado en el parte—, que es lo que hace
 * que el resultado no dependa de cuál de los dos se escribió primero.
 *
 * Tolera la escritura, NO el significado: "Enfermedad" y "Enfermería" siguen siendo distintos.
 */
export declare function claveDeMotivo(nombre: string): string;
/**
 * LA CLAVE EXACTA, para escribir.
 *
 * Iguala mayúsculas, acentos y espacios, y nada más. No toca el plural ni aplica alias: lo que no
 * coincide letra por letra no coincide, y quien llama tiene que informarlo en vez de resolverlo.
 */
export declare function claveExactaDeMotivo(nombre: string): string;
/**
 * Arma el índice de "clave → algo" a partir de una lista de motivos.
 *
 * Si dos motivos colapsan en la misma clave —"Compensatorio" y "Compensatorios" conviviendo— gana
 * el primero y el segundo se devuelve en `colisiones`, para que el que llama lo pueda avisar en vez
 * de elegir uno en silencio.
 */
export declare function indexarPorNombre<T>(motivos: {
    name: string;
}[], valorDe: (m: any) => T): {
    indice: Map<string, T>;
    colisiones: string[];
};
