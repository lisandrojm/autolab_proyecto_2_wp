import axios from "./axiosConfig";

export interface ContractListItem {
  userId: string;
  userEmail: string;
  userFirstName?: string;
  userLastName?: string;
  projectName?: string;
  nombre_contrato?: string;
  nombre_sede?: string;
  nombre_rol_frame?: string;
  fecha_alta_contrato?: string;
  fecha_baja_contrato?: string;
  sueldo_mano?: number;
  nombre_estado_empleado?: string;
  cantidad_jornadas_laborales?: number;
  tipo_contrato_id?: number;
}

export interface ContractsListResponse {
  contracts: ContractListItem[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

class ContractsAPI {
  /** Lista paginada de contratos (server-side). Los contratos se aplanan desde UserProject.contracts. */
  async list(params: { page?: number; limit?: number; q?: string; projectId?: string } = {}): Promise<ContractsListResponse> {
    const sp = new URLSearchParams();
    if (params.page) sp.append("page", String(params.page));
    if (params.limit) sp.append("limit", String(params.limit));
    if (params.q) sp.append("q", params.q);
    if (params.projectId && params.projectId !== "all") sp.append("projectId", params.projectId);

    const { data } = await axios.get(`/user-projects/contracts?${sp.toString()}`);

    return {
      contracts: Array.isArray(data?.contracts) ? data.contracts : [],
      pagination: data?.pagination ?? {
        page: Number(params.page ?? 1),
        limit: Number(params.limit ?? 20),
        total: 0,
        pages: 1,
      },
    };
  }
}

export const contractsAPI = new ContractsAPI();
