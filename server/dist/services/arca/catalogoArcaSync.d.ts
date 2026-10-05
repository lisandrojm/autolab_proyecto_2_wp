import { FilaCatalogo } from "../../compartido/catalogoArca.js";
/**
 * SINCRONIZAR EL ESPEJO CONTRA ARCA: leer, comparar, y dejar el diff PENDIENTE.
 *
 * Lee con el Chromium del servidor (mismo usuario delegado, mismo candado de una corrida por tenant
 * que las demás corridas de ARCA) y no aplica nada: guarda una `ArcaCatalogoLectura` con tres listas
 * —nuevos, dejaron de publicarse, descripción cambiada— y para cada cambio qué categorías de WeProdu y
 * cuántos contratos toca. Se aplica con confirmación (`aplicarLectura`).
 */
/** Tablas que dependen de la empleadora: de una lectura no se deduce que ARCA dejó de publicarlas. */
export declare const TABLAS_POR_EMPRESA: string[];
interface Corrida {
    empresaId: string;
    empresaCuit: string;
    razonSocial: string;
    eventos: any[];
    terminada: boolean;
    lecturaId?: string;
    error?: string;
    arrancadaEl: Date;
}
export declare const lecturaEnCursoDe: (tenantId: string) => Corrida;
/**
 * Lleva las filas leídas a la forma del espejo:
 *   · el código con el mismo relleno que tiene esa tabla en el espejo (ARCA puede mandarlo sin ceros);
 *   · el padre SOLO cuenta en las categorías (el convenio). En el resto se respeta el que ya tiene el
 *     espejo para ese código: el CSV y la pantalla no siempre nombran igual ese campo, y tomarlo de la
 *     pantalla haría parecer «nuevas» filas que ya estaban.
 */
export declare function normalizarLeidas(leidas: FilaCatalogo[], espejo: Array<FilaCatalogo & {
    codigoPadded?: string;
}>): FilaCatalogo[];
export declare function arrancarLecturaCatalogo(o: {
    tenantId: string;
    empresaId: string;
    usuarioId?: string;
}): Promise<{
    empresaCuit: string;
    razonSocial: string;
}>;
/**
 * Aplica una lectura pendiente al espejo. Las descripciones que cambiaron en códigos que usa alguna
 * categoría le sacan la confirmación de nombre: vuelven a `nombre_distinto` hasta que alguien revise.
 */
export declare function aplicarLectura(id: string, usuarioId?: string): Promise<{
    nuevos: number;
    cambiados: number;
    bajas: number;
}>;
export declare function descartarLectura(id: string, usuarioId?: string): Promise<void>;
/** Cuándo se leyó por última vez el catálogo desde ARCA con esta empleadora (cualquier estado). */
export declare function ultimaLecturaDe(empresaCuit: string): Promise<Date | null>;
export {};
