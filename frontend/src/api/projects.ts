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

// Removed WorkSchedule types

export interface Project {
  _id: string;

  /** ← ahora viaja como OBJETO, no como tenantId string */
  tenant?: TenantRef;

  /** puede venir como string o como objeto ligero del cliente */
  clientId: string | { _id: string; name?: string };

  /** ObjectIds de las empresas (colección companies) para el contrato / release */
  contratoEmpresas?: string[];
  /**
   * Los convenios bajo los que contrata este proyecto. Cuelgan de `contratoEmpresas`.
   *
   * Vacío = «todavía no se acotó», no «ninguno»: el alta ofrece entonces todos los de la empresa.
   */
  convenioIds?: string[];
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
    areaId?: string | any;
    shiftId?: string | any;
    /** El área y turno de esta persona DENTRO del proyecto. Es de donde lee la jerarquía quién trabaja en qué. */
    areaShiftAssignments?: {
      areaId: string | any;
      shiftIds: (string | any)[];
    }[];
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
  /** Todas sus combinaciones "areaId::shiftId" en el proyecto, sin importar el área consultada. */
  claves?: string[];
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

  async list(params: { q?: string; page?: number; limit?: number; slim?: boolean } = {}): Promise<ProjectsListResponse> {
    const sp = new URLSearchParams();
    if (params.q) sp.append("q", params.q);
    if (params.page) sp.append("page", String(params.page));
    if (params.limit) sp.append("limit", String(params.limit));
    // `slim`: sólo nombre, cliente, estado y las empresas/convenios del proyecto. Para elegir uno de
    // una lista; sin áreas, turnos, coordinadores ni las resoluciones de sede y centro de costo.
    if (params.slim) sp.append("slim", "true");

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

  /**
   * OJO CON EL `limit`: el server lo capea a 100 (`GET /projects`, "Cap limit to 100 to prevent
   * OOM/Timeouts"). Pedir 500 no trae 500, trae 100 — y el resto sale por paginación.
   *
   * Esas páginas restantes iban de a una, encadenadas con `await`: con unos cientos de proyectos
   * eran varias idas y vueltas en serie, cada una con todos los populates del listado. Van juntas;
   * el orden se mantiene porque se reensamblan por índice, no por orden de llegada. Si alguna
   * choca contra el límite de 200 req/min, el interceptor la reintenta respetando `Retry-After`.
   */
  /**
   * Todos los proyectos visibles. Con `slim` viene sólo lo necesario para elegir uno de una lista y
   * el server devuelve todo en una sola página, así que ni siquiera se pagina.
   */
  async listAll(params: { q?: string; limit?: number; slim?: boolean } = {}): Promise<Project[]> {
    const pageSize = params.limit ?? 200;
    const primera = await this.list({ ...params, page: 1, limit: pageSize });

    const totalPages = primera.pagination?.pages ?? 1;
    if (totalPages <= 1) return primera.projects;

    const restantes = await Promise.all(Array.from({ length: totalPages - 1 }, (_, i) => this.list({ ...params, page: i + 2, limit: pageSize })));
    return [...primera.projects, ...restantes.flatMap((r) => r.projects)];
  }

   async createProject(
    clientId: string,
    data: {
      name: string;
      description?: string;
      objectives?: string[];
      targetAudience?: string;
      contratoEmpresas?: string[];
      convenioIds?: string[];
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

  /**
   * `team: "ids"` trae `assignedUsers` como ids pelados en lugar de las personas con su historial
   * de contratos. Poblar el equipo es lo caro de este endpoint —proyectos grandes se iban a más de
   * 60 s y cortaban por timeout— y las pantallas del panel solo necesitan cuántos son y quiénes,
   * porque el equipo real lo cargan por su endpoint paginado. El móvil sí necesita los datos
   * (los usa de fallback cuando el coordinador recibe 403 en `/users`), así que el default es poblar.
   */
  async getProject(projectId: string, opts?: { team?: "full" | "ids" }): Promise<Project> {
    const resp = await axios.get(`/projects/${projectId}`, {
      headers: this.getHeaders(),
      params: opts?.team === "ids" ? { team: "ids" } : undefined,
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

  /** El mismo detalle (estado, vigencia, alta/baja) para TODO el equipo del proyecto, tenga área o no. */
  async getProjectMembersStatus(projectId: string): Promise<AreaShiftMember[]> {
    const resp = await axios.get(`/projects/${projectId}/area-shift-members?todos=true`, {
      headers: this.getHeaders(),
    });
    return resp.data?.members || [];
  }

  async updateProject(
    projectId: string,
    data: {
      name?: string;
      description?: string;
      objectives?: string[];
      targetAudience?: string;
      contratoEmpresas?: string[];
      convenioIds?: string[];
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

  /**
   * Cambia el área y turno de UNA persona del equipo, sin tocar el resto de su configuración.
   *
   * Lo usa el tab de jerarquía al arrastrar. No reescribe `teamConfig` entero —así dos personas pueden
   * acomodar el mismo equipo sin pisarse— y no toca contratos.
   */
  async asignarAreasDeMiembro(projectId: string, userId: string, areaShiftAssignments: { areaId: string; shiftIds: string[] }[]): Promise<void> {
    await axios.patch(`/projects/${projectId}/team-config/${userId}/areas`, { areaShiftAssignments }, { headers: this.getHeaders() });
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
    const project = await this.getProject(projectId, { team: "ids" });
    const clientId = typeof project.clientId === "string" ? project.clientId : project.clientId._id;
    emitProjectsChanged("update", projectId, clientId);
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    await axios.delete(`/projects/${projectId}/members/${userId}`, {
      headers: this.getHeaders(),
    });
    const project = await this.getProject(projectId, { team: "ids" });
    const clientId = typeof project.clientId === "string" ? project.clientId : project.clientId._id;
    emitProjectsChanged("update", projectId, clientId);
  }

  /** Elimina un contrato puntual (por índice) de la persona en un proyecto. */
  async deleteMemberContract(projectId: string, userId: string, index: number): Promise<void> {
    await axios.delete(`/projects/${projectId}/members/${userId}/contracts/${index}`, {
      headers: this.getHeaders(),
    });
  }

  /** Actualiza SOLO la Empresa del Contrato de un contrato puntual (por índice), sin abrir el wizard
   *  completo de "Configurar Miembro". Pasar "" para desasignarla. */
  async updateContratoEmpresa(
    projectId: string,
    userId: string,
    contractIndex: number,
    empresaContratoId: string,
  ): Promise<{
    empresaContratoId: string | null;
    nombre_empresa_contrato: string;
    /** La obra social del contrato ya no está registrada por la empleadora NUEVA. Es aviso, no bloqueo. */
    avisoObraSocial?: string;
    /** Al quitar la empleadora se borró la validación de la obra social: sin CUIT no tiene sujeto. */
    obraSocialLimpiada?: boolean;
  }> {
    const { data } = await axios.patch(`/projects/${projectId}/members/${userId}/contracts/${contractIndex}/empresa-contrato`, { empresaContratoId }, { headers: this.getHeaders() });
    return data;
  }

  /**
   * Elige la Sucursal de ARCA (domicilio de desempeño) de un contrato puntual. El server valida que
   * esté asignada a la empresa del contrato. Al cambiarla se limpia la actividad elegida, porque las
   * actividades son de la sucursal. Pasar "" para desasignarla.
   */
  async updateSucursalArca(projectId: string, userId: string, contractIndex: number, sucursalArcaId: string): Promise<{ sucursalArcaId: string | null; actividadArca: string }> {
    const { data } = await axios.patch(`/projects/${projectId}/members/${userId}/contracts/${contractIndex}/sucursal-arca`, { sucursalArcaId }, { headers: this.getHeaders() });
    return data;
  }

  /**
   * Fija la obra social de UN contrato (RNOS, pos. 40-45 del TXT).
   *
   * `obraSocialId: null` la desfija y vuelve a resolver por la cascada (convenio → excepción de la
   * empresa → excluidos), que es el caso normal. El server valida que esté entre las registradas por
   * la empleadora: la SSS no sabe nada de la empresa y puede devolver una que ARCA le rechace.
   */
  async updateObraSocialContrato(
    projectId: string,
    userId: string,
    contractIndex: number,
    /**
     * `noFigura: true` registra que se consultó y NO hay obra social registrada para esa persona. Es
     * una respuesta, no un vacío: se guarda sin obra social —corresponde la del convenio— pero
     * sellando la fecha, así el contrato deja de pedir que se vuelva a consultar.
     *
     * `forzar: true` sobrescribe un valor ya sellado en ARCA, que por defecto es inmutable (el server
     * contesta 409). Solo se manda después de una confirmación explícita de quien lo usa.
     */
    payload: ({ obraSocialId: number | null; origen: "constatada" | "manual"; constatadaEn?: "sss" | "arca" } | { noFigura: true; constatadaEn: "sss" | "arca" }) & { forzar?: boolean },
  ): Promise<{ obraSocialId: number | null; obraSocialOrigen: string; obraSocialConstatadaEn: string; obraSocialConstatadaEl: string; obraSocialNoFigura?: boolean }> {
    const { data } = await axios.patch(`/projects/${projectId}/members/${userId}/contracts/${contractIndex}/obra-social`, payload, { headers: this.getHeaders() });
    return data;
  }

  /**
   * Aplica de una vez lo que ARCA devolvió para una tanda de CUIL.
   *
   * `rnos` vacío = ARCA no devolvió obra social para ese CUIL: se registra como consultado y rige la
   * del convenio. Es una respuesta, no una fila que falte.
   */
  async aplicarObrasSocialesLote(
    empresaId: string,
    /** `nombreArca`: el nombre que ARCA mostró en la misma pantalla, para que el server lo compare
     *  con el guardado sin tener que volver a preguntarle al padrón por cada persona. */
    filas: Array<{ cuil: string; rnos: string; nombreArca?: string }>,
    /** `true` calcula el mismo resultado sin escribir nada: es la previsualización. */
    previsualizar?: boolean,
  ): Promise<{
    aplicados: number;
    contratosAlcanzados: number;
    sinContrato: string[];
    rnosDesconocido: Array<{ cuil: string; rnos: string }>;
    noRegistrada: Array<{ cuil: string; rnos: string; nombre: string }>;
    yaBloqueados: string[];
    noFigura: number;
    previsualizacion: boolean;
  }> {
    const { data } = await axios.post(`/projects/obras-sociales/aplicar-lote`, { empresaId, filas, previsualizar: !!previsualizar }, { headers: this.getHeaders() });
    return data;
  }

  /**
   * Dispara la validación contra ARCA DESDE EL SERVIDOR.
   *
   * No hace falta instalar nada ni dejar ninguna ventana abierta: el VPS abre su propio Chromium y
   * entra con el usuario delegado de clave fiscal. Vuelve enseguida — la corrida dura minutos y se
   * sigue con `estadoValidacionServidor`.
   *
   * Los CUIL NO se mandan desde acá: los resuelve el server con la misma función que alimenta el
   * contador de la grilla. Mandarlos permitiría validar a alguien que la pantalla nunca mostró.
   */
  /**
   * Arranca la corrida en el servidor.
   *
   * `cuils` ACOTA: el server sigue decidiendo quién está pendiente y solo se queda con la
   * intersección, así que mandar de más no valida a nadie que la pantalla no haya mostrado. Omitirlo
   * corre a todos los pendientes de la empleadora.
   */
  async validarObrasSocialesEnServidor(empresaId: string, cuils?: string[]): Promise<{ arrancada: true; total: number }> {
    const { data } = await axios.post(`/contratos/obras-sociales/validar-servidor`, { empresaId, cuils }, { headers: this.getHeaders() });
    return data;
  }

  /**
   * El estado de la corrida. Se consulta por polling.
   *
   * Trae TODOS los eventos y no solo los nuevos: una pantalla que se abre a mitad de camino tiene que
   * ver lo que ya pasó en vez de arrancar en blanco.
   */
  async estadoValidacionServidor(): Promise<{
    hay: boolean;
    corriendo: boolean;
    empresaId?: string;
    total?: number;
    arrancadaEl?: string;
    eventos: Array<Record<string, any>>;
  }> {
    const { data } = await axios.get(`/contratos/obras-sociales/validar-servidor`, { headers: this.getHeaders() });
    return data;
  }

  /** Corta la corrida. Lo ya validado queda guardado: se aplica de a una persona. */
  async detenerValidacionServidor(): Promise<{ detenida: boolean }> {
    const { data } = await axios.post(`/contratos/obras-sociales/validar-servidor/detener`, {}, { headers: this.getHeaders() });
    return data;
  }

  /**
   * Saca la obra social de varios contratos de una vez. Cada uno vuelve a quedar SIN VALIDAR.
   *
   * Es un endpoint y no un bucle de `updateObraSocialContrato` por el mismo motivo que
   * `aplicarObrasSocialesLote`: veinte requests desde el navegador dejan el resultado a mitad de
   * camino ante cualquier corte, y sin forma de saber cuáles entraron. En algo que BORRA, quedarse
   * sin saber qué se borró es el peor final posible.
   *
   * Devuelve los que no se pudieron tocar con su motivo, para poder decir qué pasó con cada uno.
   */
  async quitarObrasSocialesLote(contratos: Array<{ projectId: string; userId: string; contratoId: string }>): Promise<{
    quitados: number;
    fallidos: Array<{ projectId: string; userId: string; contratoId: string; motivo: string }>;
  }> {
    const { data } = await axios.post(`/projects/obras-sociales/quitar-lote`, { contratos }, { headers: this.getHeaders() });
    return data;
  }

  /**
   * Elige la actividad del domicilio de desempeño de un contrato puntual. Solo hace falta cuando la
   * sucursal tiene más de una actividad declarada; con una sola se hereda. Pasar "" para desasignarla.
   */
  async updateActividadArca(projectId: string, userId: string, contractIndex: number, actividadArca: string): Promise<{ actividadArca: string }> {
    const { data } = await axios.patch(`/projects/${projectId}/members/${userId}/contracts/${contractIndex}/actividad-arca`, { actividadArca }, { headers: this.getHeaders() });
    return data;
  }

  /**
   * Cambia la categoría profesional de un contrato, desde «Datos ARCA».
   *
   * El server recalcula los sueldos derivados (neto, bruto, diario, diferencia) y devuelve los
   * valores nuevos: guardar solo el id dejaría la categoría de un convenio con el sueldo de otro.
   */
  async updateCategoriaSat(projectId: string, userId: string, contractIndex: number, categoriaSatId: number | null): Promise<{ categoria_sat_id: number | null; nombre_categoria_sat: string; sueldo_neto: number; sueldo_bruto: number; sueldo_diario_neto: number; diferencia_diaria_neto: number }> {
    const { data } = await axios.patch(`/projects/${projectId}/members/${userId}/contracts/${contractIndex}/categoria-sat`, { categoriaSatId }, { headers: this.getHeaders() });
    return data;
  }

  /** Igual que `updateContratoEmpresa`, pero para la Empresa del Release (no es obligatoria). */
  async updateReleaseEmpresa(projectId: string, userId: string, contractIndex: number, empresaReleaseId: string): Promise<{ empresaReleaseId: string | null; nombre_empresa_release: string }> {
    const { data } = await axios.patch(`/projects/${projectId}/members/${userId}/contracts/${contractIndex}/empresa-release`, { empresaReleaseId }, { headers: this.getHeaders() });
    return data;
  }

  /** Sube (o reemplaza) el PDF de "Alta" (ARCA/Servicios) de un contrato puntual (por índice). */
  async uploadAltaDocumento(projectId: string, userId: string, contractIndex: number, file: File): Promise<{ altaDocumentoUrl: string; altaDocumentoNombre: string }> {
    const formData = new FormData();
    formData.append("document", file);
    // Sin headers explícitos: el interceptor global de axios pone Authorization/X-Tenant-Id y deja que
    // el browser setee el Content-Type multipart con el boundary (getHeaders() fuerza JSON y rompe esto).
    const { data } = await axios.patch(`/projects/${projectId}/members/${userId}/contracts/${contractIndex}/alta-documento`, formData);
    return data;
  }
}

export const projectsAPI = new ProjectsAPI();
