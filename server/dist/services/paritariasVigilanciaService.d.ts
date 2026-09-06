import { IFuenteParitaria } from "../models/FuenteParitaria.js";
export interface EnlacePdf {
    url: string;
    texto: string;
}
/**
 * Todos los `<a href>` a un PDF, con su texto.
 *
 * Se parsea con una expresión y no con un DOM completo a propósito: la entrada es HTML de terceros
 * que puede estar mal formado —y el del SATSAID lo está—, y un parser estricto fallaría entero donde
 * esto extrae lo que hay. Lo que se busca es una lista de enlaces, no la estructura del documento.
 *
 * Se DEDUPLICA por URL. La página del SATSAID tiene tres secciones (223/75, 131/75, 634/11) que
 * cuelgan literalmente los mismos archivos, así que sin esto el mismo acuerdo entraría dos veces.
 */
export declare function extraerEnlacesPdf(html: string, urlBase: string): EnlacePdf[];
/**
 * Los enlaces que son una escala, según los patrones de la fuente.
 *
 * Se prueba contra el texto Y el nombre del archivo juntos porque el dato útil está en uno o en el
 * otro según la página: en Actores el texto dice «Cuadro escala salarial» y el archivo también; en el
 * SATSAID el texto dice «Descargar» y lo único que distingue es el nombre.
 */
export declare function filtrarEnlaces(enlaces: EnlacePdf[], fuente: Pick<IFuenteParitaria, "patronIncluir" | "patronExcluir">): EnlacePdf[];
export interface ResultadoRevision {
    fuenteId: string;
    nombre: string;
    resultado: "ok" | "sin_enlaces" | "error_red" | "error_parseo";
    /** Enlaces que pasaron los patrones. */
    enlaces: number;
    /** Publicaciones creadas en esta corrida. */
    nuevas: number;
    /** `true` si esta fue la primera revisión: todo se registró como ya visto. */
    lineaBase: boolean;
    error?: string;
    /** Motivo de sospecha cuando el conteo se derrumbó respecto de la última revisión buena. */
    aviso?: string;
}
/**
 * Revisa UNA fuente. Nunca lanza: devuelve el resultado y lo deja registrado en la fuente.
 *
 * Que no lance es la razón por la que una fuente caída no frena a las otras. La rutina diaria las
 * recorre en serie y cada una se cuida sola.
 */
export declare function revisarFuente(fuenteId: string): Promise<ResultadoRevision>;
/**
 * Revisa todas las fuentes activas, en serie.
 *
 * En serie y no en paralelo por cortesía: son tres sitios chicos de entidades gremiales y no hay
 * ningún apuro que justifique golpearlos a la vez. Que una falle no frena a las siguientes — eso lo
 * garantiza `revisarFuente`, que nunca lanza.
 */
export declare function revisarTodas(): Promise<ResultadoRevision[]>;
/** Una fuente está CIEGA cuando su última revisión no encontró nada o falló: puede haber salido algo. */
export declare const fuenteConProblema: (f: Pick<IFuenteParitaria, "ultimoResultado">) => boolean;
