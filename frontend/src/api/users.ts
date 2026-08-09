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
  nombre_turno?: string;
  nombre_area?: string;
  // Numeric IDs from UserProject collection
  categoria_sat_id?: number;
  estado_id?: number;
  tipo_contrato_id?: number;
  sede_id?: number;
  rol_frame_id?: number;
  sueldo_diario_neto?: number;
  diferencia_diaria_neto?: number;
  sueldo_neto?: number;
  sueldo_bruto?: number;
  sueldo_mano_texto?: string;
  reemplazo?: boolean;
  empleado_id_reemplezado?: number;
  // Empresas (contrato / release) elegidas para este miembro
  empresaContratoId?: string;
  empresaReleaseId?: string;
  nombre_empresa_contrato?: string;
  nombre_empresa_release?: string;
  // Documento de "Alta" (AFIP o Servicios, según el Estado impositivo vinculado a la Plantilla).
  altaDocumentoUrl?: string;
  altaDocumentoNombre?: string;
  areaShiftAssignments?: {
    areaId: string | any;
    shiftIds: string[] | any[];
  }[];
}

/** Fila de la página global "Contratos" (`GET /users/contracts-overview`): usuario × proyecto, con su contrato activo. */
export interface ContractOverviewRow {
  _id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userActivo: boolean;
  /** id externo (FRAME) del usuario — para resolver a quién reemplaza otro contrato de la misma página. */
  userExternalId: number | null;
  userRoles: { _id: string; name: string }[];
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  nombreRolFrame: string;
  contractsInProject: number;
  contractIndex: number;
  nombre_contrato: string;
  nombre_estado_empleado: string;
  nombre_sede: string;
  areaShiftAssignments: { areaId: string | any; shiftIds: (string | any)[] }[];
  reemplazo: boolean;
  empleado_id_reemplezado?: number | null;
  fecha_alta_contrato: string;
  fecha_baja_contrato: string;
  sueldo_mano?: number;
  cantidad_jornadas_laborales?: number;
  hora_inicio?: string;
  hora_fin?: string;
  // Documentos del contrato ACTIVO, para las columnas de descarga/carga de la tabla de Contratos.
  altaDocumentoUrl?: string;
  altaDocumentoNombre?: string;
  /** Datos leídos del PDF de la Constancia de CUIT de ARCA ("YYYY-MM-DD"). Vale un mes: la vigencia marca cuándo hay que volver a pedirla. */
  constanciaVigenciaDesde?: string;
  constanciaVigenciaHasta?: string;
  constanciaVerificador?: string;
  /** Resultado de la última consulta al Padrón de AFIP — reemplaza al PDF como fuente de verdad. */
  constanciaAfipEstado?: "activo" | "inactivo" | "desconocido" | "";
  constanciaAfipConsultadaAt?: string;
  /** Recién con esto el trámite se considera terminado (ver ConstanciaBulk.tsx estadoConstancia). */
  constanciaAfipDropboxSubidaAt?: string;
  /** "Firma Digital": Contrato y Release(s) se generan con botones independientes; enviados a firmar
   *  (paso 2, "Enviar a firmar") recién cuando ambos están generados. */
  firmaContratoUrl?: string;
  firmaContratoNombre?: string;
  firmaReleases?: { releaseId: string; nombre: string; url: string }[];
  firmaGeneradoAt?: string;
  firmaReleasesGeneradoAt?: string;
  firmaEnviadaAt?: string;
  empresaContratoId?: string;
  empresaReleaseId?: string;
  nombre_empresa_contrato?: string;
  nombre_empresa_release?: string;
  /** Empresas del proyecto (con fallback a las del ABM) para el menú "Descargar con:". */
  contratoEmpresas?: { id: string; label: string }[];
  releaseEmpresas?: { id: string; label: string }[];
  // FKs para el chequeo de completitud AFIP (se resuelven contra los catálogos en el front).
  cuit?: string;
  osId?: number | null;
  categoria_sat_id?: number | null;
  sede_id?: number | null;
  tipo_contrato_id?: number | null;
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
  areaId?: string | { _id: string; name: string };
  turnos?: (string | { _id: string; name: string })[];
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
  isSystem: boolean;
  externalInfo?: {
    sedes: string[];
    rolFrames: string[];
  };
  /**
   * Solicitudes de alta pendientes que corresponden a ESTA persona (las pedidas para alguien que ya
   * es usuario). Vienen del listado para poder mostrarlas dentro de su ficha en vez de como una
   * tarjeta aparte.
   */
  solicitudesPendientes?: {
    _id: string;
    proyectos: { _id: string; name: string }[];
    startDate?: string;
    dueDate?: string;
    createdAt?: string;
  }[];
  metadata?: {
    projects?: UserProjectMetadata[];
    documento?: string;
    fullName?: string;
    isSolicitud?: boolean;
    /** Estado de la solicitud de alta (ciclo tipo Pedido). */
    solicitudStatus?: "pendiente" | "aprobada" | "rechazada" | "cancelada";
    /** Usuario real al que corresponde la solicitud (vacío si el alta es de alguien que no existe aún). */
    solicitudUserId?: string;
    roles_frame?: (string | { _id: string; name: string })[];
    activo?: boolean;
    roleFrameId?: string;
    categoriaSatId?: string;
    startDate?: string;
    dueDate?: string;
    workdaysCount?: number;
    schedule?: string;
    dailyRate?: number;
    isReplacement?: boolean;
    projectIds?: string[];
    rolesFrameIds?: (string | { _id: string; name: string })[];
    // Domicilio & Personal
    generoId?: number;
    tipoDocumentoId?: number;
    cuit?: string;
    estadoCivil?: string;
    calle?: string;
    altura?: string;
    pisoDepto?: string;
    codigoPostal?: string;
    localidad?: string;
    paisId?: number;
    nacionalidadId?: number;
    nivelEstudioId?: number;
    osId?: number;
    osPrepaga?: boolean;
    fechaNac?: string;
    telefono?: string;
    telefono2?: string;
    visa?: boolean;
    // Bancarios
    tipoEntidadFinanciera?: string;
    solicitaCreacionCuenta?: boolean;
    cuentaBancariaConfirmada?: boolean;
    cuentaBancariaConfirmadaAt?: string;
    solicitaCambioCuenta?: boolean;
    cambioCuentaConfirmada?: boolean;
    cambioCuentaConfirmadaAt?: string;
    bancoId?: number;
    cbu?: string;
    tipoDeCuentaBancaria?: string;
    nroDeCuentaBancaria?: string;
    aliasBancario?: string;
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

/** Contrato de una persona enriquecido con su proyecto, cliente y empresas (para gestionarlo cross-proyecto). */
export interface ManagedContract {
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  contratoEmpresas: { id: string; label: string }[];
  releaseEmpresas: { id: string; label: string }[];
  contractIndex: number;
  contract: Contract;
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
    isSystem: !!raw?.isSystem,
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
      areaId?: string;
      clientId?: string;
      projectId?: string;
      metadataActivo?: string;
      isSolicitud?: string;
      /** Nombre del rol (separadores flexibles), ej. "mobile-coordinador". Filtra server-side. */
      roleName?: string;
      /* Filtros del equipo de un proyecto (requieren `projectId`): se resuelven sobre el último
         contrato del miembro / su área-turno, para que la paginación sea correlativa. */
      vigencia?: string; // "vigente" | "novigente"
      tipoContrato?: string; // nombre_contrato
      estadoContrato?: string; // etiqueta del estado
      areaTurno?: string; // "__none__" | "areaId::shiftId"
      reemplazo?: string; // "con" | "sin"
      lightweight?: boolean;
      slimProjects?: boolean;
      sort?: string;
    } = {},
  ): Promise<UsersListResponse> {
    const searchParams = new URLSearchParams();

    if (params.sort) searchParams.append("sort", params.sort);
    if (params.page) searchParams.append("page", params.page.toString());
    if (params.limit) searchParams.append("limit", params.limit.toString());
    if (params.email) searchParams.append("email", params.email);
    if (params.areaId) searchParams.append("areaId", params.areaId);
    if (params.clientId) searchParams.append("clientId", params.clientId);
    if (params.projectId) searchParams.append("projectId", params.projectId);
    if (params.metadataActivo) searchParams.append("metadataActivo", params.metadataActivo);
    if (params.isSolicitud) searchParams.append("isSolicitud", params.isSolicitud);
    if (params.roleName) searchParams.append("roleName", params.roleName);
    if (params.vigencia) searchParams.append("vigencia", params.vigencia);
    if (params.tipoContrato) searchParams.append("tipoContrato", params.tipoContrato);
    if (params.estadoContrato) searchParams.append("estadoContrato", params.estadoContrato);
    if (params.areaTurno) searchParams.append("areaTurno", params.areaTurno);
    if (params.reemplazo) searchParams.append("reemplazo", params.reemplazo);
    if (params.lightweight) searchParams.append("lightweight", "true");
    if (params.slimProjects) searchParams.append("slimProjects", "true");

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

  /**
   * Contratos activos de todos los clientes/proyectos (página global "Contratos"): una fila por
   * (usuario × proyecto), mostrando su contrato vigente/más reciente. A diferencia de `list()`, acá
   * la paginación es por fila/contrato, no por usuario.
   */
  async listContractsOverview(
    params: {
      page?: number;
      limit?: number;
      search?: string;
      clientId?: string;
      projectId?: string;
      metadataActivo?: string;
      roleName?: string;
      vigencia?: string;
      tipoContrato?: string;
      estadoContrato?: string;
      reemplazo?: string;
      /** Varios estados a la vez (nombres). Lo usa Gestión de Contratos para pedirle al server solo
       *  los contratos con estado impositivo en vez de traerse el padrón entero. */
      estados?: string[];
    } = {},
  ): Promise<{ rows: ContractOverviewRow[]; total: number; page: number; totalPages: number }> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.append("page", params.page.toString());
    if (params.limit) searchParams.append("limit", params.limit.toString());
    if (params.search) searchParams.append("search", params.search);
    if (params.clientId) searchParams.append("clientId", params.clientId);
    if (params.projectId) searchParams.append("projectId", params.projectId);
    if (params.metadataActivo) searchParams.append("metadataActivo", params.metadataActivo);
    if (params.roleName) searchParams.append("roleName", params.roleName);
    if (params.vigencia) searchParams.append("vigencia", params.vigencia);
    if (params.tipoContrato) searchParams.append("tipoContrato", params.tipoContrato);
    if (params.estadoContrato) searchParams.append("estadoContrato", params.estadoContrato);
    if (params.reemplazo) searchParams.append("reemplazo", params.reemplazo);
    if (params.estados?.length) searchParams.append("estados", params.estados.join(","));

    const { data } = await axios.get(`/users/contracts-overview?${searchParams.toString()}`, { headers: this.getHeaders() });
    return {
      rows: Array.isArray(data?.rows) ? data.rows : [],
      total: Number(data?.total ?? 0),
      page: Number(data?.page ?? 1),
      totalPages: Number(data?.totalPages ?? 1),
    };
  }

  async get(id: string): Promise<User> {
    const { data } = await axios.get(`/users/${id}`, { headers: this.getHeaders() });
    return normalizeUser(data);
  }

  async create(data: { email: string; password: string; firstName?: string; lastName?: string; roles?: string[]; hireDate?: string; extraVacationDays?: number; clientIds?: string[]; projectIds?: string[]; metadata?: any }): Promise<User> {
    const { data: created } = await axios.post(`/users`, data, { headers: this.getHeaders() });
    const user = normalizeUser(created);
    emitUsersChanged("create", user._id);
    return user;
  }

  /** Genera un token de invitación y devuelve la URL pública de registro. */
  async generateRegistroLink(clientId?: string): Promise<string> {
    const { data } = await axios.post(`/auth/registro-link`, { clientId }, { headers: this.getHeaders() });
    return `${window.location.origin}/registro?token=${data.token}`;
  }

  async update(
    id: string,
    data: {
      email?: string;
      firstName?: string;
      lastName?: string;
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

  /** Confirma que la cuenta bancaria fue creada y los datos cargados (plataforma + banco). */
  async confirmarCuentaBancaria(id: string): Promise<User> {
    const { data: updated } = await axios.patch(`/users/${id}/confirmar-cuenta-bancaria`, {}, { headers: this.getHeaders() });
    const user = normalizeUser(updated);
    emitUsersChanged("update", user._id);
    return user;
  }

  /** Confirma que el cambio de datos bancarios solicitado fue aplicado en el banco/FRAME. */
  async confirmarCambioCuenta(id: string): Promise<User> {
    const { data: updated } = await axios.patch(`/users/${id}/confirmar-cambio-cuenta`, {}, { headers: this.getHeaders() });
    const user = normalizeUser(updated);
    emitUsersChanged("update", user._id);
    return user;
  }

  async remove(id: string): Promise<void> {
    await axios.delete(`/users/${id}`, { headers: this.getHeaders() });
    emitUsersChanged("delete", id);
  }

  async getDirectory(params?: { status?: "active" | "inactive" | "all" }): Promise<User[]> {
    const queryParams = params?.status ? `?status=${params.status}` : "";
    const { data } = await axios.get(`/users/directory${queryParams}`, { headers: this.getHeaders() });
    return Array.isArray(data) ? data.map(normalizeUser) : [];
  }



  /** Todos los contratos de una persona (cross-proyecto/cliente), enriquecidos para gestionarlos. */
  async getAllContracts(userId: string): Promise<ManagedContract[]> {
    const { data } = await axios.get(`/users/${userId}/all-contracts`, { headers: this.getHeaders() });
    return Array.isArray(data) ? data : [];
  }

  /** Trae las solicitudes de alta en CUALQUIER estado (pendiente/aprobada/rechazada/cancelada). */
  async listSolicitudes(): Promise<User[]> {
    const { data } = await axios.get(`/users?solicitudAny=true&limit=500`, { headers: this.getHeaders() });
    const rows: any[] = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
    return rows.map(normalizeUser);
  }

  /** Cambia el estado de una solicitud SIN borrarla. "pendiente" deshace un rechazo/cancelación. */
  async setSolicitudStatus(id: string, status: "rechazada" | "cancelada" | "pendiente"): Promise<User> {
    const { data } = await axios.patch(`/users/${id}/solicitud-status`, { status }, { headers: this.getHeaders() });
    const user = normalizeUser(data);
    emitUsersChanged("update", id);
    return user;
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
