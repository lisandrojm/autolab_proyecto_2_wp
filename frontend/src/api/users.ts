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
export interface Contract {
  fecha_alta_contrato: string;
  fecha_baja_contrato: string;
  nombre_proyecto: string;
  nombre_sede: string;
  nombre_rol_frame: string;
  nombre_contrato: string;
  sueldo_mano: number;
  observaciones?: string;
  sueldo_jornada?: number;
  cantidad_jornadas_laborales?: number;
  hora_inicio?: string;
  hora_fin?: string;
  nombre_estado_empleado?: string;
  nombre_categoria_sat?: string;
}

export interface UserProjectMetadata {
  _id: string;
  projectId?: string | { _id: string; name?: string };
  nombre_proyecto: string;
  nombre_rol_frame: string;
  contracts: Contract[];
}

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
  projectIds?: {
    _id: string;
    name: string;
    clientId?: {
      _id: string;
      name: string;
    };
  }[];
  /** ← ahora viaja como OBJETO (no tenantId string) */
  tenant?: TenantRef;
  tenantId?: string;
    isActive: boolean;
  lastLoginAt?: string;
  hireDate?: string;
  extraVacationDays?: number;
  seniorityAtEndOfYear?: number;
  vacationDays?: {
    lawDays: number;
    extraDays: number;
    totalDays: number;
  };
  createdAt: string;
  updatedAt: string;
  externalInfo?: {
    sedes: string[];
    rolFrames: string[];
  };
  metadata?: {
    projects?: UserProjectMetadata[];
    documento?: string;
    fullName?: string;
    isSolicitud?: boolean;
    roleFrameId?: string;
    categoriaSatId?: string;
    startDate?: string;
    dueDate?: string;
    workdaysCount?: number;
    schedule?: string;
    dailyRate?: number;
    isReplacement?: boolean;
    projectIds?: string[];
  };
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

function normalizeUser(raw: any): User {
  const firstName = raw?.firstName && String(raw.firstName).trim() !== "" ? String(raw.firstName) : undefined;
  const lastName = raw?.lastName && String(raw.lastName).trim() !== "" ? String(raw.lastName) : undefined;



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
      ? raw.clientIds.map((c: any) => {
          const id = typeof c === "string" ? c : (c?._id ?? c?.id ?? "");
          const name = typeof c === "object" ? (c?.name ?? "") : "";
          return {
            _id: String(id),
            name: String(name),
          };
        })
      : undefined,
    projectIds: Array.isArray(raw?.projectIds)
      ? raw.projectIds.map((p: any) => {
          const id = typeof p === "string" ? p : (p?._id ?? p?.id ?? "");
          const name = typeof p === "object" ? (p?.name ?? "") : "";
          let clientIdFormatted = undefined;

          if (typeof p === "object" && p?.clientId) {
            if (typeof p.clientId === "object") {
              clientIdFormatted = {
                _id: String(p.clientId._id ?? p.clientId.id ?? ""),
                name: String(p.clientId.name ?? ""),
              };
            } else if (typeof p.clientId === "string") {
              clientIdFormatted = {
                _id: String(p.clientId),
                name: "",
              };
            }
          }

          return {
            _id: String(id),
            name: String(name),
            clientId: clientIdFormatted,
          };
        })
      : undefined,
    tenant: normalizeTenant(raw),
    tenantId: raw?.tenantId ?? undefined,
    isActive: Boolean(raw?.isActive),
    lastLoginAt: raw?.lastLoginAt ? String(raw.lastLoginAt) : undefined,
    hireDate: raw?.hireDate ? String(raw.hireDate) : undefined,
    extraVacationDays: typeof raw?.extraVacationDays === "number" ? raw.extraVacationDays : 0,
    seniorityAtEndOfYear: typeof raw?.seniorityAtEndOfYear === "number" ? raw.seniorityAtEndOfYear : undefined,
    vacationDays: raw?.vacationDays
      ? {
          lawDays: Number(raw.vacationDays.lawDays || 0),
          extraDays: Number(raw.vacationDays.extraDays || 0),
          totalDays: Number(raw.vacationDays.totalDays || 0),
        }
      : undefined,
    createdAt: String(raw?.createdAt ?? ""),
    updatedAt: String(raw?.updatedAt ?? ""),
    externalInfo: raw?.externalInfo,
    metadata: raw?.metadata,
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
      clientId?: string;
    } = {},
  ): Promise<UsersListResponse> {
    const searchParams = new URLSearchParams();

    if (params.page) searchParams.append("page", params.page.toString());
    if (params.limit) searchParams.append("limit", params.limit.toString());
    if (params.email) searchParams.append("email", params.email);
    if (params.isActive !== undefined) searchParams.append("isActive", params.isActive.toString());
    if (params.areaId) searchParams.append("areaId", params.areaId);
    if (params.clientId) searchParams.append("clientId", params.clientId);

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

  async create(data: { email: string; password: string; firstName?: string; lastName?: string; isActive?: boolean; roles?: string[]; hireDate?: string; extraVacationDays?: number; clientIds?: string[]; projectIds?: string[] }): Promise<User> {
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
      hireDate?: string;
      extraVacationDays?: number;
      clientIds?: string[];
      projectIds?: string[];
    },
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

  async getDirectory(): Promise<User[]> {
    const { data } = await axios.get("/users/directory", { headers: this.getHeaders() });
    return Array.isArray(data) ? data.map(normalizeUser) : [];
  }



  async listSolicitudes(): Promise<User[]> {
    const { data } = await axios.get(`/users?isSolicitud=true&limit=500`, { headers: this.getHeaders() });
    const rows: any[] = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
    return rows.map(normalizeUser);
  }

  async approveSolicitud(id: string, approvalData: {
    email: string;
    password: string;
    sueldo_jornada: number;
    sueldo_mano: number;
    nombre_contrato: string;
    nombre_sede: string;
    observaciones?: string;
  }): Promise<User> {
    const { data } = await axios.put(`/users/${id}/approve-solicitud`, approvalData, { headers: this.getHeaders() });
    const user = normalizeUser(data);
    emitUsersChanged("update", user._id);
    return user;
  }

  async rejectSolicitud(id: string): Promise<void> {
    await axios.delete(`/users/${id}`, { headers: this.getHeaders() });
    emitUsersChanged("delete", id);
  }
}

export const usersAPI = new UsersAPI();
