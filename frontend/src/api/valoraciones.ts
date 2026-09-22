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

export const valoracionesPorBrutoAPI = {
  /** Sugerencia para lo tildado en una función, por `_id` del catálogo. Se pide por conjunto: «la más barata» es relativa a las otras. */
  async sugerir(categorias: string[]): Promise<Record<string, ValoracionSugerida>> {
    const { data } = await axios.post("/valoraciones/por-bruto/sugerir", { categorias });
    return data?.sugerencias || {};
  },
};
