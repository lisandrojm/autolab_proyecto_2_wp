import axios from "./axiosConfig";
import { useAuthStore } from "../stores/authStore";
import { emitProjectsChanged } from "../utils/navbarEvents";

/* ------------------------------ Tipos base ------------------------------ */
type ObjectIdString = string & { readonly __objectIdBrand: unique symbol };

export interface TenantRef {
  _id: ObjectIdString;
  slug?: string;
  name?: string;
}

/* ------------------------------ Tipos de dominio ------------------------------ */
export interface Client {
  _id: string;
  name: string;
}

export interface Project {
  _id: string;

  /** ← ahora viaja como OBJETO, no como tenantId string */
  tenant?: TenantRef;

  /** puede venir como string o como objeto ligero del cliente */
  clientId: string | { _id: string; name?: string };

  name: string;
  description?: string;
  status: "active" | "completed" | "on_hold" | "archived";
  startDate?: string;
  endDate?: string;
  createdBy: string;
  createdAt: string;
  objectives?: string[];
  targetAudience?: string;
  assignedUsers?: string[] | any[];
  updatedAt: string;
  vacationConfig?: {
    useGlobalConfig: boolean;
    permiteFraccionadas: boolean;
    minDiasFraccion?: number;
    diasCorridos?: boolean;
  };
}

export interface ProjectsListResponse {
  projects: Project[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/* ------------------------------ Normalizadores opcionales ------------------------------ */
function normalizeTenant(raw: any): TenantRef | undefined {
  // Puede venir como project.tenant {_id, slug, name} o como project.tenantId/string
  const t = raw?.tenant ?? {};
  const idLike = t?._id ?? raw?.tenantId ?? t?.id ?? (typeof t === "string" ? t : undefined);

  const id = typeof idLike === "string" && /^[a-f\d]{24}$/i.test(idLike) ? (idLike as ObjectIdString) : undefined;

  if (!id) return undefined;

  const slug = t?.slug ?? raw?.tenantSlug ?? undefined;
  const name = t?.name ?? raw?.tenantName ?? undefined;

  return { _id: id, slug, name };
}

function normalizeProject(raw: any): Project {
  return {
    _id: String(raw?._id ?? ""),
    tenant: normalizeTenant(raw),
    clientId: raw?.clientId && typeof raw.clientId === "object" ? { _id: String(raw.clientId._id ?? raw.clientId.id ?? ""), name: raw.clientId.name } : String(raw?.clientId ?? ""),
    name: raw?.name ?? "",
    description: raw?.description ?? "",
    status: raw?.status ?? "active",
    startDate: raw?.startDate ?? undefined,
    endDate: raw?.endDate ?? undefined,
    createdBy: String(raw?.createdBy ?? ""),
    createdAt: String(raw?.createdAt ?? ""),
    objectives: Array.isArray(raw?.objectives) ? raw.objectives : [],
    targetAudience: raw?.targetAudience ?? "",
    assignedUsers: Array.isArray(raw?.assignedUsers) ? raw.assignedUsers : [],
    updatedAt: String(raw?.updatedAt ?? ""),
    vacationConfig: raw?.vacationConfig,
  };
}

/* ------------------------------ API ------------------------------ */
class ProjectsAPI {
  /** Lee credenciales desde localStorage y, si faltan, cae al Zustand store */
  private getHeaders() {
    const lsToken = localStorage.getItem("token");
    const lsTenantId = localStorage.getItem("tenantId");
    const lsTenantSlug = localStorage.getItem("tenantSlug");

    const store = (() => {
      try {
        return useAuthStore.getState?.();
      } catch {
        return {} as any;
      }
    })();

    const token = lsToken || store?.token || "";
    const tenantScope = lsTenantSlug || lsTenantId || store?.tenantId || "";

    return {
      Authorization: `Bearer ${token}`,
      // preferimos scopear por slug si está disponible
      "X-Tenant-Id": tenantScope,
      "Content-Type": "application/json",
    };
  }

  async getProjectsCount(clientId: string): Promise<{ count: number }> {
    const { data } = await axios.get(`/clients/${clientId}/projects/count`, {
      headers: this.getHeaders(),
    });
    return data;
  }

  async getClientProjects(clientId: string, params: { q?: string; page?: number; limit?: number } = {}): Promise<ProjectsListResponse> {
    const sp = new URLSearchParams();
    if (params.q) sp.append("q", params.q);
    if (params.page) sp.append("page", String(params.page));
    if (params.limit) sp.append("limit", String(params.limit));

    const { data } = await axios.get(`/clients/${clientId}/projects?${sp.toString()}`, {
      headers: this.getHeaders(),
    });

    // Si querés homogeneizar la forma:
    const rows: any[] = Array.isArray(data?.projects) ? data.projects : Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];

    return {
      projects: rows.map(normalizeProject),
      pagination: data?.pagination ?? {
        page: Number(params.page ?? 1),
        limit: Number(params.limit ?? rows.length ?? 0),
        total: Number(data?.total ?? rows.length ?? 0),
        pages: Number(data?.pages ?? 1),
      },
    };
  }

  async list(params: { q?: string; page?: number; limit?: number } = {}): Promise<ProjectsListResponse> {
    const sp = new URLSearchParams();
    if (params.q) sp.append("q", params.q);
    if (params.page) sp.append("page", String(params.page));
    if (params.limit) sp.append("limit", String(params.limit));

    const { data } = await axios.get(`/projects?${sp.toString()}`, {
      headers: this.getHeaders(),
    });

    const rows: any[] = Array.isArray(data?.projects) ? data.projects : Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];

    return {
      projects: rows.map(normalizeProject),
      pagination: data?.pagination ?? {
        page: Number(params.page ?? 1),
        limit: Number(params.limit ?? rows.length ?? 0),
        total: Number(data?.total ?? rows.length ?? 0),
        pages: Number(data?.pages ?? 1),
      },
    };
  }

  async getMiniProjects(ids: string[]): Promise<{ _id: string; name: string; clientId?: { _id: string; name: string } }[]> {
    if (ids.length === 0) return [];
    const { data } = await axios.get(`/miniprojects?ids=${ids.join(",")}`, { headers: this.getHeaders() });
    return data;
  }

  async listAll(params: { q?: string; limit?: number } = {}): Promise<Project[]> {
    const pageSize = params.limit ?? 200;
    let resp = await this.list({ ...params, page: 1, limit: pageSize });
    const all: Project[] = [...resp.projects];

    const totalPages = resp.pagination?.pages ?? 1;
    if (totalPages > 1) {
      for (let page = 2; page <= totalPages; page++) {
        resp = await this.list({ ...params, page, limit: pageSize });
        all.push(...resp.projects);
      }
    }
    return all;
  }

  async createProject(
    clientId: string,
    data: {
      name: string;
      description?: string;
      objectives?: string[];
      targetAudience?: string;
    }
  ): Promise<Project> {
    const resp = await axios.post(`/clients/${clientId}/projects`, data, {
      headers: this.getHeaders(),
    });
    const project = normalizeProject(resp.data);
    emitProjectsChanged("create", project._id, clientId);
    return project;
  }

  async getProject(projectId: string): Promise<Project> {
    const resp = await axios.get(`/projects/${projectId}`, {
      headers: this.getHeaders(),
    });
    return normalizeProject(resp.data);
  }

  async updateProject(
    projectId: string,
    data: {
      name?: string;
      description?: string;
      objectives?: string[];
      targetAudience?: string;
      assignedUsers?: string[];
      vacationConfig?: {
        useGlobalConfig: boolean;
        permiteFraccionadas: boolean;
        minDiasFraccion?: number;
        diasCorridos?: boolean;
      };
    }
  ): Promise<Project> {
    const resp = await axios.patch(`/projects/${projectId}`, data, {
      headers: this.getHeaders(),
    });
    const project = normalizeProject(resp.data);
    const clientId = typeof project.clientId === "string" ? project.clientId : project.clientId._id;
    emitProjectsChanged("update", project._id, clientId);
    return project;
  }

  async getProjectCampaigns(projectId: string): Promise<any[]> {
    const resp = await axios.get(`/projects/${projectId}/campaigns`, {
      headers: this.getHeaders(),
    });
    return resp.data;
  }

  /**
   * Crea campaña bajo un proyecto.
   * Body recomendado: { name, description, objectives, targetAudience, status, budget, timeline, platforms, projectId, clientId? }
   */
  async createProjectCampaign(projectId: string, data: any): Promise<any> {
    const resp = await axios.post(`/projects/${projectId}/campaigns`, data, {
      headers: this.getHeaders(),
    });
    return resp.data;
  }

  async deleteProject(projectId: string): Promise<void> {
    await axios.delete(`/projects/${projectId}`, {
      headers: this.getHeaders(),
    });
    emitProjectsChanged("delete", projectId);
  }

  async getClient(clientId: string): Promise<Client> {
    const resp = await axios.get(`/clients/${clientId}`, {
      headers: this.getHeaders(),
    });
    return resp.data as Client;
  }
}

export const projectsAPI = new ProjectsAPI();
