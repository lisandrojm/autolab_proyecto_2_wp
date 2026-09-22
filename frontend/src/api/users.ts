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
  // Documento de "Alta" (ARCA o Servicios, según el Estado impositivo vinculado a la Plantilla).
  altaDocumentoUrl?: string;
  altaDocumentoNombre?: string;
  areaShiftAssignments?: {
    areaId: string | any;
    shiftIds: string[] | any[];
  }[];
}

/** Fila de la página global "Contratos" (`GET /users/contracts-overview`): usuario × proyecto, con su contrato activo. */
/** Un documento de respaldo del flujo "Sin CUIT" (extranjeros con el trámite de ARCA pendiente). */
export interface SinCuitDocumento {
  tipo: "pasaporte" | "dni_precario" | "residencia_tramite" | "cuil_provisorio" | "otro";
  numero: string;
  archivoUrl?: string;
  archivoNombre?: string;
  observaciones?: string;
  cargadoPorNombre?: string;
  cargadoAt?: string;
}

/** Estado de la validación excepcional del flujo "Sin CUIT" (ver pestaña Sin CUIT de Contratos). */
export interface SinCuitValidacion {
  documentos: SinCuitDocumento[];
  validado?: boolean;
  validadoPorNombre?: string;
  validadoAt?: string;
  /** Cuándo revisar si ya obtuvo CUIL y puede pasar al flujo normal de ARCA ("YYYY-MM-DD"). */
  fechaSeguimiento?: string;
}

export interface ContractOverviewRow {
  _id: string;
  userId: string;
  userName: string;
  /** El nombre es el que ARCA tiene registrado para el CUIT: se tomó del Padrón al validar. */
  userNombreValidadoArca?: boolean;
  userEmail: string;
  userActivo: boolean;
  /** id externo (FRAME) del usuario — para resolver a quién reemplaza otro contrato de la misma página. */
  userExternalId: number | null;
  userRoles: { _id: string; name: string; permissions?: string[] }[];
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
  /** Resultado de la última consulta al Padrón de ARCA — reemplaza al PDF como fuente de verdad. */
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
  // FKs para el chequeo de completitud ARCA (se resuelven contra los catálogos en el front).
  cuit?: string;
  /** La persona declaró NO tener CUIT/CUIL argentino: va por el circuito "Sin CUIT", no por ARCA. */
  sinCuit?: boolean;
  /** Flujo "Sin CUIT": documentación de respaldo cargada + OK manual de quien revisa. */
  sinCuitValidacion?: SinCuitValidacion | null;
  /**
   * Identidad del contrato dentro del member. Se usa para direccionarlo en los PATCH sin depender del
   * índice: la posición cambia sola si se borra otro contrato mientras la pantalla está abierta.
   */
  contratoId?: string;
  /**
   * Obra social de ESTE contrato (RNOS), no de la persona: ARCA la declara por alta (pos. 40-45) y
   * caduca sola por desregulación. Vacío no es un faltante — significa que se aplica la del convenio.
   */
  osId?: number | null;
  /** De dónde salió `osId`. Vacío = no está fijada en el contrato y la resuelve la cascada. */
  obraSocialOrigen?: "constatada" | "manual" | "heredada-usuario" | "";
  /**
   * Dónde se constató. La FUENTE es el padrón de beneficiarios de la SSS (declaración jurada de cada
   * obra social, consulta de solo lectura); ARCA queda como desempate, porque lo que precompleta
   * viene de relaciones laborales anteriores y puede estar atrasado.
   */
  obraSocialConstatadaEn?: "sss" | "arca" | "";
  /** Cuándo se constató (solo con origen `constatada`). */
  obraSocialConstatadaEl?: string;
  /**
   * Se consultó el padrón de la SSS y la persona NO figura afiliada. Es una respuesta, no un vacío:
   * el contrato queda constatado y usa la obra social del convenio.
   */
  obraSocialNoFigura?: boolean;
  /** Lo devolvió ARCA: el campo va en modo lectura y el server rechaza sobrescribirlo (409). */
  obraSocialBloqueada?: boolean;
  /** La función con la que se contrató: de ella sale la valoración de cada categoría. */
  rol_frame_id?: number | null;
  categoria_sat_id?: number | null;
  sede_id?: number | null;
  tipo_contrato_id?: number | null;
  /**
   * Sucursal del padrón de ARCA (domicilio de desempeño) con la que se declara este contrato. Se
   * elige entre las asignadas a su empresa empleadora. No tiene relación con `sede_id`.
   */
  sucursalArcaId?: string | null;
  /**
   * Actividad del domicilio elegida para ESTE contrato. Solo hace falta cuando la sucursal tiene más
   * de una actividad declarada; con una sola, el contrato la hereda y este campo queda vacío.
   */
  actividadArca?: string | null;
}

/**
 * Una fila de `GET /users/solicitudes-overview`: el equivalente de `ContractOverviewRow` para lo que
 * todavía no es un contrato.
 *
 * Una fila por SOLICITUD (no por solicitud × proyecto): `metadata.projectIds` es un array —se puede
 * pedir a la misma persona para varios proyectos en un solo pedido— y repetirla haría ver tres
 * solicitudes donde hay una. Por eso los proyectos vienen adentro, ya con su cliente resuelto.
 *
 * Los campos que dependen de un catálogo (rol frame, categoría, trámite) vienen CRUDOS: los resuelve
 * la pantalla contra el ABM, para que muestren el nombre que el catálogo tiene hoy y no el que tenía
 * el día en que se pidió el alta.
 */
export interface SolicitudOverviewRow {
  _id: string;
  nombre: string;
  email: string;
  estado: "pendiente" | "aprobada" | "rechazada" | "cancelada";
  creadaEl?: string;
  proyectos: { _id: string; name: string; clienteId: string; clienteNombre: string }[];
  roleFrameId?: any;
  rolesFrameIds?: any[] | null;
  roles_frame?: any[] | null;
  categoriaSatId?: string | null;
  tipoImpositivo?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  schedule?: string | null;
  dailyRate?: number | null;
  comentarios?: string | null;
  /** Usuario real al que corresponde, si la solicitud es para alguien que ya existe. */
  solicitudUserId?: string | null;
  /** Por qué se rechazó, para no tener que preguntarlo por afuera. */
  motivoRechazo?: string | null;
  /** Renueva un contrato por vencer (etiqueta «Renovación»). */
  esRenovacion?: boolean;
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
  /**
   * Puede quedar a cargo de un proyecto: es lo que llena el selector de responsable. Es un atributo
   * de la persona, no de sus roles —antes era el permiso `project_responsible:eligible`, que obligaba
   * a inventarle un rol a alguien para poder elegirlo—.
   */
  isProjectResponsible?: boolean;
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
  /*
    EL CONTRATO QUE RIGE, ELEGIDO EN EL SERVER (sólo en la tabla de Gestionar Equipo, `?teamTable=true`).

    Ese listado NO manda el historial: cada persona tiene 22 contratos de promedio y la tabla muestra
    uno. `lastContract` es ese uno —con la misma regla que `getContratoActivo`—, `contractCount`
    cuántos hay en total (la columna CONTRATOS) y `lastContractIndex` su posición en el array del
    UserProject, que es la que esperan editar, descargar y subir documentación.

    El historial se pide aparte, con `contratosDelProyecto`.
  */
  lastContract?: Contract | null;
  /**
   * Las dos fechas del contrato que rige HOY, con todos sus proyectos juntos (sólo en modo selector,
   * `picker`). Reemplaza a bajarse las fechas de todos los contratos de todas las personas para
   * calcularlo en el cliente. `null` = no tiene ninguno.
   */
  contratoQueRige?: { fecha_alta_contrato: string; fecha_baja_contrato: string } | null;
  contractCount?: number;
  lastContractIndex?: number;
  metadata?: {
    projects?: UserProjectMetadata[];
    documento?: string;
    fullName?: string;
    isSolicitud?: boolean;
    /** Estado de la solicitud de alta (ciclo tipo Pedido). */
    solicitudStatus?: "pendiente" | "aprobada" | "rechazada" | "cancelada";
    /** Usuario real al que corresponde la solicitud (vacío si el alta es de alguien que no existe aún). */
    solicitudUserId?: string;
    /** La solicitud RENUEVA un contrato por vencer: se muestra con la etiqueta «Renovación». */
    esRenovacion?: boolean;
    renovacionDe?: { userProjectId?: string; fechaBajaContrato?: string };
    roles_frame?: (string | { _id: string; name: string })[];
    activo?: boolean;
    roleFrameId?: string;
    categoriaSatId?: string;
    startDate?: string;
    dueDate?: string;
    workdaysCount?: number;
    /** Lo que dio el calendario (fechas × días fijos). Se guarda siempre; null con días rotativos. */
    workdaysCalculated?: number | null;
    /** `workdaysCount` se cargó a mano distinto del calculado. */
    workdaysOverridden?: boolean;
    /** Ver `MOTIVOS_AJUSTE_JORNADAS` en `utils/jornadas.ts`. */
    workdaysOverrideReason?: "extension_rodaje" | "jornada_caida" | "feriado_trabajado" | "franco_trabajado" | "alta_baja_parcial" | "reemplazo_parcial" | "otro" | null;
    workdaysOverrideNote?: string | null;
    schedule?: string;
    dailyRate?: number;
    isReplacement?: boolean;
    /*
      Lo que declara la solicitud de contratación de mobile, además de lo de arriba.

      `empleado_id_reemplezado` es el id numérico que usa el contrato y solo lo tienen las fichas
      sincronizadas de FRAME; `replacedUserId` es el `_id`, que existe siempre. Se guardan los dos.
    */
    /** Trámite declarado: alta temprana ante ARCA o locación de servicios. */
    tipoImpositivo?: "alta_temprana_afip" | "constancia_cuit";
    empleado_id_reemplezado?: string | number;
    replacedUserId?: string;
    /** Por qué falta quien se reemplaza. Es un tipo de novedad (`request-config`), no texto libre. */
    motivoReemplazoId?: string;
    /** Texto libre de quien pidió el alta. Opcional. */
    comentarios?: string;
    projectIds?: string[];
    rolesFrameIds?: (string | { _id: string; name: string })[];
    // Domicilio & Personal
    generoId?: number;
    tipoDocumentoId?: number;
    cuit?: string;
    /**
     * Cuándo se tomó el nombre del Padrón de ARCA como el bueno.
     *
     * Es un sello del ORGANISMO, no una revisión interna: afirma que `firstName`/`lastName` son
     * literalmente lo que ARCA tiene registrado para ese CUIT. Hoy lo ponen «Validar CUIT» y la
     * validación de obras sociales; más adelante, el alta por link y una validación masiva desde
     * Usuarios.
     */
    nombreValidadoArcaAt?: string;
    /** Declaró no tener CUIT/CUIL argentino (extranjeros). */
    sinCuit?: boolean;
    /** Los términos y condiciones que aceptó al registrarse con link: cuáles, qué versión, cuándo y desde dónde. */
    terminosAceptados?: { terminosId: string; version: number; titulo: string; aceptadoEl: string; ip?: string };
    estadoCivil?: string;
    calle?: string;
    altura?: string;
    pisoDepto?: string;
    codigoPostal?: string;
    localidad?: string;
    paisId?: number;
    nacionalidadId?: number;
    /** Argentino/a por naturalización, no nativo/a. Ver `esCuilObligatorio`. */
    nacionalizado?: boolean;
    /** País de nacimiento, solo para quien se declaró `nacionalizado`. */
    paisNacimientoId?: number;
    nivelEstudioId?: number;
    osId?: number;
    osPrepaga?: boolean;
    fechaNac?: string;
    telefono?: string;
    // Bancarios
    tipoEntidadFinanciera?: string;
    solicitaCreacionCuenta?: boolean;
    /** Con «No tengo Banco»: cuál de las situaciones es. Ver `MOTIVOS_SIN_BANCO` en utils/bancarios. */
    sinBancoMotivo?: "crear_cuenta" | "proveera_cuenta" | "otro" | null;
    sinBancoDetalle?: string | null;
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
    /** Nº de legajo en Tango. Estaba en el modelo del server pero faltaba acá. */
    numeroLegajoTango?: string;
    afiliadoAlSindicato?: boolean;
    /** `_id` del catálogo Sindicato. Solo con `afiliadoAlSindicato`; puede ser más de uno. */
    sindicatoIds?: string[];
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
    isProjectResponsible: !!raw?.isProjectResponsible,
    externalInfo: raw?.externalInfo,
    // Los manda el listado en modo tabla de equipo; en el resto vienen `undefined` (ver el tipo).
    // `null` (no tiene contrato) es distinto de ausente (el listado no lo manda): no colapsarlos.
    lastContract: raw?.lastContract,
    contratoQueRige: raw?.contratoQueRige,
    contractCount: typeof raw?.contractCount === "number" ? raw.contractCount : undefined,
    lastContractIndex: typeof raw?.lastContractIndex === "number" ? raw.lastContractIndex : undefined,
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
      /** Sólo solicitudes de alta, en CUALQUIER estado (pendiente/aprobada/rechazada/cancelada). */
      solicitudAny?: string;
      /** Nombre del rol (separadores flexibles), ej. "Administración". Filtra server-side. */
      roleName?: string;
      /*
        Filtro por PERMISO, que reemplaza al filtro por los dos roles Mobile que ya no existen.
        `permission` deja los que lo tienen; `notPermission`, los que no. Se resuelven server-side
        porque el cliente no puede listar /roles sin `admin_roles:view`.
      */
      permission?: string;
      notPermission?: string;
      /* Filtros del equipo de un proyecto (requieren `projectId`): se resuelven sobre el último
         contrato del miembro / su área-turno, para que la paginación sea correlativa. */
      vigencia?: string; // "vigente" | "novigente"
      tipoContrato?: string; // nombre_contrato
      estadoContrato?: string; // etiqueta del estado
      areaTurno?: string; // "__none__" | "areaId::shiftId"
      reemplazo?: string; // "con" | "sin"
      lightweight?: boolean;
      /**
       * Modo selector: nombre, mail, documento y con qué rol empresa figura en sus proyectos. Es lo
       * que necesita un buscador de personas, sin la ficha entera de cada una.
       */
      picker?: boolean;
      /** Filtro por rol empresa (uno o varios, separados por coma). Mira el vínculo, sus contratos y la ficha. */
      rolFrame?: string;
      /** Personas puntuales por _id (separados por coma): para resolver a alguien que no está en la página. */
      ids?: string;
      slimProjects?: boolean;
      /**
       * Modo tabla de equipo (requiere `projectId`): trae sólo la entrada de ESE proyecto y, de sus
       * contratos, los campos que la tabla muestra. Suma `metadata.jornadasTotales` y
       * `metadata.contratosTotales`, calculados en el server sobre todos los proyectos de la persona.
       */
      teamTable?: boolean;
      /** Columna de orden: "name" | "email" | "cuit" | "documento" | "estado" | "contratos" | "roles". */
      sort?: string;
      /** Dirección del orden. Por defecto "asc". */
      order?: "asc" | "desc";
    } = {},
  ): Promise<UsersListResponse> {
    const searchParams = new URLSearchParams();

    if (params.sort) searchParams.append("sort", params.sort);
    if (params.order) searchParams.append("order", params.order);
    if (params.page) searchParams.append("page", params.page.toString());
    if (params.limit) searchParams.append("limit", params.limit.toString());
    if (params.email) searchParams.append("email", params.email);
    if (params.areaId) searchParams.append("areaId", params.areaId);
    if (params.clientId) searchParams.append("clientId", params.clientId);
    if (params.projectId) searchParams.append("projectId", params.projectId);
    if (params.metadataActivo) searchParams.append("metadataActivo", params.metadataActivo);
    if (params.isSolicitud) searchParams.append("isSolicitud", params.isSolicitud);
    if (params.solicitudAny) searchParams.append("solicitudAny", params.solicitudAny);
    if (params.roleName) searchParams.append("roleName", params.roleName);
    if (params.vigencia) searchParams.append("vigencia", params.vigencia);
    if (params.tipoContrato) searchParams.append("tipoContrato", params.tipoContrato);
    if (params.estadoContrato) searchParams.append("estadoContrato", params.estadoContrato);
    if (params.areaTurno) searchParams.append("areaTurno", params.areaTurno);
    if (params.reemplazo) searchParams.append("reemplazo", params.reemplazo);
    if (params.permission) searchParams.append("permission", params.permission);
    if (params.notPermission) searchParams.append("notPermission", params.notPermission);
    if (params.lightweight) searchParams.append("lightweight", "true");
    if (params.picker) searchParams.append("picker", "true");
    if (params.rolFrame) searchParams.append("rolFrame", params.rolFrame);
    if (params.ids) searchParams.append("ids", params.ids);
    if (params.slimProjects) searchParams.append("slimProjects", "true");
    if (params.teamTable) searchParams.append("teamTable", "true");

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
      /** Filtro por permiso: `permission` deja los que lo tienen, `notPermission` los que no. */
      permission?: string;
      notPermission?: string;
      vigencia?: string;
      tipoContrato?: string;
      estadoContrato?: string;
      reemplazo?: string;
      /**
       * Empleadora FIJADA en el contrato. Lo usa el contexto Empresa: un alta de ARCA pertenece a la
       * empleadora que se eligió, no a las candidatas que ofrece el proyecto.
       */
      empresaContratoId?: string;
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
    if (params.empresaContratoId) searchParams.append("empresaContratoId", params.empresaContratoId);
    if (params.roleName) searchParams.append("roleName", params.roleName);
    if (params.permission) searchParams.append("permission", params.permission);
    if (params.notPermission) searchParams.append("notPermission", params.notPermission);
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

  async create(data: { email: string; password: string; firstName?: string; lastName?: string; roles?: string[]; isProjectResponsible?: boolean; hireDate?: string; extraVacationDays?: number; clientIds?: string[]; projectIds?: string[]; metadata?: any }): Promise<User> {
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
      isProjectResponsible?: boolean;
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

  /**
   * Le suma oficios (roles empresa) a la ficha de una persona, sin tocar el resto de la ficha.
   *
   * Lo usan la solicitud del móvil y el wizard de Configurar Miembro: cuando se contrata a alguien
   * puede aparecer que además hace otra cosa, y eso es un dato de la persona, no del contrato.
   * Sólo agrega; quitar se hace desde Usuarios.
   */
  async agregarRolesFrame(id: string, roleFrameIds: string[]): Promise<void> {
    if (roleFrameIds.length === 0) return;
    await axios.post(`/users/${id}/roles-frame`, { roleFrameIds }, { headers: this.getHeaders() });
    emitUsersChanged("update", id);
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



  /**
   * El historial de contratos de una persona EN UN PROYECTO, en el orden de la base.
   *
   * La tabla de Gestionar Equipo dejó de traerlo (mandaba los de las 25 filas para mostrar uno de
   * cada una); esto lo pide el modal de contratos cuando se abre el historial, para una sola persona.
   * El orden importa: la posición en el array es la que usan editar, descargar y subir el alta.
   */
  async contratosDelProyecto(userId: string, projectId: string): Promise<Contract[]> {
    const { data } = await axios.get(`/users/${userId}/contracts`, { params: { projectId }, headers: this.getHeaders() });
    return Array.isArray(data?.contracts) ? data.contracts : [];
  }

  /**
   * Cuánta gente tiene cada rol empresa, para el filtro por rol del buscador de personas.
   *
   * Lo cuenta el server con una agregación: antes se contaba en el cliente recorriendo la lista
   * completa de personas, que es justamente lo que el buscador dejó de bajarse.
   */
  async rolesFrameCounts(): Promise<{ name: string; count: number }[]> {
    const { data } = await axios.get(`/users/roles-frame-counts`, { headers: this.getHeaders() });
    return Array.isArray(data) ? data : [];
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

  /**
   * Listado GLOBAL de solicitudes, con filtros y paginado en el server (el equivalente de
   * `contracts-overview` para lo que todavía no es un contrato).
   *
   * `listSolicitudes` de arriba sigue existiendo para la pestaña de un proyecto, que necesita el
   * `User` completo para pasárselo al wizard de aprobación. Acá vuelven filas ya armadas: una por
   * solicitud, con sus proyectos y clientes resueltos.
   */
  async listSolicitudesOverview(params: { search?: string; estado?: string; clientId?: string; projectId?: string; page?: number; limit?: number } = {}): Promise<{ rows: SolicitudOverviewRow[]; total: number; page: number; totalPages: number }> {
    const sp = new URLSearchParams();
    if (params.search) sp.append("search", params.search);
    if (params.estado) sp.append("estado", params.estado);
    if (params.clientId) sp.append("clientId", params.clientId);
    if (params.projectId) sp.append("projectId", params.projectId);
    sp.append("page", String(params.page ?? 1));
    sp.append("limit", String(params.limit ?? 25));
    const { data } = await axios.get(`/users/solicitudes-overview?${sp.toString()}`, { headers: this.getHeaders() });
    return {
      rows: Array.isArray(data?.rows) ? data.rows : [],
      total: Number(data?.total ?? 0),
      page: Number(data?.page ?? 1),
      totalPages: Number(data?.totalPages ?? 1),
    };
  }

  /**
   * LA BANDEJA DE TRABAJO DE CONTRATACIÓN: cuántas solicitudes esperan una decisión y cuántos
   * contratos esperan su trámite impositivo. Son los números del menú (ver `Navbar`).
   *
   * Cada uno con su permiso del lado del server, así que van por separado y quien no tenga uno de
   * los dos recibe 403 en ése y el otro se muestra igual.
   */
  async contarSolicitudesPendientes(): Promise<number> {
    const { data } = await axios.get("/users/solicitudes-pendientes/count", { headers: this.getHeaders() });
    return Number(data?.count) || 0;
  }

  async contarContratosPendientes(): Promise<number> {
    const { data } = await axios.get("/users/contratos-pendientes/count", { headers: this.getHeaders() });
    return Number(data?.count) || 0;
  }

  /**
   * Cambia el estado de una solicitud SIN borrarla. "pendiente" deshace un rechazo/cancelación.
   *
   * El `motivo` es el del rechazo: se guarda con la solicitud para que quien la pidió sepa qué
   * corregir. Volver a "pendiente" lo borra, así no queda colgada una objeción que ya no rige.
   */
  async setSolicitudStatus(id: string, status: "rechazada" | "cancelada" | "pendiente", motivo?: string): Promise<User> {
    const { data } = await axios.patch(`/users/${id}/solicitud-status`, { status, motivo }, { headers: this.getHeaders() });
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

  /**
   * BORRA la solicitud (no la persona). Una aprobada sólo desde el panel, y se lleva con ella el
   * contrato que creó al aprobarse: `contrato` dice cuál se borró, o que no se encontró.
   *
   * Va a `/users/:id/solicitud` y no a `/users/:id`: ese borra personas y pide permiso de
   * administración. Este además deshace lo que la solicitud dejó —la decisión de renovación, que si no
   * deja el contrato fuera de «Por vencer» esperando un pedido que ya no existe, y sus avisos— y lo
   * puede usar quien la pidió desde la app.
   */
  async eliminarSolicitud(id: string): Promise<ResultadoEliminarSolicitud> {
    const { data } = await axios.delete(`/users/${id}/solicitud`, { headers: this.getHeaders() });
    emitUsersChanged("delete", id);
    return data || {};
  }

  /**
   * Dónde está el contrato que creó una solicitud APROBADA, para abrirlo y corregirlo. Si no se
   * encuentra, el server contesta 404 con el motivo.
   */
  async contratoDeSolicitud(id: string): Promise<{ projectId: string; userId: string; contractIndex: number }> {
    const { data } = await axios.get(`/users/${id}/solicitud/contrato`, { headers: this.getHeaders() });
    return data;
  }
}

/** Qué pasó con el contrato al eliminar una solicitud APROBADA. Sin `contrato`: no era una aprobada. */
export interface ResultadoEliminarSolicitud {
  contrato?: { borrado: boolean; proyecto?: string; desde?: string; hasta?: string };
}

export const usersAPI = new UsersAPI();
