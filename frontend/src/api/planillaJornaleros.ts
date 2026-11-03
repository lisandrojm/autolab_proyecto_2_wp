import axios from "./axiosConfig";

/** La planilla mensual de jornaleros (JORNALEROS_<MES>_<AÑO>.xlsx). Ver `server/src/services/planillaJornaleros.ts`. */
export interface ResumenPlanillaJornaleros {
  mes: string;
  archivo: string;
  totales: { contratos: number; jornadas: number; personas: number; netoPactado: number };
  categorias: number;
  advertencias: string[];
}

/*
  Más que el minuto general de `axiosConfig`: es un informe de todo el mes contra la base. Con el
  minuto, una base lenta dejaba el panel en «Armando la planilla…» y después lo daba por fallido.
*/
const ESPERA_PLANILLA = 3 * 60_000;

export const planillaJornalerosAPI = {
  async resumen(mes: string): Promise<ResumenPlanillaJornaleros> {
    const { data } = await axios.get("/planilla-jornaleros", { params: { mes }, timeout: ESPERA_PLANILLA });
    return data;
  },

  async xlsx(mes: string): Promise<Blob> {
    const { data } = await axios.get("/planilla-jornaleros/xlsx", { params: { mes }, responseType: "blob", timeout: ESPERA_PLANILLA });
    return data;
  },
};
