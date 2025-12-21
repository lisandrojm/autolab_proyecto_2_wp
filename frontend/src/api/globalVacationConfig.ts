import api from "./axiosConfig";

interface AntiguedadTramo {
  desde: number;
  hasta: number;
  dias: number;
}

export interface GlobalVacationConfig {
  _id?: string;
  tenantId: string;
  diasAnuales: number;
  diasBeneficio?: number;
  antiguedadTramos?: AntiguedadTramo[];
  maxDiasGozados?: number;
  permiteArrastre: boolean;
  maxDiasArrastre?: number;
  vencimientoArrastreDias?: number;

  maxDiasHabiles?: number;
  anticipacionMinimaDias?: number;
  permiteFraccionadas: boolean;
  minDiasFraccion?: number;
  requiereFirma: boolean;
  pdfTemplateId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const globalVacationConfigAPI = {
  getConfig: async (): Promise<GlobalVacationConfig> => {
    const response = await api.get("/global-vacation-config");
    return response.data;
  },

  updateConfig: async (config: Partial<GlobalVacationConfig>): Promise<GlobalVacationConfig> => {
    const response = await api.put("/global-vacation-config", config);
    return response.data;
  },
};
