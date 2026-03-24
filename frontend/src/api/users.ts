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
  };
  turnos?: {
    _id: string;
    name: string;
    startTime: string;
    endTime: string;
    type: string;
    days: number[];
  }[];
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
    positionId,
    levelId,
    areaId,
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
    turnos: Array.isArray(raw?.turnos)
      ? raw.turnos.map((t: any) => ({
          _id: String(t?._id ?? t?.id ?? ""),
          name: String(t?.name ?? ""),
          startTime: String(t?.startTime ?? ""),
          endTime: String(t?.endTime ?? ""),
          type: String(t?.type ?? ""),
          days: Array.isArray(t?.days) ? t.days : [],
        }))
      : undefined,
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

  async create(data: { email: string; password: string; firstName?: string; lastName?: string; isActive?: boolean; roles?: string[]; positionId?: string | null; levelId?: string | null; areaId?: string | null; hireDate?: string; extraVacationDays?: number; clientIds?: string[]; projectIds?: string[]; turnos?: string[] }): Promise<User> {
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
      hireDate?: string;
      extraVacationDays?: number;
      clientIds?: string[];
      projectIds?: string[];
      turnos?: string[];
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

  async getByArea(areaId: string): Promise<User[]> {
    const { data } = await axios.get(`/users/by-area/${areaId}`, { headers: this.getHeaders() });
    // Normalize logic is expecting full object, but our endpoint returns subsets.
    // However, normalizeUser is robust enough to handle missing fields.
    // Let's use it to ensure consistent types.
    return Array.isArray(data) ? data.map(normalizeUser) : [];
  }
}

export const usersAPI = new UsersAPI();
