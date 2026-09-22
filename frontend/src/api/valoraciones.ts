import axios from "./axiosConfig";

/**
 * La valoración de las categorías POR BRUTO. La regla vive en el server (`utils/valoracionPorBruto.ts`,
 * con tests): de menor a mayor, la más barata de cada convenio toma el nivel más bajo. Acá sólo se
 * pide y se muestra; calcularla también en el front sería una segunda copia que se desalinea.
 */

export interface ValoracionSugerida {
  valoracionId: string | null;
  /** Por qué quedó sin valorar («es la única de su convenio», «no tiene bruto»…). */
  motivo?: string;
}

export interface CambioCategoriaPorBruto {
  categoriaId: number;
  nombre: string;
  convenio: string;
  bruto: number | null;
  antes: string | null;
  despues: string | null;
  motivo?: string;
}

export interface PlanValoracionPorBruto {
  niveles: Array<{ _id: string; name: string; orden: number | null; color: string }>;
  funciones: Array<{ funcionId: string; funcion: string; cambios: CambioCategoriaPorBruto[] }>;
  salteadas: string[];
  categorias: number;
}

export const valoracionesPorBrutoAPI = {
  /** Sugerencia para lo tildado en una función, por `_id` del catálogo. Se pide por conjunto: «la más barata» es relativa a las otras. */
  async sugerir(categorias: string[]): Promise<Record<string, ValoracionSugerida>> {
    const { data } = await axios.post("/valoraciones/por-bruto/sugerir", { categorias });
    return data?.sugerencias || {};
  },
  /** Qué cambiaría en todas las funciones. No escribe. */
  async plan(incluirValoradas: boolean): Promise<PlanValoracionPorBruto> {
    const { data } = await axios.post("/valoraciones/por-bruto/plan", { incluirValoradas });
    return data;
  },
  async aplicar(incluirValoradas: boolean): Promise<{ funciones: number; categorias: number; salteadas: number }> {
    const { data } = await axios.post("/valoraciones/por-bruto/aplicar", { incluirValoradas });
    return data;
  },
};
