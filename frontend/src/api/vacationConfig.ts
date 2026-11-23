import api from "./axiosConfig";

interface AntiguedadTramo {
  desde: number;
  hasta: number;
  dias: number;
}

export interface ContractRule {
  /** El tipo del catálogo (`_id` de `contratos`). Desde el 23/11/2026 es la clave. */
  tipoContratoId?: string;
  /** La clave vieja: el número de la plantilla de FRAME. El server la traduce. */
  contractId?: number;
  contractName: string;
  vacationsEnabled: boolean;
}

/**
 * UN TIPO DE CONTRATO PARA VACACIONES (23/11/2026): uno por tipo del catálogo, con sus códigos de ARCA, cuántas
 * personas lo tienen vigente y si tiene vacaciones según «Visibilidad por tipo de Contrato». Reemplaza a
 * `AvailableContract` en Vacaciones (ése agrupaba por el número de FRAME y mezclaba todo lo creado en WeProdu).
 */
export interface TipoContratoVacaciones {
  id: string;
  name: string;
  activo: boolean;
  arca: { modalidad: string; servicio: string; liquidacion: string };
  vigentes: number;
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
  campania?: { activa: boolean; plazoParaDefinirDias: number; avisoMinimoDias: number; minDiasPorTramo: number; tiposContratoInvitar?: string[]; diasDeInicio?: number[] };
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

  /** Los tipos de contrato del catálogo para Vacaciones (Visibilidad y campaña de goce). */
  getTiposContrato: async (): Promise<TipoContratoVacaciones[]> => {
    const response = await api.get("/vacation-config/tipos-contrato");
    return response.data;
  },

  /** Agrupa por el número de FRAME: sólo para Órdenes. Vacaciones usa `getTiposContrato`. */
  getAvailableContracts: async (): Promise<AvailableContract[]> => {
    const response = await api.get("/vacation-config/contracts-available");
    return response.data;
  },
};
