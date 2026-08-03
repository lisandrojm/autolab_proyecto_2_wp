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

/* --------- Carga masiva de constancias de CUIT (PDF de ARCA) --------- */

/** Contrato que espera su constancia: el server lo usa para saber a quién puede asignarle un PDF. */
export interface ConstanciaTarget {
  projectId: string;
  userId: string;
  contractIndex: number;
}

/** Qué pasó con cada PDF del lote. */
export interface ConstanciaResultado {
  filename: string;
  /** CUIT leído del PDF (11 dígitos), "" si no se pudo leer. */
  cuit: string;
  status: "ok" | "vencida" | "duplicado" | "sin_cuit" | "sin_coincidencia" | "ilegible";
  vigenciaDesde?: string;
  vigenciaHasta?: string;
  verificador?: string;
  matched: { userId: string; userName: string; projectName: string; contractIndex: number }[];
}

export interface ConstanciaBulkResponse {
  resultados: ConstanciaResultado[];
  /** Cantidad de contratos a los que se les asignó una constancia. */
  asignados: number;
  archivos: number;
}

// Removed WorkSchedule types

export interface Project {
  _id: string;

  /** ← ahora viaja como OBJETO, no como tenantId string */
  tenant?: TenantRef;

  /** puede venir como string o como objeto ligero del cliente */
  clientId: string | { _id: string; name?: string };

  /** ObjectIds de las empresas (colección companies) para el contrato / release */
  contratoEmpresas?: string[];
  releaseEmpresas?: string[];

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
  activityLogConfig?: {
    useGlobalConfig: boolean;
    enableFastEntry?: boolean;
    allowsAdditionalStaff?: boolean;
    allowedPastDays?: number;
    schedule?: {
      type: "daily" | "workdays" | "custom";
      days: number[];
    };
  };
  teamConfig?: {
    userId: string;
    canRegister: boolean;
    useProjectSchedule?: boolean;
    startTime?: string;
    endTime?: string;
    shiftId?: string;
  }[];
  turnos?: (string | any)[];
  areasConfig?: {
    areaId: string | any;
    shiftIds: string[] | any[];
  }[];
  coordinatorAssignments?: {
    areaId: string | any;
    shiftId: string | any;
    userId: string | any;
  }[];
  metadata?: any;
  metadataResolutions?: {
    responsable?: any;
    cliente?: any;
    sede?: any;
    centroCosto?: any;
  };
  metadataUserCount?: number;
}

/** Fila del detalle de personas de un área + turno (endpoint area-shift-members). */
export interface AreaShiftMember {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Estado del usuario (metadata.activo). */
  activo: boolean;
  /** Último contrato sin baja o con baja de hoy en adelante. */
  vigente: boolean;
  /** Suma al número que muestra la columna Área/Turno Coordinada: activo + contrato vigente. */
  cuenta: boolean;
  /** Turnos que la persona tiene en el área consultada. */
  shiftIds: string[];
  nombreContrato: string;
  estadoContrato: string;
  fechaAlta: string;
  fechaBaja: string;
}

export interface AreaShiftCountsResponse {
  /** "areaId::shiftId" → cantidad de personas activas con contrato vigente. */
  counts: Record<string, number>;
  /** "areaId::shiftId" → ids de esas personas. */
  userIds: Record<string, string[]>;
}

export interface AreaShiftMembersResponse {
  members: AreaShiftMember[];
  total: number;
  cuentan: number;
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
    contratoEmpresas: Array.isArray(raw?.contratoEmpresas) ? raw.contratoEmpresas.map((e: any) => String(e?._id ?? e)) : [],
    releaseEmpresas: Array.isArray(raw?.releaseEmpresas) ? raw.releaseEmpresas.map((e: any) => String(e?._id ?? e)) : [],
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
    activityLogConfig: raw?.activityLogConfig,
    turnos: Array.isArray(raw?.turnos) ? raw.turnos : [],
    teamConfig: raw?.teamConfig,
    areasConfig: Array.isArray(raw?.areasConfig) ? raw.areasConfig : [],
    coordinatorAssignments: Array.isArray(raw?.coordinatorAssignments) ? raw.coordinatorAssignments : [],
    metadata: raw?.metadata,
    metadataResolutions: raw?.metadataResolutions,
    metadataUserCount: typeof raw?.metadataUserCount === "number" ? raw.metadataUserCount : Array.isArray(raw?.assignedUsers) ? raw.assignedUsers.length : 0,
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
      contratoEmpresas?: string[];
      releaseEmpresas?: string[];
      turnos?: string[];
      areasConfig?: {
        areaId: string;
        shiftIds: string[];
      }[];
    },
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

  /**
   * Personas del equipo por combinación exacta de área + turno, indexadas por "areaId::shiftId".
   * Solo cuenta activos con contrato vigente. Se calcula en el server porque el equipo se lista
   * paginado. `userIds` trae quiénes son, para poder totalizar un área sin repetir a quien está en
   * más de uno de sus turnos.
   */
  async getAreaShiftCounts(projectId: string): Promise<AreaShiftCountsResponse> {
    const resp = await axios.get(`/projects/${projectId}/area-shift-counts`, {
      headers: this.getHeaders(),
    });
    return { counts: resp.data?.counts || {}, userIds: resp.data?.userIds || {} };
  }

  /**
   * Detalle de las personas asignadas a un área + turno (todas, con su estado y contrato).
   * Con `shiftIds` se acota a esos horarios (los que coordina esa persona); sin ninguno de los dos,
   * devuelve el área completa.
   */
  async getAreaShiftMembers(projectId: string, areaId: string, shiftId?: string, shiftIds?: string[]): Promise<AreaShiftMembersResponse> {
    const sp = new URLSearchParams({ areaId });
    if (shiftId) sp.append("shiftId", shiftId);
    else if (shiftIds?.length) sp.append("shiftIds", shiftIds.join(","));
    const resp = await axios.get(`/projects/${projectId}/area-shift-members?${sp.toString()}`, {
      headers: this.getHeaders(),
    });
    return { members: resp.data?.members || [], total: resp.data?.total || 0, cuentan: resp.data?.cuentan || 0 };
  }

  async updateProject(
    projectId: string,
    data: {
      name?: string;
      description?: string;
      objectives?: string[];
      targetAudience?: string;
      contratoEmpresas?: string[];
      releaseEmpresas?: string[];
      assignedUsers?: string[];
      vacationConfig?: {
        useGlobalConfig: boolean;
        permiteFraccionadas: boolean;
        minDiasFraccion?: number;
        diasCorridos?: boolean;
      };
      activityLogConfig?: {
        useGlobalConfig: boolean;
        enableFastEntry?: boolean;
        allowsAdditionalStaff?: boolean;
        allowedPastDays?: number;
        schedule?: {
          type: "daily" | "workdays" | "custom";
          days: number[];
        };
      };
      turnos?: string[];
      areasConfig?: {
        areaId: string;
        shiftIds: string[];
      }[];
      coordinatorAssignments?: {
        areaId: string;
        shiftId: string;
        userId: string;
      }[];
    },
  ): Promise<Project> {
    const resp = await axios.patch(`/projects/${projectId}`, data, {
      headers: this.getHeaders(),
    });
    const project = normalizeProject(resp.data);
    const clientId = typeof project.clientId === "string" ? project.clientId : project.clientId._id;
    emitProjectsChanged("update", project._id, clientId);
    return project;
  }

  async updateTeamConfig(
    projectId: string,
    config: {
      userId: string;
      isNotifier: boolean;
      canRegister: boolean;
      useProjectSchedule?: boolean;
      startTime?: string;
      endTime?: string;
    }[],
  ): Promise<Project> {
    const resp = await axios.patch(
      `/projects/${projectId}/team-config`,
      { config },
      {
        headers: this.getHeaders(),
      },
    );
    return normalizeProject(resp.data);
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

  async cleanupTeam(projectId: string): Promise<{ message: string; removedCount: number; newCount: number }> {
    const resp = await axios.post(
      `/projects/${projectId}/cleanup-team`,
      {},
      {
        headers: this.getHeaders(),
      },
    );
    return resp.data;
  }

  async getClient(clientId: string): Promise<Client> {
    const resp = await axios.get(`/clients/${clientId}`, {
      headers: this.getHeaders(),
    });
    return resp.data as Client;
  }

  async assignMember(projectId: string, data: { userId: string; contract: any; isUpdate?: boolean; contractIndex?: number; approveSolicitud?: boolean }): Promise<void> {
    await axios.post(`/projects/${projectId}/assign-member`, data, {
      headers: this.getHeaders(),
    });
    const project = await this.getProject(projectId);
    const clientId = typeof project.clientId === "string" ? project.clientId : project.clientId._id;
    emitProjectsChanged("update", projectId, clientId);
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    await axios.delete(`/projects/${projectId}/members/${userId}`, {
      headers: this.getHeaders(),
    });
    const project = await this.getProject(projectId);
    const clientId = typeof project.clientId === "string" ? project.clientId : project.clientId._id;
    emitProjectsChanged("update", projectId, clientId);
  }

  /** Elimina un contrato puntual (por índice) de la persona en un proyecto. */
  async deleteMemberContract(projectId: string, userId: string, index: number): Promise<void> {
    await axios.delete(`/projects/${projectId}/members/${userId}/contracts/${index}`, {
      headers: this.getHeaders(),
    });
  }

  /** Sube (o reemplaza) el PDF de "Alta" (AFIP/Servicios) de un contrato puntual (por índice). */
  async uploadAltaDocumento(projectId: string, userId: string, contractIndex: number, file: File): Promise<{ altaDocumentoUrl: string; altaDocumentoNombre: string; estadoAuto?: { id: number; nombre: string } }> {
    const formData = new FormData();
    formData.append("document", file);
    // Sin headers explícitos: el interceptor global de axios pone Authorization/X-Tenant-Id y deja que
    // el browser setee el Content-Type multipart con el boundary (getHeaders() fuerza JSON y rompe esto).
    const { data } = await axios.patch(`/projects/${projectId}/members/${userId}/contracts/${contractIndex}/alta-documento`, formData);
    return data;
  }

  /**
   * Carga masiva de constancias de CUIT: manda N PDFs de ARCA junto con los contratos que esperan
   * constancia. El server lee el CUIT de cada PDF y lo asigna a quien corresponda.
   */
  async bulkUploadConstancias(files: File[], targets: ConstanciaTarget[]): Promise<ConstanciaBulkResponse> {
    const formData = new FormData();
    files.forEach((f) => formData.append("documents", f));
    formData.append("targets", JSON.stringify(targets));
    const { data } = await axios.post(`/projects/constancias/bulk-upload`, formData);
    return data;
  }
}

export const projectsAPI = new ProjectsAPI();
