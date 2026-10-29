import axios from "./axiosConfig";

/** La planilla mensual de jornaleros (JORNALEROS_<MES>_<AÑO>.xlsx). Ver `server/src/services/planillaJornaleros.ts`. */
export interface ResumenPlanillaJornaleros {
  mes: string;
  archivo: string;
  totales: { contratos: number; jornadas: number; personas: number; netoPactado: number };
  categorias: number;
  advertencias: string[];
}

export const planillaJornalerosAPI = {
  async resumen(mes: string): Promise<ResumenPlanillaJornaleros> {
    const { data } = await axios.get("/planilla-jornaleros", { params: { mes } });
    return data;
  },

  async xlsx(mes: string): Promise<Blob> {
    const { data } = await axios.get("/planilla-jornaleros/xlsx", { params: { mes }, responseType: "blob" });
    return data;
  },
};
