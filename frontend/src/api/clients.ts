import axios from "./axiosConfig";
import { emitClientsChanged } from "../utils/navbarEvents";

/* ========= Tipos base ========= */
type ObjectIdString = string & { readonly __objectIdBrand: unique symbol };

export interface TenantRef {
  _id: ObjectIdString;
  slug?: string;
  name?: string;
}

export type ClientStatus = "active" | "inactive" | "onboarding";

/* ========= Modelo ========= */
export interface Client {
  _id: string;

  // ← ahora como OBJETO (no tenantId string)
  tenant?: TenantRef;

  name: string;
  email: string;
  phone?: string;
  company?: string;
  industry?: string;
  website?: string;

  attachments?: Array<{
    _id: string;
    url: string;
    name?: string;
    fileName?: string;
    fileType?: string;
    uploadedAt?: string | Date;
    size?: number;
  }>;

  status: ClientStatus;

  /** favorito del cliente */
  favorite?: boolean;

  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ClientsListResponse {
  clients: Client[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

type ListParams = {
  page?: number;
  limit?: number;
  q?: string;
  name?: string;
  email?: string;
  status?: ClientStatus;
};

/* ========= Normalizadores ligeros ========= */
function normalizeTenant(raw: any): TenantRef | undefined {
  // Prioridad 1: Objeto completo en raw.tenant o raw.tenantId
  const obj = raw?.tenant || (typeof raw?.tenantId === "object" ? raw.tenantId : undefined) || {};

  // Prioridad 2: ID explícito en el objeto o ID string en raw.tenantId
  const idLike = obj._id || obj.id || (typeof raw?.tenantId === "string" ? raw.tenantId : undefined);

  // Validar formato ObjectId
  if (!idLike || typeof idLike !== "string" || !/^[a-f\d]{24}$/i.test(idLike)) {
    return undefined;
  }

  // Extraer slug y name si existen en el objeto encontrado o en propiedades planas
  const slug = obj.slug || raw?.tenantSlug;
  const name = obj.name || raw?.tenantName;

  return { _id: idLike as ObjectIdString, slug, name };
}

function normalizeClient(raw: any): Client {
  const normalized: any = {
    _id: String(raw?._id ?? ""),
    tenant: normalizeTenant(raw),
    name: raw?.name ?? "",
    email: raw?.email ?? "",
    phone: raw?.phone ?? "",
    company: raw?.company ?? "",
    industry: raw?.industry ?? "",
    website: raw?.website ?? "",
    attachments: Array.isArray(raw?.attachments) ? raw.attachments : [],

    status: (raw?.status as ClientStatus) ?? "onboarding",
    favorite: Boolean(raw?.favorite),
    createdAt: raw?.createdAt ?? "",
    updatedAt: raw?.updatedAt ?? "",
  };

  // Preservar campos adicionales del backend (usuarios, etc.)
  if (raw?.usuarios) normalized.usuarios = raw.usuarios;

  return normalized;
}

/* ========= API ========= */
class ClientsAPI {
  private getHeaders() {
    const token = localStorage.getItem("token");
    // Preferí el slug si existe; si no, el _id
    const tenantSlug = localStorage.getItem("tenantSlug");
    const tenantId = localStorage.getItem("tenantId");
    return {
      Authorization: `Bearer ${token}`,
      "X-Tenant-Id": tenantSlug || tenantId || "",
      "Content-Type": "application/json",
    };
  }

  private buildQuery(params: ListParams = {}) {
    const sp = new URLSearchParams();
    if (params.page) sp.append("page", String(params.page));
    if (params.limit) sp.append("limit", String(params.limit));
    if (params.q) sp.append("q", params.q);
    if (params.name) sp.append("name", params.name);
    if (params.email) sp.append("email", params.email);
    if (params.status) sp.append("status", params.status);
    return sp.toString();
  }

  async list(params: ListParams = {}): Promise<ClientsListResponse> {
    const qs = this.buildQuery(params);
    const url = qs ? `/clients?${qs}` : `/clients`;
    const { data } = await axios.get(url, { headers: this.getHeaders() });

    let rows: any[] = [];
    if (Array.isArray(data?.clients)) rows = data.clients;
    else if (Array.isArray(data?.items)) rows = data.items;
    else if (Array.isArray(data)) rows = data;

    const clients = rows.map(normalizeClient);

    const rawP = data?.pagination ?? data?.meta?.pagination ?? null;
    const pagination = rawP
      ? {
          page: Number(rawP.page ?? rawP.currentPage ?? 1),
          limit: Number(rawP.limit ?? rawP.pageSize ?? clients.length ?? 0),
          total: Number(rawP.total ?? rawP.totalItems ?? clients.length ?? 0),
          pages: Number(rawP.pages ?? rawP.totalPages ?? 1),
        }
      : undefined;

    return { clients, pagination };
  }

  async listAll(params: Omit<ListParams, "page"> & { limit?: number } = {}): Promise<Client[]> {
    const pageSize = params.limit ?? 200;
    let resp = await this.list({ ...params, page: 1, limit: pageSize });
    const all: Client[] = [...resp.clients];

    const totalPages = resp.pagination?.pages ?? 1;
    if (totalPages > 1) {
      for (let page = 2; page <= totalPages; page++) {
        resp = await this.list({ ...params, page, limit: pageSize });
        all.push(...resp.clients);
      }
      return all;
    }

    let page = 2;
    while (resp.clients.length === pageSize) {
      resp = await this.list({ ...params, page, limit: pageSize });
      all.push(...resp.clients);
      page += 1;
    }

    return all;
  }

  async get(id: string): Promise<Client> {
    const { data } = await axios.get(`/clients/${id}`, {
      headers: this.getHeaders(),
    });
    return normalizeClient(data);
  }

  async create(data: Partial<Client> & { name: string; email: string }): Promise<Client> {
    const { data: created } = await axios.post(`/clients`, data, {
      headers: this.getHeaders(),
    });
    const client = normalizeClient(created);
    emitClientsChanged("create", client._id);
    return client;
  }

  async update(id: string, data: Partial<Client>): Promise<Client> {
    const { data: updated } = await axios.patch(`/clients/${id}`, data, {
      headers: this.getHeaders(),
    });
    const client = normalizeClient(updated);
    emitClientsChanged("update", client._id);
    return client;
  }

  async remove(id: string): Promise<void> {
    await axios.delete(`/clients/${id}`, {
      headers: this.getHeaders(),
    });
    emitClientsChanged("delete", id);
  }

  /** NUEVO: endpoint dedicado para favorito */
  async toggleFavorite(id: string, favorite: boolean): Promise<Client> {
    const { data } = await axios.patch(`/clients/${id}/favorite`, { favorite }, { headers: this.getHeaders() });
    const client = normalizeClient(data);
    emitClientsChanged("update", client._id);
    return client;
  }

  /** Compartir cliente con un usuario (vincular usuario al cliente) */
  async share(clientId: string, userId: string, permiso: "ver" | "editar" = "ver"): Promise<Client> {
    const { data } = await axios.post(`/clients/${clientId}/share`, { id: userId, permiso }, { headers: this.getHeaders() });
    return normalizeClient(data);
  }

  /** Desvincular usuario del cliente */
  async unshare(clientId: string, userId: string): Promise<Client> {
    const { data } = await axios.post(`/clients/${clientId}/unshare`, { id: userId }, { headers: this.getHeaders() });
    return normalizeClient(data);
  }
}

export const clientsAPI = new ClientsAPI();
export type { ListParams };
