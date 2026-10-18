import axios from "./axiosConfig";
import { rolesFrameDe } from "../utils/areasRoles";

export interface TenantRef {
  _id: string;
  name?: string;
  slug?: string;
}

export interface Area {
  _id: string;
  tenantId?: string;
  tenant?: TenantRef;
  name: string;
  description?: string;
  isSystem?: boolean;
  /** Los roles empresa (ids de RoleFrame) que trabajan en el área. Ver `rolesSinArea`. */
  rolesFrame?: string[];
  vacationConfig?: {

    useGlobalConfig: boolean;
    permiteFraccionadas: boolean;
    minDiasFraccion?: number;
    diasCorridos?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AreaFormData {
  name: string;
  description?: string;
  rolesFrame?: string[];
  vacationConfig?: {
    useGlobalConfig: boolean;
    permiteFraccionadas: boolean;
    minDiasFraccion?: number;
    diasCorridos?: boolean;
  };
}

export interface AreaListResponse {
  areas: Area[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

function normalizeTenant(raw: any): TenantRef | undefined {
  const obj = raw?.tenant || (typeof raw?.tenantId === "object" ? raw.tenantId : undefined) || {};
  const idLike = obj._id || obj.id || (typeof raw?.tenantId === "string" ? raw.tenantId : undefined);

  if (!idLike || typeof idLike !== "string" || !/^[a-f\d]{24}$/i.test(idLike)) {
    return undefined;
  }

  return { _id: idLike, slug: obj.slug || raw?.tenantSlug, name: obj.name || raw?.tenantName };
}

function normalizeArea(raw: any): Area {
  return {
    _id: raw._id,
    tenantId: typeof raw.tenantId === "string" ? raw.tenantId : raw.tenantId?._id,
    tenant: normalizeTenant(raw),
    name: raw.name,
    description: raw.description,
    isSystem: !!raw.isSystem,
    // Los roles empresa del área (ver `utils/areasRoles.ts`). `undefined` si el server no mandó el campo:
    // el formulario no lo pisa con un array vacío.
    rolesFrame: rolesFrameDe(raw),
    vacationConfig: raw.vacationConfig,

    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export const areasAPI = {
  list: async (params?: { page?: number; limit?: number; name?: string }): Promise<AreaListResponse> => {
    const response = await axios.get("/areas", { params });
    const data = response.data;
    return {
      areas: (data.areas || []).map(normalizeArea),
      pagination: data.pagination,
    };
  },

  listAll: async (): Promise<Area[]> => {
    const response = await axios.get("/areas", { params: { limit: 1000 } });
    return (response.data.areas || []).map(normalizeArea);
  },

  /** Los roles empresa que todavía no están en ninguna área: cada uno tiene que estar en al menos una. */
  rolesSinArea: async (): Promise<{ roles: Array<{ _id: string; name: string }>; total: number; totalRoles: number }> => {
    const { data } = await axios.get("/areas/roles-sin-area");
    return data;
  },
  count: async (): Promise<{ count: number }> => {
    const response = await axios.get("/areas/count");
    return response.data;
  },

  getById: async (id: string): Promise<Area> => {
    const response = await axios.get(`/areas/${id}`);
    return normalizeArea(response.data);
  },

  create: async (data: AreaFormData): Promise<Area> => {
    const response = await axios.post("/areas", data);
    return normalizeArea(response.data);
  },

  update: async (id: string, data: Partial<AreaFormData>): Promise<Area> => {
    const response = await axios.patch(`/areas/${id}`, data);
    return normalizeArea(response.data);
  },

  remove: async (id: string): Promise<void> => {
    await axios.delete(`/areas/${id}`);
  },
};
