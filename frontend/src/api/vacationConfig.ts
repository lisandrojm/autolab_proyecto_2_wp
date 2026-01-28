import api from "./axiosConfig";

interface AntiguedadTramo {
  desde: number;
  hasta: number;
  dias: number;
}

export interface ContractRule {
  contractId: number;
  contractName: string;
  vacationsEnabled: boolean;
}

export interface AvailableContract {
  id: number;
  name: string;
}

export interface VacationConfig {
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
  diasCorridos: boolean;
  requiereFirma: boolean;
  pdfId?: string;
  contractRules?: ContractRule[];
  createdAt?: string;
  updatedAt?: string;
}

export const vacationConfigAPI = {
  getConfig: async (): Promise<VacationConfig> => {
    const response = await api.get("/vacation-config");
    return response.data;
  },

  updateConfig: async (config: Partial<VacationConfig>): Promise<VacationConfig> => {
    const response = await api.put("/vacation-config", config);
    return response.data;
  },

  getAvailableContracts: async (): Promise<AvailableContract[]> => {
    const response = await api.get("/vacation-config/contracts-available");
    return response.data;
  },
};
