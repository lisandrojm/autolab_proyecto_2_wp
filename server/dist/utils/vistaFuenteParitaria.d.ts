import { IFuenteParitaria } from "../models/FuenteParitaria.js";
/**
 * EL ÚNICO lugar donde se arma el estado de una fuente para la pantalla.
 *
 * POR QUÉ EXISTE
 *
 * Había dos lecturas paralelas del mismo documento: `GET /fuentes` devolvía el doc entero y
 * `GET /estado` armaba a mano un objeto por convenio con los campos que en ese momento hicieron
 * falta. Funcionó hasta que uno de los dos se quedó sin `activa` — y ahí `/arca/fuentes-paritaria`
 * decía «vigilando» mientras `/convenios` decía «vigilancia pausada» sobre la MISMA fuente, las dos
 * con cara de estar informando.
 *
 * El bug de fondo no era el campo que faltaba: era que hubiera dos caminos que alguien tenía que
 * acordarse de mantener sincronizados. Con un solo mapper, agregar un campo lo agrega en los dos
 * lados o en ninguno.
 *
 * `activa` y `ultimaRevision` salen SIEMPRE de acá, en las dos rutas.
 */
export interface VistaFuente {
    _id: string;
    entidad: string;
    nombre: string;
    /**
     * Si la rutina diaria la toca. Es la vigilancia, y es una decisión distinta de tener la fuente
     * cargada: se puede saber dónde publica un gremio sin estar bajando esa página todos los días.
     */
    activa: boolean;
    /**
     * Un INSTANTE en ISO, no una fecha de calendario: la revisión corrió en un momento exacto y se
     * muestra convertido a la hora de quien mira. `null` = nunca revisada, y de eso depende la línea
     * de base.
     */
    ultimaRevision: string | null;
    ultimoResultado?: "ok" | "sin_enlaces" | "error_red" | "error_parseo";
    ultimoError: string;
    /** La última revisión no terminó en `ok`: la fuente está ciega. */
    conProblema: boolean;
}
type FuenteLeida = Pick<IFuenteParitaria, "entidad" | "nombre" | "activa" | "ultimaRevision" | "ultimoResultado" | "ultimoError"> & {
    _id: unknown;
};
export declare const vistaDeFuente: (f: FuenteLeida) => VistaFuente;
export {};
