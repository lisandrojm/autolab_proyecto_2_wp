import axios from "./axiosConfig";
import { emitRolesChanged } from "../utils/navbarEvents";

/* ------------------------------ Tipos base ------------------------------ */
type ObjectIdString = string & { readonly __objectIdBrand: unique symbol };

export interface TenantRef {
  _id: ObjectIdString;
  slug?: string;
  name?: string;
}

/* ------------------------------ Tipos dominio ------------------------------ */
export interface Role {
  _id: string;

  /** ← ahora viaja como OBJETO (no tenantId string) */
  tenant?: TenantRef;

  name: string;
  description?: string;
  permissions: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RolesListResponse {
  roles: Role[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/* ------------------------------ Normalizadores ------------------------------ */
function normalizeTenant(raw: any): TenantRef | undefined {
  // Acepta varias formas: raw.tenant {_id, slug, name} | raw.tenantId | string
  const t = raw?.tenant ?? {};
  const idLike = t?._id ?? raw?.tenantId ?? t?.id ?? (typeof t === "string" ? t : undefined);

  const id = typeof idLike === "string" && /^[a-f\d]{24}$/i.test(idLike) ? (idLike as ObjectIdString) : undefined;

  if (!id) return undefined;

  const slug = t?.slug ?? raw?.tenantSlug ?? undefined;
  const name = t?.name ?? raw?.tenantName ?? undefined;

  return { _id: id, slug, name };
}

function normalizeRole(raw: any): Role {
  return {
    _id: String(raw?._id ?? ""),
    tenant: normalizeTenant(raw),
    name: String(raw?.name ?? ""),
    description: raw?.description ?? "",
    permissions: Array.isArray(raw?.permissions) ? raw.permissions : [],
    isDefault: Boolean(raw?.isDefault),
    createdAt: String(raw?.createdAt ?? ""),
    updatedAt: String(raw?.updatedAt ?? ""),
  };
}

/* ------------------------------ API ------------------------------ */
class RolesAPI {
  private getHeaders() {
    const token = localStorage.getItem("token");
    // preferimos el slug si está cacheado; si no, el _id
    const tenantSlug = localStorage.getItem("tenantSlug");
    const tenantId = localStorage.getItem("tenantId");

    return {
      Authorization: `Bearer ${token}`,
      "X-Tenant-Id": tenantSlug || tenantId || "",
      "Content-Type": "application/json",
    };
  }

  async list(
    params: {
      page?: number;
      limit?: number;
      name?: string;
    } = {}
  ): Promise<RolesListResponse> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.append("page", params.page.toString());
    if (params.limit) searchParams.append("limit", params.limit.toString());
    if (params.name) searchParams.append("name", params.name);

    const { data } = await axios.get(`/roles?${searchParams.toString()}`, { headers: this.getHeaders() });

    const rows: any[] = Array.isArray(data?.roles) ? data.roles : Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];

    const roles = rows.map(normalizeRole);

    const pagination = data?.pagination ?? {
      page: Number(params.page ?? 1),
      limit: Number(params.limit ?? roles.length ?? 0),
      total: Number(data?.total ?? roles.length ?? 0),
      pages: Number(data?.pages ?? 1),
    };

    return { roles, pagination };
  }

  /**
   * Trae TODOS los roles iterando todas las páginas.
   * @param params.name filtro opcional por nombre
   * @param params.limit tamaño de página interno (chunk). Por defecto 200.
   */
  async listAll(params: { name?: string; limit?: number } = {}): Promise<Role[]> {
    const pageSize = params.limit ?? 200;

    // 1) Primera página para conocer total de páginas
    const first = await this.list({ page: 1, limit: pageSize, name: params.name });
    const all: Role[] = [...first.roles];

    const totalPages = first.pagination?.pages ?? 1;
    if (totalPages <= 1) return all;

    // 2) Resto de páginas
    for (let page = 2; page <= totalPages; page++) {
      const resp = await this.list({ page, limit: pageSize, name: params.name });
      all.push(...resp.roles);
    }

    return all;
  }

  async get(id: string): Promise<Role> {
    const { data } = await axios.get(`/roles/${id}`, {
      headers: this.getHeaders(),
    });
    return normalizeRole(data);
  }

  async create(data: { name: string; description?: string; permissions: string[]; isDefault?: boolean }): Promise<Role> {
    const { data: created } = await axios.post(`/roles`, data, {
      headers: this.getHeaders(),
    });
    const role = normalizeRole(created);
    emitRolesChanged("create", role._id);
    return role;
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      permissions?: string[];
      isDefault?: boolean;
    }
  ): Promise<Role> {
    const { data: updated } = await axios.patch(`/roles/${id}`, data, {
      headers: this.getHeaders(),
    });
    const role = normalizeRole(updated);
    emitRolesChanged("update", role._id);
    return role;
  }

  async remove(id: string): Promise<void> {
    await axios.delete(`/roles/${id}`, { headers: this.getHeaders() });
    emitRolesChanged("delete", id);
  }
}

export const rolesAPI = new RolesAPI();
