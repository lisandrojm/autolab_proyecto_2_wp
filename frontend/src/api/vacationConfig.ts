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

export interface ComputoAntiguedad {
  modo: "empresaVigente" | "precedenciaManual";
  /** Ids de empresas (Company), en orden: la primera que la persona tenga gana. Sólo en modo manual. */
  precedencia: string[];
  /** El cálculo viejo: todas las empleadoras sumadas. */
  sumarEntreEmpresas: boolean;
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
  /** Ventana anual de goce: el tramo del año en que se pueden tomar vacaciones, sin año ("MM-DD"). Ver `@compartido/ventanaGoce`. */
  ventanaGoce?: { enabled: boolean; inicio: string; fin: string };
  /** Campaña de goce (15/11/2026): plazos. Ver `@compartido/vacaciones/campania`. */
  campania?: { activa: boolean; plazoParaDefinirDias: number; avisoMinimoDias: number; minDiasPorTramo: number; tiposContratoInvitar?: number[] };
  /** De qué empleadora se toma la antigüedad (15/11/2026): ya no se suman. Ver `AntiguedadPorEmpresaConfig`. */
  computoAntiguedad?: ComputoAntiguedad;
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
