import axios from "./axiosConfig";
import { emitUsersChanged } from "../utils/navbarEvents";

/* ---------- Tipos base ---------- */
type ObjectIdString = string & { readonly __objectIdBrand: unique symbol };

export interface TenantRef {
  _id: ObjectIdString;
  slug?: string;
  name?: string;
}

/* ---------- Tipos dominio ---------- */
export interface User {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: "admin" | "user" | "manager" | "client";
  primaryRole?: string;
  roles: {
    _id: string;
    name: string;
    description?: string;
    permissions: string[];
  }[];
  clientIds?: {
    _id: string;
    name: string;
  }[];
  /** ← ahora viaja como OBJETO (no tenantId string) */
  tenant?: TenantRef;
  tenantId?: string;
  positionId?:
    | string
    | {
        _id: string;
        name: string;
        description?: string;
      };
  levelId?:
    | string
    | {
        _id: string;
        name: string;
        description?: string;
      };
  areaId?:
    | string
    | {
        _id: string;
        name: string;
        description?: string;
      };
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UsersListResponse {
  users: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/* ---------- Normalizadores ---------- */
function normalizeTenant(raw: any): TenantRef | undefined {
  const t = raw?.tenant ?? {};
  const idLike = t?._id ?? raw?.tenantId ?? t?.id ?? (typeof t === "string" ? t : undefined);

  const id = typeof idLike === "string" && /^[a-f\d]{24}$/i.test(idLike) ? (idLike as ObjectIdString) : undefined;

  if (!id) return undefined;

  const slug = t?.slug ?? raw?.tenantSlug ?? undefined;
  const name = t?.name ?? raw?.tenantName ?? undefined;

  return { _id: id, slug, name };
}

function normalizeUser(raw: any): User {
  const firstName = raw?.firstName && String(raw.firstName).trim() !== "" ? String(raw.firstName) : undefined;
  const lastName = raw?.lastName && String(raw.lastName).trim() !== "" ? String(raw.lastName) : undefined;

  // Normalizar positionId
  let positionId: User["positionId"] = undefined;
  if (raw?.positionId) {
    if (typeof raw.positionId === "string") {
      positionId = raw.positionId;
    } else if (typeof raw.positionId === "object" && raw.positionId._id) {
      positionId = {
        _id: String(raw.positionId._id),
        name: String(raw.positionId.name ?? ""),
        description: raw.positionId.description ?? undefined,
      };
    }
  }

  // Normalizar levelId
  let levelId: User["levelId"] = undefined;
  if (raw?.levelId) {
    if (typeof raw.levelId === "string") {
      levelId = raw.levelId;
    } else if (typeof raw.levelId === "object" && raw.levelId._id) {
      levelId = {
        _id: String(raw.levelId._id),
        name: String(raw.levelId.name ?? ""),
        description: raw.levelId.description ?? undefined,
      };
    }
  }

  // Normalizar areaId
  let areaId: User["areaId"] = undefined;
  if (raw?.areaId) {
    if (typeof raw.areaId === "string") {
      areaId = raw.areaId;
    } else if (typeof raw.areaId === "object" && raw.areaId._id) {
      areaId = {
        _id: String(raw.areaId._id),
        name: String(raw.areaId.name ?? ""),
        description: raw.areaId.description ?? undefined,
      };
    }
  }

  return {
    _id: String(raw?._id ?? ""),
    email: String(raw?.email ?? ""),
    firstName,
    lastName,
    role: raw?.role ?? undefined,
    primaryRole: raw?.primaryRole ?? undefined,
    roles: Array.isArray(raw?.roles)
      ? raw.roles.map((r: any) => ({
          _id: String(r?._id ?? r?.id ?? ""),
          name: String(r?.name ?? ""),
          description: r?.description ?? undefined,
          permissions: Array.isArray(r?.permissions) ? r.permissions : [],
        }))
      : [],
    clientIds: Array.isArray(raw?.clientIds)
      ? raw.clientIds.map((c: any) => ({
          _id: String(c?._id ?? c?.id ?? ""),
          name: String(c?.name ?? ""),
        }))
      : undefined,
    tenant: normalizeTenant(raw),
    tenantId: raw?.tenantId ?? undefined,
    positionId,
    levelId,
    areaId,
    isActive: Boolean(raw?.isActive),
    lastLoginAt: raw?.lastLoginAt ? String(raw.lastLoginAt) : undefined,
    createdAt: String(raw?.createdAt ?? ""),
    updatedAt: String(raw?.updatedAt ?? ""),
  };
}

/* ---------- API ---------- */
class UsersAPI {
  private getHeaders() {
    const token = localStorage.getItem("token");
    const tenantSlug = localStorage.getItem("tenantSlug");
    const tenantId = localStorage.getItem("tenantId");

    return {
      Authorization: `Bearer ${token}`,
      // Preferimos slug para scoping; si no, id
      "X-Tenant-Id": tenantSlug || tenantId || "",
      "Content-Type": "application/json",
    };
  }

  async list(
    params: {
      page?: number;
      limit?: number;
      email?: string;
      isActive?: boolean;
      areaId?: string;
    } = {}
  ): Promise<UsersListResponse> {
    const searchParams = new URLSearchParams();

    if (params.page) searchParams.append("page", params.page.toString());
    if (params.limit) searchParams.append("limit", params.limit.toString());
    if (params.email) searchParams.append("email", params.email);
    if (params.isActive !== undefined) searchParams.append("isActive", params.isActive.toString());
    if (params.areaId) searchParams.append("areaId", params.areaId);

    const { data } = await axios.get(`/users?${searchParams.toString()}`, { headers: this.getHeaders() });

    const rows: any[] = Array.isArray(data?.users) ? data.users : Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];

    const users = rows.map(normalizeUser);

    const pagination = data?.pagination ?? {
      page: Number(params.page ?? 1),
      limit: Number(params.limit ?? users.length ?? 0),
      total: Number(data?.total ?? users.length ?? 0),
      pages: Number(data?.pages ?? 1),
    };

    return { users, pagination };
  }

  async get(id: string): Promise<User> {
    const { data } = await axios.get(`/users/${id}`, { headers: this.getHeaders() });
    return normalizeUser(data);
  }

  async create(data: { email: string; password: string; firstName?: string; lastName?: string; isActive?: boolean; roles?: string[]; positionId?: string | null; levelId?: string | null; areaId?: string | null }): Promise<User> {
    const { data: created } = await axios.post(`/users`, data, { headers: this.getHeaders() });
    const user = normalizeUser(created);
    emitUsersChanged("create", user._id);
    return user;
  }

  async update(
    id: string,
    data: {
      email?: string;
      firstName?: string;
      lastName?: string;
      isActive?: boolean;
      roles?: string[];
      positionId?: string | null;
      levelId?: string | null;
      areaId?: string | null;
    }
  ): Promise<User> {
    const { data: updated } = await axios.patch(`/users/${id}`, data, { headers: this.getHeaders() });
    const user = normalizeUser(updated);
    emitUsersChanged("update", user._id);
    return user;
  }

  async updatePassword(id: string, password: string): Promise<void> {
    await axios.patch(`/users/${id}/password`, { password }, { headers: this.getHeaders() });
  }

  async remove(id: string): Promise<void> {
    await axios.delete(`/users/${id}`, { headers: this.getHeaders() });
    emitUsersChanged("delete", id);
  }

  async getByArea(areaId: string): Promise<User[]> {
    const { data } = await axios.get(`/users/by-area/${areaId}`, { headers: this.getHeaders() });
    // Normalize logic is expecting full object, but our endpoint returns subsets.
    // However, normalizeUser is robust enough to handle missing fields.
    // Let's use it to ensure consistent types.
    return Array.isArray(data) ? data.map(normalizeUser) : [];
  }
}

export const usersAPI = new UsersAPI();
