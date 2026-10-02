import { EstadoCategoriaArca, FilaCatalogo } from "../../compartido/catalogoArca.js";
/**
 * El espejo de ARCA (`arca_catalogo`) visto desde el resto del server: leerlo, aplicarle un lote de
 * filas, y calcular el estado de cada categoría de WeProdu contra él.
 *
 * `aplicarFilas` es el ÚNICO camino de escritura del espejo. Lo llaman la semilla desde el CSV y la
 * aplicación de una lectura de ARCA confirmada; ningún endpoint de ABM.
 */
export interface FilaParaAplicar extends FilaCatalogo {
    codigoPadded?: string;
    largo?: number;
    alcance?: string;
    orden?: number;
}
/**
 * Aplica un lote de filas al espejo, dentro de un ALCANCE: las tablas leídas y, si se indican, los
 * padres que se vieron (los convenios de esa empleadora). Lo del alcance que no vino pasa a
 * `vigente: false`; lo de fuera del alcance no se toca.
 */
export declare function aplicarFilas(o: {
    filas: FilaParaAplicar[];
    origen: "csv" | "arca";
    empresaCuit?: string | null;
    tablas: string[];
    filtros?: Record<string, string[]>;
    sinBajas?: string[];
    ahora?: Date;
}): Promise<{
    nuevos: number;
    cambiados: number;
    bajas: number;
}>;
export declare const invalidarEspejo: () => void;
export declare function espejoCategorias(): Promise<{
    en: number;
    mapa: Map<string, {
        codigo: string;
        descripcion: string;
        vigente: boolean;
    }>;
    hay: boolean;
}>;
export interface EstadoArcaDeCategoria {
    estadoArca: EstadoCategoriaArca | null;
    estadoArcaConfirmada: boolean;
    descripcionArcaEspejo: string;
}
/**
 * El estado de una categoría contra el espejo. `estadoArca: null` = el espejo todavía no se sembró:
 * no se sabe, y NO se bloquea nada por eso (sería frenar todas las altas por una tabla vacía).
 */
export declare function estadoDe(espejo: Awaited<ReturnType<typeof espejoCategorias>>, c: {
    nombre?: string;
    convenio?: string;
    codigoArca?: string;
    confirmacionNombre?: {
        descripcionArca?: string;
    } | null;
}, grupoNumero: number | null | undefined): EstadoArcaDeCategoria;
/** Número de grupo por `_id` de `ConvenioGrupo`, para los que necesitan el estado de muchas categorías. */
export declare function numerosDeGrupo(): Promise<Map<string, number>>;
