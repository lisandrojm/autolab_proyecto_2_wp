/** Path de la PRIMERA carpeta (de cualquier estado) cuyo nombre o nota matcheen TODOS los patrones. */
export declare function resolverCarpetaPorPatron(patrones: RegExp[]): Promise<string | null>;
/** Nombre del ESTADO cuya transición automática incluye alguna carpeta que matchee TODOS los
 *  patrones de al menos uno de los grupos dados (cada grupo = un trámite de origen distinto). */
export declare function resolverEstadoPorCarpetas(gruposDePatrones: RegExp[][]): Promise<string | null>;
