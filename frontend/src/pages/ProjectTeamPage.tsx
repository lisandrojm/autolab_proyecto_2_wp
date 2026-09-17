import React, { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import axios from "../api/axiosConfig";
import { projectsAPI, Project, AreaShiftMembersResponse } from "../api/projects";
import { usersAPI, User, Contract } from "../api/users";
import { useAuthStore } from "../stores/authStore";
import { sweetAlert } from "../utils/sweetAlert";

import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { UserCard } from "../components/users/UserCard";
import { Modal } from "../components/ui/Modal";
import { InfoModal } from "../components/ui/InfoModal";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";

import { getHelp } from "../data/help/helpContent";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers, faSearch, faFilter, faTrash, faBriefcase, faClock, faGrip, faTable, faPlus, faEdit, faIdCard, faUmbrellaBeach, faClipboardList, faUserTie, faLayerGroup, faUserShield, faUserGraduate, faBuilding, faFileContract, faInfoCircle, faTriangleExclamation, faChevronDown, faXmark, faChevronLeft, faChevronRight, faSitemap } from "@fortawesome/free-solid-svg-icons";
import { vacationsAPI, VacationRequest } from "../api/vacations";
import { TeamSolicitudesTab } from "../components/team/TeamSolicitudesTab";
import { TeamCoordinadoresTab } from "../components/team/TeamCoordinadoresTab";
import { TeamJerarquiaTab } from "../components/team/TeamJerarquiaTab";
import { EmployeeContractsModal } from "../components/team/EmployeeContractsModal";
import { DiasDeTrabajo, faltaDefinirDias, DIAS_SEMANA } from "../components/contratos/DiasDeTrabajo";
import { JornadasSolicitud } from "../components/contratacion/JornadasSolicitud";
import { ImportesDelContrato } from "../components/contratacion/ImportesDelContrato";
import { SelectorHora } from "../components/contratacion/SelectorHora";
import { horarioDentroDelTurno, horasDelHorario, sumarMinutos } from "../utils/horario";
import { erroresDeJornadas, jornadasDelCalendario, mesesEquivalentes } from "../utils/jornadas";
import { EstadoBadge, EstadoSecundarioBadge, estadoLabel } from "../components/EstadoSelect";
import { estadoImpositivoDelContrato } from "../components/team/ContractCard";
import { esContratoVigente, getContratoActivo } from "../utils/contratoVigencia";
import { contratoFrameAPI, ContratoFrameItem } from "../api/contratosFrame";
import { TipoImpositivo, esTipoImpositivo, estadosImpositivos, estadoImpositivoPorTipo, tipoImpositivoDeContrato } from "../utils/tramiteImpositivo";
import { TipoContratoSelect } from "../components/contratos/TipoContratoSelect";
// «Coordinador» pasó a ser un permiso (cargar novedades), no el nombre de un rol. Ver ese módulo.
import { coordinaAreas, PROJECT_COORDINATOR } from "../utils/permisosMobile";
import { contratosAPI, ContratoItem } from "../api/contratos";
import { releasesAPI, Release } from "../api/release";
import { companiesAPI, Company } from "../api/companies";
import { createSimpleCatalogApi, SimpleCatalogItem } from "../api/simpleCatalog";
import { Area, areasAPI } from "../api/areas";
import { userProjectsAPI } from "../api/userProjects";
import { shiftsAPI, Shift } from "../api/shifts";
import { clientsAPI } from "../api/clients";
import { infoAPI, InfoItem } from "../api/info";
import { categoriaSatAPI, CategoriaSatItem } from "../api/categoriasSat";
import { roleFrameAPI, RoleFrameItem } from "../api/roleFrames";
import { fuzzyMatch } from "../utils/searchHelpers";
// La cadena empleadora → convenio → categoría vive acá, compartida con la solicitud del móvil.
import { categoriasOfrecidas, codigosDeConveniosDeLaEmpleadora, conveniosOfrecidos } from "../utils/seleccionConvenioCategoria";
import { cachedFetch } from "../utils/refCache";

const HELP_KEY = "projectTeam" as const;

// Formatea una fecha de contrato (ISO "YYYY-MM-DD...") a d/m/yyyy sin corrimiento de zona horaria.
function formatContractDate(d?: string): string {
  if (!d) return "—";
  const iso = String(d).substring(0, 10);
  const parts = iso.split("-");
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    return `${Number(parts[2])}/${Number(parts[1])}/${parts[0]}`;
  }
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString();
}

/*
  Se filtra por lo que la persona PUEDE HACER en la app, no por cómo se llama su rol.

  Antes el valor viajaba como `roleName=mobile-<value>` y matcheaba el nombre completo del rol
  tolerando el separador ("Mobile-Coordinador", "Mobile Coordinador", …). Esos dos roles dejaron de
  ser fijos: cualquiera puede armar los suyos y llamarlos como quiera, así que buscar por nombre
  vaciaba el filtro sin decir por qué. Lo que se quiere separar es quién carga las novedades del
  equipo, y eso es un permiso.
*/
const MOBILE_ROLE_OPTIONS = [
  { value: "con", label: "Supervisa áreas" },
  { value: "sin", label: "No supervisa" },
];

function numeroALetras(num: number): string {
  const Unidades = (num: number): string => {
    switch (num) {
      case 1:
        return "UN";
      case 2:
        return "DOS";
      case 3:
        return "TRES";
      case 4:
        return "CUATRO";
      case 5:
        return "CINCO";
      case 6:
        return "SEIS";
      case 7:
        return "SIETE";
      case 8:
        return "OCHO";
      case 9:
        return "NUEVE";
      default:
        return "";
    }
  };

  const Decenas = (num: number): string => {
    const unidad = num % 10;
    const decena = Math.floor(num / 10);
    switch (decena) {
      case 1:
        switch (unidad) {
          case 0:
            return "DIEZ";
          case 1:
            return "ONCE";
          case 2:
            return "DOCE";
          case 3:
            return "TRECE";
          case 4:
            return "CATORCE";
          case 5:
            return "QUINCE";
          default:
            return "DIECI" + Unidades(unidad);
        }
      case 2:
        if (unidad === 0) return "VEINTE";
        return "VEINTI" + Unidades(unidad);
      case 3:
        return "TREINTA" + (unidad > 0 ? " Y " + Unidades(unidad) : "");
      case 4:
        return "CUARENTA" + (unidad > 0 ? " Y " + Unidades(unidad) : "");
      case 5:
        return "CINCUENTA" + (unidad > 0 ? " Y " + Unidades(unidad) : "");
      case 6:
        return "SESENTA" + (unidad > 0 ? " Y " + Unidades(unidad) : "");
      case 7:
        return "SETENTA" + (unidad > 0 ? " Y " + Unidades(unidad) : "");
      case 8:
        return "OCHENTA" + (unidad > 0 ? " Y " + Unidades(unidad) : "");
      case 9:
        return "NOVENTA" + (unidad > 0 ? " Y " + Unidades(unidad) : "");
      default:
        return Unidades(num);
    }
  };

  const Centenas = (num: number): string => {
    const decenas = num % 100;
    const centenaDigito = Math.floor(num / 100);
    switch (centenaDigito) {
      case 1:
        if (decenas === 0) return "CIEN";
        return "CIENTO " + Decenas(decenas);
      case 2:
        return "DOSCIENTOS " + Decenas(decenas);
      case 3:
        return "TRESCIENTOS " + Decenas(decenas);
      case 4:
        return "CUATROCIENTOS " + Decenas(decenas);
      case 5:
        return "QUINIENTOS " + Decenas(decenas);
      case 6:
        return "SEISCIENTOS " + Decenas(decenas);
      case 7:
        return "SETECIENTOS " + Decenas(decenas);
      case 8:
        return "OCHOCIENTOS " + Decenas(decenas);
      case 9:
        return "NOVECIENTOS " + Decenas(decenas);
      default:
        return Decenas(num);
    }
  };

  const Seccion = (num: number, divisor: number, strSingular: string, strPlural: string): string => {
    const cientos = Math.floor(num / divisor);
    let letras = "";

    if (cientos > 0) {
      if (cientos > 1) {
        letras = Centenas(cientos) + " " + strPlural;
      } else {
        letras = strSingular;
      }
    }

    return letras;
  };

  const Miles = (num: number): string => {
    const divisor = 1000;
    const resto = num % divisor;
    let strMiles = Seccion(num, divisor, "MIL", "MIL");
    let strCentenas = Centenas(resto);

    if (strMiles === "") return strCentenas;
    if (strMiles === "UN MIL") strMiles = "MIL";
    if (strCentenas === "") return strMiles;
    return strMiles + " " + strCentenas;
  };

  const Millones = (num: number): string => {
    const divisor = 1000000;
    const resto = num % divisor;
    let strMillones = Seccion(num, divisor, "UN MILLÓN", "MILLONES");
    let strMiles = Miles(resto);

    if (strMillones === "") return strMiles;
    if (strMiles === "") return strMillones;
    return strMillones + " " + strMiles;
  };

  const entero = Math.floor(num);
  const centavosVal = Math.round((num - entero) * 100);
  const centavosStr = centavosVal.toString().padStart(2, "0") + "/100";

  if (entero === 0) {
    return "CERO " + centavosStr;
  }

  return (Millones(entero) + " " + centavosStr).replace(/\s+/g, " ").trim();
}

export const ProjectTeamPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuthStore();

  // Help
  // Help
  const [openInfo, setOpenInfo] = useState(false);
  const [openCoordinadoresInfo, setOpenCoordinadoresInfo] = useState(false);
  const [openCoordCountInfo, setOpenCoordCountInfo] = useState(false);
  const helpEntry = getHelp(HELP_KEY);

  // Data
  const [project, setProject] = useState<Project | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // --- Paginación server-side del Equipo (misma lógica que Usuarios) ---
  // allUsers = equipo completo pero liviano (para Coordinadores/contadores/lookups).
  // teamRows = página actual con datos completos que se muestra en la tabla.
  const TEAM_PAGE_SIZE = 25;
  const [teamRows, setTeamRows] = useState<User[]>([]);
  const [teamPage, setTeamPage] = useState(1);
  const [teamTotal, setTeamTotal] = useState(0);
  const [teamTotalPages, setTeamTotalPages] = useState(1);
  const [teamFetching, setTeamFetching] = useState(false);
  const teamReqIdRef = React.useRef(0);
  const [candidateUsers, setCandidateUsers] = useState<User[]>([]);
  const [searchingCandidates, setSearchingCandidates] = useState(false);
  // Paginación server-side del listado de candidatos (Agregar Miembros).
  const CAND_PAGE_SIZE = 25;
  const [candPage, setCandPage] = useState(1);
  const [candTotal, setCandTotal] = useState(0);
  const [candTotalPages, setCandTotalPages] = useState(1);
  const candReqIdRef = React.useRef(0);
  const [loading, setLoading] = useState(true);
  const [teamConfig, setTeamConfig] = useState<any[]>([]);
  // Personas por área+turno exacto ("areaId::shiftId" → cantidad). Viene del server porque el
  // equipo se lista paginado y acá solo tenemos la página actual.
  const [areaShiftCounts, setAreaShiftCounts] = useState<Record<string, number>>({});
  // Quiénes son, por combinación: permite totalizar un área sin repetir a quien está en varios turnos.
  const [areaShiftUserIds, setAreaShiftUserIds] = useState<Record<string, string[]>>({});
  // Detalle (modal) de las personas de un área+turno: qué combinación se está viendo y sus filas.
  // `shift` en null = el área, acotada a los turnos de `shifts` (los que coordina esa persona).
  const [viewingAreaShift, setViewingAreaShift] = useState<{ areaId: string; areaName: string; shift: any | null; shifts?: any[] } | null>(null);
  const [areaShiftMembers, setAreaShiftMembers] = useState<AreaShiftMembersResponse | null>(null);
  const [loadingAreaShiftMembers, setLoadingAreaShiftMembers] = useState(false);
  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [allAreas, setAllAreas] = useState<Area[]>([]);
  const [allClients, setAllClients] = useState<any[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allSedes, setAllSedes] = useState<InfoItem[]>([]);
  // Catálogo REAL de Categorías (aplanado desde `categorias` + `convenio-grupos`, el mismo que
  // consume el TXT de ARCA). OJO: NO usar infoAPI.listByType("categoria-sat") → esa colección está vacía.
  const [allCategoriasSat, setAllCategoriasSat] = useState<CategoriaSatItem[]>([]);
  // Catálogo de Convenios: solo para traducir los `convenioIds` de la empresa (que son refs) al
  // código de CCT ("0634/11") con el que se filtra qué categorías puede elegir el contrato.
  const [allConvenios, setAllConvenios] = useState<SimpleCatalogItem[]>([]);
  const [allEstados, setAllEstados] = useState<InfoItem[]>([]);
  const [allTiposContrato, setAllTiposContrato] = useState<InfoItem[]>([]);
  const [allRoleFrames, setAllRoleFrames] = useState<RoleFrameItem[]>([]);
  // Contratos (tipo real: jornadas/multiplicador/tiempo indeterminado) — lo que elige el wizard como
  // "Tipo de Contrato". Cada uno resuelve a una Plantilla (`contratoFrames`) para generar el PDF.
  const [contratos, setContratos] = useState<ContratoItem[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [userLookup, setUserLookup] = useState<Map<number | string, string>>(new Map());

  // Filters
  const [searchTerm, setSearchTerm] = useState(""); // For Disponibles (Modal)
  const [filterRole, setFilterRole] = useState(""); // Filter by Role
  const [filterRoleFrame, setFilterRoleFrame] = useState(""); // Filter by Role Frame
  const [filterProject, setFilterProject] = useState(""); // Filter by Project
  const [showFilters, setShowFilters] = useState(false); // Toggle filters UI
  const [searchTermTeam, setSearchTermTeam] = useState(""); // For Equipo Actual
  const [filterUserStatus, setFilterUserStatus] = useState<string>("");
  const [filterVigencia, setFilterVigencia] = useState<string>(""); // "" | "vigente" | "novigente" (client-side sobre la página)
  const [filterTipoContrato, setFilterTipoContrato] = useState<string>(""); // nombre_contrato (client-side sobre la página)
  const [filterAreaTurno, setFilterAreaTurno] = useState<string>(""); // "" | "__none__" | "areaId::shiftId" (client-side sobre la página)
  const [filterEstadoContrato, setFilterEstadoContrato] = useState<string>(""); // nombre_estado_empleado (client-side sobre la página)
  const [filterRolMobile, setFilterRolMobile] = useState<string>(""); // "" | "colaborador" | "coordinador" (server-side, paginado)
  const [filterReemplazo, setFilterReemplazo] = useState<string>(""); // "" | "con" | "sin" (server-side, paginado)
  // Dos pasos: Contrato y Sueldo. «Extras» (sede y observaciones) se sacó: la sede sale del proyecto.
  // Un solo formulario, como la solicitud de la app: el paso quedó sólo para resetear al abrir.
  const [, setWizardStep] = useState<1 | 2>(1);
  const [selectedUserForWizard, setSelectedUserForWizard] = useState<User | null>(null);
  const [showEstadoInfo, setShowEstadoInfo] = useState(false);
  // Índice (en el array original de contracts del UserProject) del contrato que se está editando desde el
  // modal de contratos. null = no se edita uno puntual (alta nueva o edición genérica → se toca el último).
  const [editingContractIndex, setEditingContractIndex] = useState<number | null>(null);
  // Si el wizard se abrió para APROBAR una solicitud, guardamos su id: al guardar, el backend marca la
  // solicitud como aprobada. null = alta/edición normal.
  const [approvingSolicitudId, setApprovingSolicitudId] = useState<string | null>(null);
  // Se incrementa tras aprobar para que la pestaña Solicitudes recargue su lista.
  const [solicitudesRefresh, setSolicitudesRefresh] = useState(0);
  const [viewingShiftsData, setViewingShiftsData] = useState<{ user: User; areaId: string; areaName: string } | null>(null);

  /* ------------------------- Convenio: FILTRO, no dato -------------------------
   * El CCT no se guarda en ninguna parte: ARCA lo deduce de la categoría profesional, y el TXT lo
   * manda en blanco (pos. 91-100). Esto existe porque el encuadre lo terminaba decidiendo quien cargó
   * las categorías de la función Frame: de 85 funciones, 78 ofrecen un solo convenio, así que
   * convenios que la empleadora SÍ tiene registrados ante ARCA —y que el organismo acepta— eran
   * inalcanzables desde el wizard.
   *
   * VIVE FUERA DE `wizardData` A PROPÓSITO. El guardado manda `{ ...wizardData }`, así que un campo
   * puesto ahí se persistiría solo, en silencio, y este no tiene que persistirse.
   *
   * `""` = todos los convenios de la empleadora.
   */
  const [convenioFiltro, setConvenioFiltro] = useState<string>("");
  /** Ignora el filtro por función Frame y ofrece TODAS las categorías del convenio elegido. */
  const [verTodasDelConvenio, setVerTodasDelConvenio] = useState(false);
  /** Aviso inline cuando el cambio de convenio dejó sin efecto la categoría que estaba elegida. */
  const [avisoConvenio, setAvisoConvenio] = useState("");

  /*
    POR QUÉ VÍA SE CONTRATA: filtra los tipos de contrato por su trámite impositivo.

    La lista de tipos mezcla los que van por alta temprana ante ARCA con los que van por locación de
    servicios, y de un vistazo no se distinguen: son todos nombres de contrato. Quien viene
    aprobando una solicitud ya sabe por cuál de las dos vías se pidió contratar —lo declaró quien la
    cargó desde mobile—, así que el filtro arranca en esa, y el resto de los tipos queda fuera de la
    lista en vez de estar ahí para elegirse por error.

    Vacío = sin filtrar. No es lo mismo que «ninguno de los dos»: es no haber filtrado.
  */
  const [filtroTramite, setFiltroTramite] = useState<TipoImpositivo | "">("");
  const [filtroTramiteOpen, setFiltroTramiteOpen] = useState(false);
  const [wizardData, setWizardData] = useState({
    // Step 1: Contrato
    rol_frame_id: "",
    categoria_sat_id: "",
    contrato_id: "", // _id del Contrato elegido (Tipo de Contrato, valor del select principal)
    contrato_frame_id: "", // _id de la Plantilla resuelta para ese Contrato (para el PDF/Estados/filtros)
    nombre_contrato: "", // nombre de la Plantilla resuelta (identificador estable / match PDF)
    tipo_contrato_id: "", // ID Externo numérico, solo si la contratos-frame lo tiene
    estado_id: "",
    // Empresas del proyecto elegidas para el contrato / release de este miembro (ObjectId o "")
    empresaContratoId: "",
    empresaReleaseId: "",
    hora_inicio: "09:00",
    hora_fin: "18:00",
    fecha_alta_contrato: new Date().toISOString().split("T")[0],
    fecha_baja_contrato: "",
    /*
      Los días del contrato. CAMPO PROPIO, separado de `cantidad_jornadas_laborales`.

      Ese otro son las jornadas TOTALES del contrato (22, 30…) y es lo que multiplica al sueldo por
      jornada. Reusarlo hacía que la pantalla mostrara «días por semana: 22» y que editarlo desde acá
      cambiara el sueldo sin que nadie lo pidiera.
    */
    dias_por_semana: 5,
    dias_semana: [] as number[],
    dias_rotativos: false,
    // Step 2: Sueldo
    cantidad_jornadas_laborales: 5,
    sueldo_jornada: 0,
    sueldo_mano: 0,
    sueldo_mano_texto: "",
    sueldo_diario_neto: 0,
    diferencia_diaria_neto: 0,
    sueldo_neto: 0,
    sueldo_bruto: 0,
    // Step 3: Extras
    sede_id: "",
    reemplazo: false,
    empleado_id_reemplezado: "",
    observaciones: "",
    areaShiftAssignments: [] as { areaId: string; shiftIds: string[] }[],
  });

  // UI States
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLg, setIsLg] = useState(window.innerWidth >= 1024);
  /**
   * `?tab=solicitudes` abre directo esa pestaña.
   *
   * Lo usa el botón «Aprobar» de la pantalla global de Solicitudes: aprobar necesita el wizard de
   * Configurar Miembro, que vive acá, así que la vista global manda para acá. Sin el parámetro caía
   * en Equipo y había que buscar la pestaña a mano, que es justo lo que el botón venía a evitar.
   */
  const tabInicial = new URLSearchParams(location.search).get("tab");
  const [activeTab, setActiveTab] = useState<"equipo" | "solicitudes" | "coordinadores" | "jerarquia">(tabInicial === "solicitudes" || tabInicial === "coordinadores" || tabInicial === "jerarquia" ? tabInicial : "equipo");
  const [solicitudesCount, setSolicitudesCount] = useState(0);
  const [showCandidatesInfo, setShowCandidatesInfo] = useState(false);
  const [showSinAreasInfo, setShowSinAreasInfo] = useState(false);
  // Aviso de la herencia de área/turno al marcar un reemplazo (qué se copió o por qué no se pudo).
  const [herenciaReemplazo, setHerenciaReemplazo] = useState<{ ok: boolean; replacedName: string; detalle: string } | null>(null);
  /**
   * Qué área está abierta en «Asignación por Área y Turno» (una sola a la vez).
   *
   * `undefined` es «nadie tocó nada»: ahí manda la elección —se abre el área elegida, o ninguna si es
   * un alta nueva—. `null` es un área cerrada a mano, que tiene que quedarse cerrada.
   */
  const [areaExpandida, setAreaExpandida] = useState<string | null | undefined>(undefined);

  // Modal de detalle del empleado (contratos del proyecto + descargas)
  const [selectedMemberForDetail, setSelectedMemberForDetail] = useState<User | null>(null);
  const [contratoFrames, setContratoFrames] = useState<ContratoFrameItem[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [detailRefsLoaded, setDetailRefsLoaded] = useState(false);

  const handleOpenMemberDetail = async (user: User) => {
    setSelectedMemberForDetail(user);
    if (detailRefsLoaded) return;
    // Carga perezosa de plantillas de contrato, releases y empresas (puede fallar por permisos → listas vacías)
    const [cf, rel, emp] = await Promise.all([contratoFrameAPI.list().catch(() => [] as ContratoFrameItem[]), releasesAPI.getAll().catch(() => [] as Release[]), companiesAPI.list().catch(() => [] as Company[])]);
    setContratoFrames(cf);
    setReleases(rel);
    setCompanies(emp);
    setDetailRefsLoaded(true);
  };

  // Empresas (razón social) seteadas en el proyecto para contratos/releases → se muestran en el modal
  // y permiten elegir con cuál descargar el documento. Si el proyecto no tiene ninguna configurada,
  // se ofrecen TODAS las empresas del ABM (si no, no habría con qué generar el documento).
  const allEmpresas = companies.map((c) => ({ id: c._id, label: c.razonSocial })).filter((e) => e.label);
  const resolveEmpresas = (ids?: string[]) => {
    const fromProject = (ids || []).map((id) => ({ id, label: companies.find((c) => c._id === id)?.razonSocial || "" })).filter((e) => e.label);
    return fromProject.length > 0 ? fromProject : allEmpresas;
  };
  const contratoEmpresas = resolveEmpresas(project?.contratoEmpresas);
  const releaseEmpresas = resolveEmpresas(project?.releaseEmpresas);

  // Persistence for view mode
  useEffect(() => {
    const saved = localStorage.getItem("projectTeamViewMode");
    if (saved === "table" || saved === "cards") {
      setViewMode(saved as "table" | "cards");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("projectTeamViewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    const handleResize = () => setIsLg(window.innerWidth >= 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const effectiveViewMode = isLg ? viewMode : "cards";

  /* -------------------------- Auto-Calculations ---------------------------
   * El Sueldo NETO y BRUTO salen de la Categoría seleccionada (ya vienen
   * calculados en el catálogo: bruto = básico + adicional + presentismo; neto = bruto × 0.81).
   * De ahí se derivan el diario neto (neto / 30) y la diferencia diaria contra
   * lo que efectivamente se paga por jornada. Sin categoría → todo en 0.
   */
  useEffect(() => {
    const sueldo_mano = wizardData.sueldo_jornada * wizardData.cantidad_jornadas_laborales;

    const cat = allCategoriasSat.find((c) => String(c.data?.id) === String(wizardData.categoria_sat_id));
    const sueldo_neto = cat ? Number(Number(cat.data?.neto ?? 0).toFixed(2)) : 0;
    const sueldo_bruto = cat ? Number(Number(cat.data?.sueldoBruto ?? 0).toFixed(2)) : 0;
    const sueldo_diario_neto = cat ? Number((sueldo_neto / 30).toFixed(2)) : 0;
    const diferencia_diaria_neto = cat ? Number((wizardData.sueldo_jornada - sueldo_diario_neto).toFixed(2)) : 0;
    const sueldo_mano_texto = numeroALetras(sueldo_mano);

    if (sueldo_mano !== wizardData.sueldo_mano || sueldo_neto !== wizardData.sueldo_neto || sueldo_bruto !== wizardData.sueldo_bruto || sueldo_diario_neto !== wizardData.sueldo_diario_neto || diferencia_diaria_neto !== wizardData.diferencia_diaria_neto || sueldo_mano_texto !== wizardData.sueldo_mano_texto) {
      setWizardData((prev) => ({
        ...prev,
        sueldo_mano,
        sueldo_neto,
        sueldo_bruto,
        sueldo_diario_neto,
        diferencia_diaria_neto,
        sueldo_mano_texto,
      }));
    }
  }, [wizardData.sueldo_jornada, wizardData.cantidad_jornadas_laborales, wizardData.categoria_sat_id, allCategoriasSat]);

  /* ------------------------------ Fetchers ------------------------------- */

  // Página actual del equipo (datos completos). TODOS los filtros se resuelven en el server: si se
  // aplicaran acá sobre la página cargada, la paginación mostraría resultados salteados y páginas vacías.
  const fetchTeamPage = async (page: number, opts?: { search?: string; status?: string; rolMobile?: string; vigencia?: string; tipoContrato?: string; areaTurno?: string; estadoContrato?: string; reemplazo?: string }) => {
    if (!projectId) return;
    const search = opts?.search ?? searchTermTeam;
    const status = opts?.status ?? filterUserStatus;
    const rolMobile = opts?.rolMobile ?? filterRolMobile;
    const vigencia = opts?.vigencia ?? filterVigencia;
    const tipoContrato = opts?.tipoContrato ?? filterTipoContrato;
    const areaTurno = opts?.areaTurno ?? filterAreaTurno;
    const estadoContrato = opts?.estadoContrato ?? filterEstadoContrato;
    const reemplazo = opts?.reemplazo ?? filterReemplazo;
    const reqId = ++teamReqIdRef.current;
    try {
      setTeamFetching(true);
      const params: any = { projectId, page, limit: TEAM_PAGE_SIZE, sort: "name" };
      if (search) params.email = search; // el backend busca fuzzy en nombre/email
      if (status === "active") params.metadataActivo = "true";
      if (status === "inactive") params.metadataActivo = "false";
      if (rolMobile === "con") params.permission = PROJECT_COORDINATOR;
      if (rolMobile === "sin") params.notPermission = PROJECT_COORDINATOR;
      if (vigencia) params.vigencia = vigencia;
      if (tipoContrato) params.tipoContrato = tipoContrato;
      if (areaTurno) params.areaTurno = areaTurno;
      if (estadoContrato) params.estadoContrato = estadoContrato;
      if (reemplazo) params.reemplazo = reemplazo;
      const resp = await usersAPI.list(params);
      if (reqId !== teamReqIdRef.current) return; // descartar respuestas viejas
      setTeamRows(resp.users);
      setTeamTotal(resp.pagination.total);
      setTeamTotalPages(resp.pagination.pages);
    } catch (e) {
      if (reqId === teamReqIdRef.current) console.error("Error fetching team page:", e);
    } finally {
      if (reqId === teamReqIdRef.current) setTeamFetching(false);
    }
  };

  // Equipo completo pero liviano (sin populates pesados ni N+1) para Coordinadores, contadores y lookups.
  const fetchFullTeamLite = async (): Promise<User[]> => {
    if (!projectId) return [];
    try {
      const resp = await usersAPI.list({ projectId, limit: 10000, lightweight: true });
      setAllUsers(resp.users);
      return resp.users;
    } catch (e) {
      console.error("Error fetching full team (lite):", e);
      return [];
    }
  };

  useEffect(() => {
    if (!projectId || !token) return;

    /**
     * QUÉ BLOQUEA EL SPINNER Y QUÉ NO.
     *
     * Esto era una cadena de SIETE tandas encadenadas con `await` —proyecto, cleanup, equipo
     * liviano, clientes+proyectos, y siete catálogos— y "Cargando equipo..." no se iba hasta que
     * terminaba la última. Se pagaban siete idas y vueltas en serie aunque ninguna dependiera de
     * la anterior, y cualquiera de ellas lenta congelaba la pantalla entera.
     *
     * Ahora son dos grupos. El primero es lo único que la tabla necesita para dibujarse bien
     * (proyecto, equipo y los catálogos con los que se resuelven área/turno de cada fila) y corre
     * todo en paralelo. El segundo —los catálogos del wizard y de las tarjetas, más el cleanup de
     * ids huérfanos— se completa en segundo plano: son listas que hasta que no se abre un modal no
     * se miran, y mientras tanto degradan a vacío sin romper nada.
     */
    const init = async () => {
      // Segundo grupo: en paralelo con el primero, pero NO retiene el spinner.
      const enSegundoPlano = async () => {
        const [clientes, proyectos, sedes, cats, estados, tipos, rf, cfs, contratosData] = await Promise.all([
          cachedFetch("clients:all", () => clientsAPI.listAll()),
          cachedFetch("projects:all", () => projectsAPI.listAll({ limit: 500 })),
          cachedFetch("info:sede", () => infoAPI.listByType("sede")),
          cachedFetch("categoriaSat:all", () => categoriaSatAPI.list()),
          cachedFetch("info:estado-empleado", () => infoAPI.listByType("estado-empleado")),
          cachedFetch("info:contrato", () => infoAPI.listByType("contrato")),
          cachedFetch("roleFrames:all", () => roleFrameAPI.list()),
          cachedFetch("contratoFrames:all", () => contratoFrameAPI.list()),
          cachedFetch("contratos:all", () => contratosAPI.list()),
        ]);
        setAllClients(clientes);
        setAllProjects(proyectos);
        setAllSedes(sedes);
        setAllCategoriasSat(cats);
        setAllEstados(estados);
        setAllTiposContrato(tipos);
        setAllRoleFrames(rf);
        setContratoFrames(cfs);
        setContratos(contratosData);
      };

      // El cleanup de ids huérfanos es mantenimiento, no dato de pantalla: casi nunca borra algo y
      // antes se esperaba a que contestara antes de pedir el equipo. Va al final y solo relee el
      // proyecto si efectivamente sacó a alguien.
      const limpiarHuerfanos = async () => {
        const resultado = await projectsAPI.cleanupTeam(projectId);
        if (resultado.removedCount > 0) {
          const actualizado = await projectsAPI.getProject(projectId, { team: "ids" });
          setProject(actualizado);
          setTeamConfig(actualizado.teamConfig || []);
        }
      };

      try {
        setLoading(true);

        enSegundoPlano().catch((e) => console.error("Error cargando catálogos:", e));

        const [projectData, teamUsers, vacationsData, areasData, shiftsData] = await Promise.all([
          projectsAPI.getProject(projectId, { team: "ids" }), // específico del proyecto: no se cachea
          // Equipo: lista liviana completa (Coordinadores/contadores) + primera página con datos
          // completos. La página no se espera: se pinta sola cuando llega (`teamFetching`).
          fetchFullTeamLite(),
          cachedFetch("vacations:all", () => vacationsAPI.getAll()),
          cachedFetch("areas:all", () => areasAPI.listAll()),
          cachedFetch("shifts:all", () => shiftsAPI.getAll()),
        ]);
        fetchTeamPage(1);

        setProject(projectData);
        setTeamConfig(projectData.teamConfig || []);
        setVacations(vacationsData);
        setAllAreas(areasData);
        setAllShifts(shiftsData);

        // Default sede from project if available
        if (projectData.metadata?.sedeId) {
          const sId = String(projectData.metadata.sedeId);
          setWizardData((prev) => ({ ...prev, sede_id: sId }));
        }

        // Build user lookup map
        const lookupMap = new Map<number | string, string>();
        teamUsers.forEach((u: User) => {
          const metaId = (u.metadata as any)?.id;
          if (metaId) {
            const name = u.firstName || u.lastName ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : u.email.split("@")[0];
            lookupMap.set(metaId, name);
          }
        });
        setUserLookup(lookupMap);

        limpiarHuerfanos().catch((e) => console.warn("Could not cleanup team:", e));
      } catch (error) {
        console.error("Error loading data:", error);
        sweetAlert.error("Error", "No se pudieron cargar los datos del equipo.");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [projectId, token]);

  // Cualquier filtro del Equipo → server-side, resetea a página 1 (debounced, como Usuarios).
  const teamFiltersInitedRef = React.useRef(false);
  useEffect(() => {
    if (!projectId) return;
    if (!teamFiltersInitedRef.current) {
      teamFiltersInitedRef.current = true; // evita doble fetch en el montaje (init ya carga la página 1)
      return;
    }
    const h = setTimeout(() => {
      setTeamPage(1);
      fetchTeamPage(1, {
        search: searchTermTeam,
        status: filterUserStatus,
        rolMobile: filterRolMobile,
        vigencia: filterVigencia,
        tipoContrato: filterTipoContrato,
        areaTurno: filterAreaTurno,
        estadoContrato: filterEstadoContrato,
        reemplazo: filterReemplazo,
      });
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTermTeam, filterUserStatus, filterRolMobile, filterVigencia, filterTipoContrato, filterAreaTurno, filterEstadoContrato, filterReemplazo]);

  // Cantidad de personas por área/turno: se recalcula en el server (equipo completo, no la página).
  // Se refresca cuando cambia `teamConfig`, o sea después de cada alta/edición de miembro.
  useEffect(() => {
    if (!projectId || !token) return;
    let cancelled = false;
    projectsAPI
      .getAreaShiftCounts(projectId)
      .then(({ counts, userIds }) => {
        if (cancelled) return;
        setAreaShiftCounts(counts);
        setAreaShiftUserIds(userIds);
      })
      .catch((e) => console.error("Error fetching area/shift counts:", e));
    return () => {
      cancelled = true;
    };
  }, [projectId, token, teamConfig]);

  // Cambio de página → traer esa página del server.
  const teamPageInitedRef = React.useRef(false);
  useEffect(() => {
    if (!projectId) return;
    if (!teamPageInitedRef.current) {
      teamPageInitedRef.current = true; // la página 1 ya la cargó init
      return;
    }
    fetchTeamPage(teamPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamPage]);

  // Fetch solicitudes count for this project
  useEffect(() => {
    if (!projectId) return;
    const fetchCount = async () => {
      try {
        const solis = await usersAPI.listSolicitudes();
        // El badge cuenta solo las PENDIENTES: las rechazadas siguen listadas, pero ya no son tarea pendiente.
        const count = solis.filter((u) => u.metadata?.projectIds?.includes(projectId) && (u.metadata?.solicitudStatus || "pendiente") === "pendiente").length;
        setSolicitudesCount(count);
      } catch (e) {
        console.error("Error fetching solicitudes count:", e);
      }
    };
    fetchCount();
  }, [projectId]);

  // Al cambiar la búsqueda, volver a la página 1 (mientras el modal está abierto).
  useEffect(() => {
    if (showAddModal) setCandPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  // Candidatos: por defecto TODOS los usuarios activos (paginados); filtra en vivo al tipear.
  useEffect(() => {
    if (!showAddModal) {
      setCandidateUsers([]);
      setSearchTerm("");
      setCandTotal(0);
      setCandTotalPages(1);
      setCandPage(1);
      return;
    }

    const reqId = ++candReqIdRef.current;
    const delayDebounceFn = setTimeout(async () => {
      try {
        setSearchingCandidates(true);
        // slimProjects (sin contratos) → carga liviana; el contrato se trae on-demand en handleOpenWizard.
        const response = await usersAPI.list({ page: candPage, limit: CAND_PAGE_SIZE, metadataActivo: "true", email: searchTerm || undefined, slimProjects: true });
        if (reqId !== candReqIdRef.current) return;
        setCandidateUsers(response.users);
        setCandTotal(response.pagination.total);
        setCandTotalPages(response.pagination.pages);
      } catch (error) {
        if (reqId === candReqIdRef.current) console.error("Error fetching candidates:", error);
      } finally {
        if (reqId === candReqIdRef.current) setSearchingCandidates(false);
      }
    }, 250);

    return () => clearTimeout(delayDebounceFn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddModal, searchTerm, candPage]);

  /* ------------------------------- Logic --------------------------------- */

  // Derived state
  const clientName = useMemo(() => {
    if (!project) return "";
    if (typeof project.clientId === "object" && project.clientId?.name) {
      return project.clientId.name;
    }
    return "";
  }, [project]);

  const projectMap = useMemo(() => new Map(allProjects.map((p) => [p._id, p])), [allProjects]);
  const clientMap = useMemo(() => new Map(allClients.map((c) => [c._id, c])), [allClients]);

  // Combinaciones Área · Turno configuradas en el proyecto (para el filtro).
  const areaTurnoOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const seen = new Set<string>();
    (project?.areasConfig || []).forEach((ac: any) => {
      const aId = typeof ac.areaId === "object" ? ac.areaId?._id : ac.areaId;
      const aName = typeof ac.areaId === "object" ? ac.areaId?.name : allAreas.find((a) => String(a._id) === String(aId))?.name;
      if (!aId || !aName) return;
      (ac.shiftIds || []).forEach((sid: any) => {
        const sId = typeof sid === "object" ? sid?._id : sid;
        const sName = typeof sid === "object" ? sid?.name : allShifts.find((s) => String(s._id) === String(sId))?.name;
        if (!sId || !sName) return;
        const key = `${aId}::${sId}`;
        if (seen.has(key)) return;
        seen.add(key);
        opts.push({ value: key, label: `${aName} · ${sName}` });
      });
    });
    return opts;
  }, [project, allAreas, allShifts]);

  // Estados de contrato para filtrar: el catálogo (Info "estados") más los que aparezcan en los contratos
  // cargados, por si alguno quedó con un estado que ya no está en el catálogo.
  const estadoContratoOptions = useMemo(() => {
    // Se deduplica por etiqueta canónica: "Falta pedido de ARCA" y "Pedido de ARCA" son el mismo estado.
    const seen = new Set<string>();
    allEstados.forEach((e) => e.name && seen.add(estadoLabel(e.name)));
    // Último contrato del miembro en este proyecto (getActiveContract se declara más abajo, así que
    // acá se resuelve igual pero inline).
    teamRows.forEach((u) => {
      const projectMeta = u.metadata?.projects?.find((p: any) => {
        const pId = p.projectId;
        return String(typeof pId === "object" ? (pId as any)?._id : pId) === String(projectId);
      });
      const estado = (getContratoActivo(projectMeta?.contracts as any[]) as any)?.nombre_estado_empleado || null;
      if (estado) seen.add(estadoLabel(estado));
    });
    return [...seen].map((name) => ({ value: name, label: name }));
  }, [allEstados, teamRows, projectId]);

  // `teamMembers` es un alias de `allUsers` (useMemo declarado más abajo); se usa `allUsers`
  // directo acá para no depender de una variable declarada después en el archivo.
  const esAltaNueva = !allUsers.some((m) => m._id === selectedUserForWizard?._id);

  // Un estado impositivo solo puede estar vinculado a una Plantilla (lo exige el ABM de Estados),
  // así que a lo sumo hay uno por Tipo de contrato/Plantilla elegido: no hace falta que el usuario
  // elija, se muestra directo. En "Agregar Miembro" el Estado SIEMPRE sale del Tipo de Contrato
  // elegido (no se elige a mano); en "Configurar Miembro" se elige de un select, que además incluye
  // este estado impositivo como una opción más (ver `estadosDisponibles`).
  const estadoImpositivoAuto = useMemo(() => {
    if (!wizardData.contrato_frame_id) return undefined;
    return allEstados.find((e) => !!(e.data as any)?.esImpositivo && ((e.data as any)?.contratoFrameIds || []).some((id: string) => String(id) === String(wizardData.contrato_frame_id)));
  }, [allEstados, wizardData.contrato_frame_id]);

  /**
   * Estados que se ofrecen en "Configurar Miembro" (edición): los del ABM vinculados al tipo de
   * contrato elegido (incluye el impositivo si corresponde), más los que no están vinculados a
   * ninguno (disponibles siempre). Si el estado ya guardado en el contrato quedó fuera del filtro,
   * se agrega igual para no perder el valor actual.
   */

  /** El estado que va a quedar guardado. Se muestra; ya no se elige a mano. */
  const estadoElegido = useMemo(() => allEstados.find((e) => String(e.data?.id) === String(wizardData.estado_id)), [allEstados, wizardData.estado_id]);

  // Recuerda el último contrato_frame_id "visto" para distinguir, en "Configurar Miembro", entre
  // abrir el wizard (no debe tocar el estado ya guardado) y que el usuario CAMBIE el Tipo de
  // Contrato durante la edición (ahí sí hay que re-sincronizar el estado impositivo). Se resetea al
  // abrir el wizard (ver `handleOpenWizard`) para que la primera corrida de este efecto no cuente
  // como "cambio".
  const prevContratoFrameIdRef = useRef<string>("");

  useEffect(() => {
    if (esAltaNueva) {
      // "Agregar Miembro": el estado siempre es el impositivo automático (no lo elige el usuario).
      const nuevoId = estadoImpositivoAuto ? String(estadoImpositivoAuto.data.id) : "";
      setWizardData((prev) => (prev.estado_id === nuevoId ? prev : { ...prev, estado_id: nuevoId }));
      prevContratoFrameIdRef.current = wizardData.contrato_frame_id || "";
      return;
    }

    // "Configurar Miembro": el estado lo elige el usuario, pero si cambia el Tipo de Contrato/
    // Plantilla durante la edición, se re-sincroniza con el impositivo del tipo nuevo (si no tiene
    // ninguno vinculado, se deja el estado como está, para no pisarlo con algo sin sentido).
    const cambioDeTipo = prevContratoFrameIdRef.current !== (wizardData.contrato_frame_id || "");
    prevContratoFrameIdRef.current = wizardData.contrato_frame_id || "";
    if (!cambioDeTipo || !estadoImpositivoAuto) return;
    const nuevoId = String(estadoImpositivoAuto.data.id);
    setWizardData((prev) => (prev.estado_id === nuevoId ? prev : { ...prev, estado_id: nuevoId }));
  }, [esAltaNueva, estadoImpositivoAuto, wizardData.contrato_frame_id]);

  /*
    QUÉ TRÁMITE DECLARA CADA TIPO DE CONTRATO.

    El estado impositivo se vincula a la PLANTILLA, no al tipo de contrato, así que hay que ir por
    ese camino en cada fila de la lista. Se calcula una vez para todos en vez de una por opción.
  */
  const tramitePorContrato = useMemo(() => {
    const m = new Map<string, TipoImpositivo>();
    for (const c of contratos) {
      const t = tipoImpositivoDeContrato(c._id, contratoFrames, allEstados);
      if (t) m.set(c._id, t);
    }
    return m;
  }, [contratos, contratoFrames, allEstados]);

  const impositivosDelAbm = useMemo(() => estadosImpositivos(allEstados), [allEstados]);

  /*
    La lista de tipos que se ofrece.

    Con filtro puesto se muestran solo los de ese trámite… MÁS el que ya está elegido, aunque no
    coincida: si no, cambiar de filtro haría desaparecer de la lista el tipo que el contrato tiene
    guardado y el select quedaría mostrando un valor que no está entre sus opciones.
  */
  const contratosFiltradosPorTramite = useMemo(() => {
    if (!filtroTramite) return contratos;
    return contratos.filter((c) => tramitePorContrato.get(c._id) === filtroTramite || c._id === wizardData.contrato_id);
  }, [contratos, filtroTramite, tramitePorContrato, wizardData.contrato_id]);

  /*
    SERVICIOS: el tipo de contrato elegido declara «Constancia de CUIT» (locación de servicios).

    Un servicio no se encuadra en convenio ni categoría —son datos del alta ante ARCA—, así que se
    esconden, la categoría deja de ser obligatoria y se suelta. El sueldo por jornada se carga a mano
    y el sueldo en mano sigue saliendo de jornada × jornadas; lo que cuelga de la categoría (neto,
    bruto, diario) queda en 0, como ya pasaba sin categoría. Es la misma regla que la solicitud del móvil.
  */
  const esServicios = !!wizardData.contrato_id && tramitePorContrato.get(wizardData.contrato_id) === "constancia_cuit";

  /*
    LAS MISMAS CUENTAS QUE LA SOLICITUD DE LA APP (ver `utils/jornadas.ts` e `ImportesDelContrato`).

    El alta del panel y la solicitud del móvil describen el mismo contrato, así que las jornadas, los
    meses del período y los importes salen de las mismas funciones: si no, el mismo período daba un
    número acá y otro allá, y quien aprobaba tenía que rehacer la cuenta a mano.
  */
  const diasSemanaWizard = wizardData.dias_rotativos ? Number(wizardData.dias_por_semana) || 0 : wizardData.dias_semana.length;
  const jornadasCalculadasWizard = jornadasDelCalendario(wizardData.fecha_alta_contrato, wizardData.fecha_baja_contrato, wizardData.dias_semana);
  const mesesEqWizard = mesesEquivalentes(wizardData.fecha_alta_contrato, wizardData.fecha_baja_contrato, wizardData.dias_semana);
  /** El ajuste manual de las jornadas es de la pantalla: al contrato va el número final. */
  const [ajusteJornadas, setAjusteJornadas] = useState<{ ajustado: boolean; motivo: string; nota: string }>({ ajustado: false, motivo: "", nota: "" });
  const datosJornadasWizard = {
    desde: wizardData.fecha_alta_contrato,
    hasta: wizardData.fecha_baja_contrato,
    diasPorSemana: String(wizardData.dias_por_semana || ""),
    dias: wizardData.dias_semana,
    rotativos: wizardData.dias_rotativos,
    jornadas: String(wizardData.cantidad_jornadas_laborales || ""),
    calculadas: jornadasCalculadasWizard,
    ajustado: ajusteJornadas.ajustado,
    motivo: ajusteJornadas.motivo,
    nota: ajusteJornadas.nota,
  };
  const erroresJornadasWizard = erroresDeJornadas(datosJornadasWizard);
  useEffect(() => {
    if (ajusteJornadas.ajustado || jornadasCalculadasWizard === null) return;
    setWizardData((prev) => (prev.cantidad_jornadas_laborales === jornadasCalculadasWizard ? prev : { ...prev, cantidad_jornadas_laborales: jornadasCalculadasWizard }));
  }, [jornadasCalculadasWizard, ajusteJornadas.ajustado]);

  /*
    LÍMITES DEL TIPO DE CONTRATO: horas por jornada y días por semana (se cargan en Contratos).

    Mismo criterio que la solicitud: los días se acotan en el momento y las horas se avisan y frenan el
    guardado, porque cuál de las dos puntas corregir lo decide quien carga.
  */
  const contratoDelWizard = contratos.find((c) => c._id === wizardData.contrato_id) || null;
  const limiteHorasWizard = contratoDelWizard?.data?.horasPorJornada ?? null;
  const limiteDiasWizard = contratoDelWizard?.data?.diasPorSemana ?? null;
  const duracionHorarioWizard = horasDelHorario(wizardData.hora_inicio, wizardData.hora_fin);
  const horarioExcedidoWizard = limiteHorasWizard != null && duracionHorarioWizard != null && duracionHorarioWizard > limiteHorasWizard;
  /*
    LOS TURNOS ELEGIDOS A LOS QUE EL HORARIO SE LES SALE (ver `horarioDentroDelTurno`).

    Que alguien entre antes o se quede después de su turno es legítimo y hay que poder contratarlo así;
    lo que no puede pasar es que se guarde sin que nadie lo haya visto. Por eso es un aviso, no un error.
  */
  const turnosFueraDeHorario = useMemo(() => {
    if (!wizardData.hora_inicio || !wizardData.hora_fin) return [];
    return wizardData.areaShiftAssignments
      .flatMap((a) => a.shiftIds.map((id) => allShifts.find((s) => String(s._id) === String(id))))
      .filter((sh): sh is NonNullable<typeof sh> => !!sh && !!sh.startTime && !!sh.endTime)
      .filter((sh) => !horarioDentroDelTurno(sh.startTime, sh.endTime, wizardData.hora_inicio, wizardData.hora_fin));
  }, [wizardData.areaShiftAssignments, wizardData.hora_inicio, wizardData.hora_fin, allShifts]);
  useEffect(() => {
    if (limiteDiasWizard == null) return;
    setWizardData((prev) => {
      if ((Number(prev.dias_por_semana) || 0) <= limiteDiasWizard) return prev;
      const lunesPrimero = [1, 2, 3, 4, 5, 6, 0];
      const dias = prev.dias_rotativos ? prev.dias_semana : lunesPrimero.filter((d) => prev.dias_semana.includes(d)).slice(0, limiteDiasWizard).sort((a, b) => a - b);
      return { ...prev, dias_por_semana: limiteDiasWizard, dias_semana: dias };
    });
  }, [limiteDiasWizard]);
  useEffect(() => {
    if (!esServicios || !wizardData.categoria_sat_id) return;
    setWizardData((prev) => ({ ...prev, categoria_sat_id: "" }));
  }, [esServicios, wizardData.categoria_sat_id]);

  const sedeName = useMemo(() => {
    if (!project) return null;
    return (project as any).metadataResolutions?.sede?.name || (project as any).metadataResolutions?.sede?.data?.nombre || null;
  }, [project]);

  const [client, setClient] = useState<any>(null);

  useEffect(() => {
    if (project && typeof project.clientId === "string" && !clientName) {
      // fetch client
      projectsAPI.getClient(project.clientId).then(setClient).catch(console.error);
    }
  }, [project, clientName]);

  const displayedClientName = client?.name || clientName || "Cliente";

  // Unificamos los IDs de usuarios asignados (cruce entre la lista del proyecto y los metadatos de los usuarios)
  const assignedUserIds = useMemo(() => {
    if (!project || !projectId) return [];

    // 1. Usuarios explícitamente asignados en el objeto Proyecto
    const fromProject = ((project.assignedUsers as any[]) || []).map((u) => (typeof u === "string" ? u : u._id));

    return Array.from(new Set(fromProject));
  }, [project, projectId]);

  const activeAddFiltersCount = useMemo(() => [filterRole, filterRoleFrame, filterProject].filter(Boolean).length, [filterRole, filterRoleFrame, filterProject]);

  // Filtered Users (candidates to add) - only search by name or email
  const filteredCandidates = useMemo(() => {
    // When in Add Modal, we use candidateUsers (which contains active users from API)
    const source = showAddModal ? candidateUsers : allUsers;

    return source.filter((user) => {
      // 1. Exclude already assigned
      if (assignedUserIds.includes(user._id)) return false;

      // 2. Búsqueda: la resuelve el server (param email). Acá sólo filtros secundarios.

      // 3. Filter by Role
      if (filterRole) {
        if (!user.roles?.some((r) => r.name === filterRole)) return false;
      }

      // 4. Filter by Role Frame (contratos/proyectos + propios del usuario en metadata.roles_frame)
      if (filterRoleFrame) {
        const ownRFNames = (((user.metadata as any)?.rolesFrameIds || (user.metadata as any)?.roles_frame || []) as any[]).map((rf: any) => (typeof rf === "object" ? rf?.name : allRoleFrames.find((i) => i._id === rf)?.name)).filter(Boolean) as string[];
        const userRFs = Array.from(new Set([...(user.externalInfo?.rolFrames || []), ...ownRFNames]));
        if (!userRFs.includes(filterRoleFrame)) return false;
      }

      // 5. Filter by Project
      if (filterProject) {
        const metadataProjects = user.metadata?.projects || [];
        const hasProject = metadataProjects.some((p) => p.nombre_proyecto === filterProject);
        if (!hasProject) return false;
      }

      return true;
    });
  }, [allUsers, candidateUsers, showAddModal, assignedUserIds, filterRole, filterRoleFrame, filterProject, allRoleFrames]);

  // El equipo real es lo que devuelve la consulta por projectId (allUsers, versión liviana);
  // no depende de project.assignedUsers (que puede quedar desincronizado).
  const teamMembers = useMemo(() => allUsers, [allUsers]);

  /**
   * El wizard es "Configurar Miembro" (edición) cuando la persona ya está en el equipo, y "Agregar
   * Miembro" cuando no. En edición los datos vienen precargados del contrato actual, así que se
   * puede guardar desde cualquier paso; en un alta nueva no, porque quedaría un contrato a medias.
   */
  const esEdicionMiembro = useMemo(() => !!selectedUserForWizard && teamMembers.some((m) => m._id === selectedUserForWizard._id), [selectedUserForWizard, teamMembers]);

  /** Personas distintas asignadas como coordinadoras (una puede coordinar varias combinaciones área/turno). */
  const coordinadoresCount = useMemo(() => {
    const coordIds = new Set((project?.coordinatorAssignments || []).map((asm) => (typeof asm.userId === "object" ? asm.userId?._id : asm.userId)).filter(Boolean));
    return coordIds.size;
  }, [project?.coordinatorAssignments]);

  const displayedCount = useMemo(() => {
    if (activeTab === "equipo") {
      return teamTotal;
    }
    if (activeTab === "coordinadores") {
      return coordinadoresCount;
    }
    if (activeTab === "solicitudes") {
      return solicitudesCount;
    }
    return teamMembers.length;
  }, [activeTab, teamTotal, coordinadoresCount, solicitudesCount, teamMembers.length]);

  // ¿Hay en el equipo alguien que pueda tener un área a cargo? Ver `coordinaAreas`.
  const hasMobileCoordinator = useMemo(() => teamMembers.some((u) => coordinaAreas(u.roles)), [teamMembers]);

  /**
   * Códigos de CCT habilitados para la empleadora elegida en el contrato.
   *
   * ARCA no tiene un catálogo global de categorías: el combo `l_CatCCT` viene filtrado por convenio y
   * solo ofrece los de los CCT que la empleadora tiene habilitados. Una categoría de otro convenio
   * pasa todos los controles y llega mal, porque el convenio no viaja en el TXT (ARCA lo infiere del
   * código de categoría).
   *
   * `null` = no filtrar. Pasa cuando todavía no se eligió empresa, cuando la empresa no tiene
   * convenios cargados, o cuando el catálogo de Convenios no se pudo leer: en los tres casos, filtrar
   * dejaría el select vacío sin que el operador pueda hacer nada al respecto desde acá. El checklist
   * de Datos ARCA ya marca esos casos por su cuenta.
   */
  const conveniosDeLaEmpleadora = useMemo(
    () => codigosDeConveniosDeLaEmpleadora(companies.find((c) => c._id === wizardData.empresaContratoId), allConvenios),
    [companies, allConvenios, wizardData.empresaContratoId],
  );

  /**
   * Los convenios que se pueden elegir. NUNCA el catálogo entero (~2.669): solo los de la empleadora.
   *
   * Se muestra cuántas categorías tiene cada uno porque es lo que dice si elegirlo va a servir de
   * algo: un convenio registrado ante ARCA pero sin categorías cargadas en WeProdu deja el select de
   * abajo vacío, y sin el número eso parece un error de la pantalla.
   *
   * Un convenio SIN categorías no se ofrece —no hay nada que filtrar con él— salvo que sea el que
   * está elegido: sacarlo de la lista mientras está seleccionado haría saltar el select a otro valor.
   */
  /**
   * Cambiar de convenio con una categoría ya elegida.
   *
   * Si la categoría no es del convenio nuevo se limpia, porque dejarla sería mostrar un encuadre y
   * guardar otro — y lo que viaja a ARCA es la categoría, no el convenio. Se avisa en la pantalla:
   * un campo obligatorio que se vacía solo, en silencio, se descubre recién al intentar guardar.
   *
   * Los sueldos derivados (neto, bruto, diario, diferencia) se recalculan solos: cuelgan de
   * `categoria_sat_id` en el efecto de auto-cálculo, y con la categoría vacía vuelven a 0.
   */
  const cambiarConvenioFiltro = (nuevo: string) => {
    setConvenioFiltro(nuevo);
    // El escape hatch es por convenio: al cambiar de convenio vuelve a su default.
    setVerTodasDelConvenio(false);
    setAvisoConvenio("");
    if (!nuevo || !wizardData.categoria_sat_id) return;
    const cat = allCategoriasSat.find((c) => String(c.data?.id) === String(wizardData.categoria_sat_id));
    if (String(cat?.data?.convenio || "").trim() !== nuevo) {
      setWizardData((prev) => ({ ...prev, categoria_sat_id: "" }));
      setAvisoConvenio("Se limpió la categoría: no pertenece al convenio elegido.");
    }
  };

  const conveniosDisponibles = useMemo(
    () => conveniosOfrecidos({ codigosEmpleadora: conveniosDeLaEmpleadora, convenioElegido: convenioFiltro, categorias: allCategoriasSat, convenios: allConvenios }),
    [conveniosDeLaEmpleadora, convenioFiltro, allCategoriasSat, allConvenios],
  );
  const {
    categorias: availableCategoriasSat,
    ocultasPorConvenio: categoriasOcultasPorConvenio,
    ocultasPorFiltroConvenio,
    rolNoTieneCategoriasDelConvenio,
  } = useMemo(
    () =>
      categoriasOfrecidas({
        // El wizard elige UN rol frame; la función recibe lista porque el móvil admite varios.
        rolesFrame: allRoleFrames.filter((rf) => String(rf.data?.rol?.id) === String(wizardData.rol_frame_id)),
        convenioElegido: convenioFiltro,
        codigosEmpleadora: conveniosDeLaEmpleadora,
        categorias: allCategoriasSat,
        verTodasDelConvenio,
        categoriaElegidaId: wizardData.categoria_sat_id,
      }),
    [allRoleFrames, allCategoriasSat, wizardData.rol_frame_id, wizardData.categoria_sat_id, conveniosDeLaEmpleadora, convenioFiltro, verTodasDelConvenio],
  );

  /*
    EL OFICIO QUE SE AGREGA DESDE EL BUSCADOR, y que la persona todavía no tiene en su ficha.

    Vive aparte de `wizardData` porque no es un dato del contrato: es lo que hay que sumarle a la ficha
    al guardar. Se limpia al cerrar el wizard, como todo lo demás.
  */
  const [rolFrameAgregado, setRolFrameAgregado] = useState<RoleFrameItem | null>(null);
  const [rolFrameBuscadorOpen, setRolFrameBuscadorOpen] = useState(false);
  const [rolFrameBusqueda, setRolFrameBusqueda] = useState("");

  const userAssignedRoleFrames = useMemo(() => {
    if (!selectedUserForWizard) return [];

    const assignedNames = selectedUserForWizard.externalInfo?.rolFrames || [];
    const projectsRFNames = (selectedUserForWizard.metadata?.projects || []).map((p) => p.nombre_rol_frame).filter(Boolean);

    // Add names from all contracts in projects as well!
    const contractRFNames: string[] = [];
    (selectedUserForWizard.metadata?.projects || []).forEach((p: any) => {
      (p.contracts || []).forEach((c: any) => {
        if (c.nombre_rol_frame) contractRFNames.push(c.nombre_rol_frame);
      });
    });

    const allAssignedNames = Array.from(new Set([...assignedNames, ...projectsRFNames, ...contractRFNames]));

    let filtered = allRoleFrames.filter((rf) => allAssignedNames.includes(rf.name));

    // Role frames propios del usuario (colección users.metadata.roles_frame / rolesFrameIds)
    const ownRoleFrameIds = (((selectedUserForWizard.metadata as any)?.rolesFrameIds || (selectedUserForWizard.metadata as any)?.roles_frame || []) as any[])
      .map((rf: any) => (typeof rf === "object" ? rf?._id : rf))
      .filter(Boolean)
      .map(String);
    if (ownRoleFrameIds.length > 0) {
      const ownFrames = allRoleFrames.filter((rf) => ownRoleFrameIds.includes(String(rf._id)));
      // Merge sin duplicar: ambas listas provienen de allRoleFrames (mismas referencias)
      filtered = Array.from(new Set([...filtered, ...ownFrames]));
    }

    // If still empty, check the specific ID in metadata
    if (filtered.length === 0 && selectedUserForWizard.metadata?.roleFrameId) {
      const rfId = String(selectedUserForWizard.metadata.roleFrameId);
      filtered = allRoleFrames.filter((rf) => String(rf.data?.rol?.id) === rfId);
    }

    // Check contracts' rol_frame_id
    if (filtered.length === 0) {
      const contractRFIds: string[] = [];
      (selectedUserForWizard.metadata?.projects || []).forEach((p: any) => {
        (p.contracts || []).forEach((c: any) => {
          if (c.rol_frame_id) contractRFIds.push(String(c.rol_frame_id));
        });
      });
      if (contractRFIds.length > 0) {
        filtered = allRoleFrames.filter((rf) => contractRFIds.includes(String(rf.data?.rol?.id)));
      }
    }

    // If STILL empty (e.g. editing existing member with no rolFrame history), show all role frames
    if (filtered.length === 0) {
      filtered = allRoleFrames;
    }

    return filtered;
  }, [allRoleFrames, selectedUserForWizard]);

  /** Lo que ofrece el desplegable: los oficios de la persona, más el que se haya agregado a mano. */
  const rolesFrameOfrecidos = useMemo(() => (rolFrameAgregado && !userAssignedRoleFrames.some((rf) => rf._id === rolFrameAgregado._id) ? [...userAssignedRoleFrames, rolFrameAgregado] : userAssignedRoleFrames), [userAssignedRoleFrames, rolFrameAgregado]);

  /** El catálogo entero para el buscador, sin los que la persona ya tiene. */
  const rolesFrameParaBuscar = useMemo(() => {
    const suyos = new Set(userAssignedRoleFrames.map((rf) => rf._id));
    const base = allRoleFrames.filter((rf) => !suyos.has(rf._id));
    return rolFrameBusqueda.trim() ? base.filter((rf) => fuzzyMatch(rf.name, rolFrameBusqueda)) : base;
  }, [allRoleFrames, userAssignedRoleFrames, rolFrameBusqueda]);

  // Coordinador = tiene áreas a cargo. Se conserva el fallback por el nombre de la persona, que cubre
  // a quien tiene el puesto escrito en el nombre y ningún rol detrás.
  const checkIsCoordinator = (user: User) => coordinaAreas(user.roles) || user.firstName?.toLowerCase().includes("coordinador") || user.lastName?.toLowerCase().includes("coordinador");

  // Get standard shifts for a user assigned to an area
  const getStandardShifts = (user: User, userConfig: any, activeContract: any, areaId: string, areaName: string) => {
    let shifts: any[] = [];
    if (!user) return shifts;

    // Helper to get coordinated shift IDs for exclusion
    const getCoordinatedShiftIds = () => {
      if (!project?.coordinatorAssignments) return [];
      return project.coordinatorAssignments
        .filter((asm) => {
          const uid = typeof asm.userId === "object" ? (asm.userId as any)?._id : asm.userId;
          const aid = typeof asm.areaId === "object" ? (asm.areaId as any)?._id : asm.areaId;
          return String(uid) === String(user._id) && String(aid) === String(areaId);
        })
        .map((asm) => (typeof asm.shiftId === "object" ? (asm.shiftId as any)?._id : asm.shiftId));
    };

    const coordShiftIds = getCoordinatedShiftIds();

    // 1. Check team configuration assignments (Wizard) and EXCLUDE coordinated ones
    const assignments = userConfig?.areaShiftAssignments || [];
    const areaAssign = assignments.find((a: any) => {
      const aid = typeof a.areaId === "object" ? a.areaId?._id : a.areaId;
      if (String(aid) === String(areaId)) return true;
      const aData = allAreas.find((area) => String(area._id) === String(aid) || String(area.data?.id) === String(aid));
      return aData && areaName && aData.name.toLowerCase() === areaName.toLowerCase();
    });

    if (areaAssign) {
      const sids = areaAssign.shiftIds || [];
      sids.forEach((sid: any) => {
        const actualSid = typeof sid === "object" ? sid?._id : sid;
        if (coordShiftIds.includes(actualSid)) return;
        const shift = allShifts.find((s) => String(s._id) === String(actualSid));
        if (shift && !shifts.some((s) => String(s._id) === String(shift._id))) {
          shifts.push(shift);
        }
      });
    }

    // 2. Check user's contract history fallback
    if (shifts.length === 0) {
      if (activeContract?.areaShiftAssignments && activeContract.areaShiftAssignments.length > 0) {
        const fallbackAssign = activeContract.areaShiftAssignments.find((a: any) => {
          const aid = typeof a.areaId === "object" ? a.areaId?._id : a.areaId;
          if (String(aid) === String(areaId)) return true;
          const aData = allAreas.find((area) => String(area._id) === String(aid) || String(area.data?.id) === String(aid));
          return aData && areaName && aData.name.toLowerCase() === areaName.toLowerCase();
        });

        if (fallbackAssign) {
          const sids = fallbackAssign.shiftIds || [];
          sids.forEach((sid: any) => {
            const actualSid = typeof sid === "object" ? sid?._id : sid;
            if (coordShiftIds.includes(actualSid)) return;
            const shift = allShifts.find((s) => String(s._id) === String(actualSid));
            if (shift && !shifts.some((s) => String(s._id) === String(shift._id))) {
              shifts.push(shift);
            }
          });
        }
      }
    }

    // 3. Legacy members fallback
    if (shifts.length === 0) {
      const shiftIdFromUser = user.turnos && user.turnos.length > 0 ? (typeof user.turnos[0] === "object" ? user.turnos[0]._id : user.turnos[0]) : undefined;
      const finalShiftId = userConfig?.shiftId || shiftIdFromUser;
      const shift = allShifts.find((sh) => String(sh._id) === String(finalShiftId));
      if (shift) shifts = [shift];
    }

    return shifts;
  };

  // Personas ACTIVAS y con contrato VIGENTE asignadas a ese área + turno exacto (incluye al
  // coordinador si él también pertenece a esa combinación). Lo calcula el server sobre el equipo completo.
  const getAreaShiftPeopleCount = (areaId: string, shiftId: string): number => areaShiftCounts[`${areaId}::${shiftId}`] || 0;

  /**
   * Total del área sumando esos turnos, contando a cada persona UNA sola vez: alguien asignado a
   * dos turnos de la misma área es una persona, no dos.
   */
  const getAreaPeopleCount = (areaId: string, shiftIds: string[]): number => {
    const unicos = new Set<string>();
    for (const shiftId of shiftIds) {
      for (const userId of areaShiftUserIds[`${areaId}::${shiftId}`] || []) unicos.add(userId);
    }
    return unicos.size;
  };

  // Detalle de quiénes están en ese área + turno (todo el equipo, no solo la página cargada).
  // Con `shift` en null se listan los turnos de `shiftsDelArea`, que son los que coordina esa
  // persona: el modal del área no muestra turnos del área que el coordinador no tiene asignados.
  const handleOpenAreaShiftDetail = async (areaId: string, areaName: string, shift: any | null, shiftsDelArea?: any[]) => {
    if (!projectId) return;
    setViewingAreaShift({ areaId, areaName, shift, shifts: shiftsDelArea });
    setAreaShiftMembers(null);
    setLoadingAreaShiftMembers(true);
    try {
      setAreaShiftMembers(await projectsAPI.getAreaShiftMembers(projectId, areaId, shift ? String(shift._id) : undefined, shift ? undefined : (shiftsDelArea || []).map((s) => String(s._id))));
    } catch (e) {
      console.error("Error fetching area/shift members:", e);
      sweetAlert.error("Error", "No se pudo cargar el detalle del área/turno.");
      setViewingAreaShift(null);
    } finally {
      setLoadingAreaShiftMembers(false);
    }
  };

  // Get coordinated shifts for a user assigned to an area
  const getCoordinatedShifts = (user: User, areaId: string) => {
    let shifts: any[] = [];
    if (!user) return shifts;
    if (project?.coordinatorAssignments) {
      const myCoordAsgn = project.coordinatorAssignments.filter((asm) => {
        const uid = typeof asm.userId === "object" ? (asm.userId as any)?._id : asm.userId;
        const aid = typeof asm.areaId === "object" ? (asm.areaId as any)?._id : asm.areaId;
        return String(uid) === String(user._id) && String(aid) === String(areaId);
      });
      myCoordAsgn.forEach((asm) => {
        const sid = typeof asm.shiftId === "object" ? (asm.shiftId as any)?._id : asm.shiftId;
        const shift = allShifts.find((s) => String(s._id) === String(sid));
        if (shift && !shifts.some((s) => String(s._id) === String(shift._id))) {
          shifts.push(shift);
        }
      });
    }
    return shifts;
  };

  const getUserVacationStatus = (userId: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return vacations.find((v) => {
      if (v.userId !== userId) return false;
      const isFinal = v.status === "delivered" || v.signatureStatus === "signed" || (v.status === "approved" && v.signatureStatus === "not_required");
      if (!isFinal) return false;

      const start = new Date(v.startDate);
      const end = new Date(v.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);

      return today >= start && today <= end;
    });
  };

  const calculateDuration = (start: string, end: string) => {
    if (!start || !end) return "";
    try {
      const [startH, startM] = start.split(":").map(Number);
      const [endH, endM] = end.split(":").map(Number);
      if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return "";

      let startTotal = startH * 60 + startM;
      let endTotal = endH * 60 + endM;

      if (endTotal <= startTotal) {
        endTotal += 24 * 60; // Cruza la medianoche
      }

      const diff = endTotal - startTotal;
      const hours = Math.floor(diff / 60);
      const mins = diff % 60;

      if (mins === 0) return `${hours}hs`;
      return `${hours}h ${mins}m`;
    } catch (e) {
      return "";
    }
  };

  /* --------------------------- Notifications Logic ------------------------- */

  const updateTeamConfig = async (newConfig: any[]) => {
    if (!project) return;
    try {
      const updatedProject = await projectsAPI.updateTeamConfig(project._id, newConfig);
      setTeamConfig(updatedProject.teamConfig || []);
    } catch (err) {
      console.error("Error updating team config", err);
      sweetAlert.error("Error", "No se pudo guardar la configuración del equipo.");
    }
  };
  const handleOpenScheduleModal = (user: User, contractOverride?: Contract, contractIndex?: number) => {
    handleOpenWizard(user._id, contractOverride, contractIndex);
  };

  /* ------------------------------- Actions -------------------------------- */

  const handleOpenWizard = async (userId: string, contractOverride?: Contract, contractIndex?: number, approveSolicitudId?: string) => {
    // Si viene de editar una tarjeta puntual del modal de contratos, guardamos ese índice para
    // actualizar EXACTAMENTE ese contrato al guardar (si no, el backend toca el último).
    setEditingContractIndex(typeof contractIndex === "number" ? contractIndex : null);
    // Si viene de aprobar una solicitud, recordamos el id para marcarla aprobada al guardar.
    setApprovingSolicitudId(approveSolicitudId ?? null);
    // La lista de candidatos viene "slim" (sin contratos) para no cargar 100 historiales
    // de una. Traemos el usuario completo (con contratos) on-demand para el pre-fill.
    const cached = allUsers.find((u) => u._id === userId) || candidateUsers.find((u) => u._id === userId);
    let user = cached;
    try {
      const full = await usersAPI.get(userId);
      if (full) user = full;
    } catch (e) {
      console.error("No se pudo traer el usuario completo, uso el de la lista:", e);
    }
    if (!user) return;

    /*
      EL CONTRATO VA A LA FICHA DE LA PERSONA REAL, no a la de la solicitud.

      Una solicitud cargada desde la app es un usuario de paso (`solicitud_…@pending.com`) que guarda a
      quién se pidió contratar en `metadata.solicitudUserId`. Si el contrato quedaba en ese usuario de
      paso, la persona real seguía sin contrato: no aparecía en el equipo, ni en Mis equipos, ni en «Por
      vencer». Se cambia acá a la persona real; la solicitud sólo queda marcada como aprobada al guardar.

      Además, así el historial precargado (el contrato anterior, el proyecto, la categoría) es el de
      quien va a firmar y no el de un usuario recién creado que nunca tuvo ninguno.
    */
    let solicitud: User | null = null;
    if (approveSolicitudId) {
      solicitud = user;
      const idPersonaReal = String((user.metadata as any)?.solicitudUserId || "");
      if (idPersonaReal && idPersonaReal !== String(user._id)) {
        try {
          const real = await usersAPI.get(idPersonaReal);
          if (real) user = real;
        } catch (e) {
          console.error("No se pudo traer a la persona de la solicitud; sigo con la solicitud:", e);
        }
      }
    }

    // Attempt to find existing data to pre-fill from user history
    const metadataProjects = user.metadata?.projects || [];

    // Prioritize current project if existing
    const currentProjectMeta = metadataProjects.find((p: any) => String(typeof p.projectId === "string" ? p.projectId : p.projectId?._id) === String(project?._id));

    const lastProject = currentProjectMeta || (metadataProjects.length > 0 ? metadataProjects[metadataProjects.length - 1] : null);
    // Si se editó una tarjeta puntual del modal de contratos, precargar ESE contrato; si no, el que
    // rige hoy (el vigente más reciente), que no siempre es el último cargado.
    const contratoQueRige = getContratoActivo(lastProject?.contracts as any[]);
    const lastContract = contractOverride || (typeof contractIndex === "number" && lastProject?.contracts?.[contractIndex] != null ? lastProject.contracts[contractIndex] : contratoQueRige);

    /*
      Sin índice explícito el backend actualiza el ÚLTIMO contrato del array. Como acá se precargó el
      que rige, se fija su índice para que se guarde sobre ese mismo y no sobre otro.

      Aprobar es la excepción: ahí el contrato precargado es SÓLO el punto de partida y lo que se pidió
      es una contratación nueva —típicamente una renovación de quien ya está—. Fijar el índice haría
      que aprobar pisara el contrato vigente en vez de agregarle el nuevo, y se perdería el anterior.
    */
    if (!approveSolicitudId && typeof contractIndex !== "number" && !contractOverride && contratoQueRige && Array.isArray(lastProject?.contracts)) {
      const idxQueRige = (lastProject!.contracts as any[]).indexOf(contratoQueRige);
      if (idxQueRige >= 0) setEditingContractIndex(idxQueRige);
    }

    console.log("[Wizard] user:", user._id, "lastProject:", lastProject?._id, "lastContract keys:", lastContract ? Object.keys(lastContract) : "null");
    console.log("[Wizard] lastContract:", lastContract ? JSON.stringify({ categoria_sat_id: (lastContract as any).categoria_sat_id, nombre_categoria_sat: (lastContract as any).nombre_categoria_sat, estado_id: (lastContract as any).estado_id, nombre_estado_empleado: (lastContract as any).nombre_estado_empleado }) : "null");

    // Default statuses and IDs
    const activoEstado = allEstados.find((e) => e.name.toLowerCase().includes("activo"));

    // Prioritize IDs from last contract if they exist (numeric IDs stored in UserProject)
    let initialCatId = "";
    if (lastContract) {
      const catIdFromDb = (lastContract as any).categoria_sat_id;
      const catNameFromDb = (lastContract as any).nombre_categoria_sat;

      console.log("[Wizard] lastContract categoria_sat_id:", catIdFromDb, "nombre_categoria_sat:", catNameFromDb);
      console.log(
        "[Wizard] allCategoriasSat count:",
        allCategoriasSat.length,
        "sample:",
        allCategoriasSat.slice(0, 3).map((c) => ({ _id: c._id, dataId: c.data?.id, name: c.name })),
      );

      // Try to find the category in the global list first by numeric ID, MongoDB ID, or Name
      let matchedCat = allCategoriasSat.find((c) => {
        const numericIdMatch = catIdFromDb != null && catIdFromDb !== "" && String(c.data?.id) === String(catIdFromDb);
        const mongoIdMatch = catIdFromDb != null && catIdFromDb !== "" && String(c._id) === String(catIdFromDb);
        const nameMatch = catNameFromDb && catNameFromDb !== "Sin categoria" && (c.name?.toLowerCase() === catNameFromDb.toLowerCase() || c.data?.nombre?.toLowerCase() === catNameFromDb.toLowerCase());
        return numericIdMatch || mongoIdMatch || nameMatch;
      });

      // Fallback: If not found, try to look up in the current Role Frame's categories
      if (!matchedCat) {
        const foundRF = allRoleFrames.find((rf) => rf.name === lastProject?.nombre_rol_frame);
        const rfCats = foundRF?.data?.categoriasSat || [];
        const matchedInRF = rfCats.find((c: any) => {
          const numericIdMatch = catIdFromDb != null && catIdFromDb !== "" && String(c.id) === String(catIdFromDb);
          const nameMatch = catNameFromDb && catNameFromDb !== "Sin categoria" && c.nombre?.toLowerCase() === catNameFromDb.toLowerCase();
          return numericIdMatch || nameMatch;
        });

        if (matchedInRF) {
          // Find global category matching that name
          matchedCat = allCategoriasSat.find((c) => c.name?.toLowerCase() === matchedInRF.nombre?.toLowerCase() || c.data?.nombre?.toLowerCase() === matchedInRF.nombre?.toLowerCase());
        }
      }

      if (matchedCat) {
        initialCatId = String(matchedCat.data?.id ?? matchedCat._id);
        console.log("[Wizard] Matched cat:", matchedCat.name, "-> initialCatId:", initialCatId);
      } else {
        console.log("[Wizard] No matched cat found. catIdFromDb:", catIdFromDb, "catNameFromDb:", catNameFromDb);
        // Last resort: if we have a numeric catIdFromDb, just use it directly
        if (catIdFromDb != null && catIdFromDb !== "" && catIdFromDb !== 0) {
          initialCatId = String(catIdFromDb);
          console.log("[Wizard] Using catIdFromDb directly as initialCatId:", initialCatId);
        }
      }
    }

    // Secondary Fallbacks: User Metadata
    if (!initialCatId && user.metadata?.categoriaSatId) {
      initialCatId = String(user.metadata.categoriaSatId);
    } else if (!initialCatId && (user.metadata as any)?.categoria_sat_id) {
      initialCatId = String((user.metadata as any).categoria_sat_id);
    }

    console.log("[Wizard] FINAL initialCatId:", initialCatId);

    let initialTipoContratoId = lastContract?.tipo_contrato_id ? String(lastContract.tipo_contrato_id) : "";
    if (!initialTipoContratoId && lastContract?.nombre_contrato) {
      initialTipoContratoId = String(allTiposContrato.find((t) => t.name === lastContract.nombre_contrato)?.data.id || "");
    }
    if (!initialTipoContratoId && (user.metadata as any)?.tipoContratoId) {
      initialTipoContratoId = String((user.metadata as any).tipoContratoId);
    }
    if (!initialTipoContratoId && (user.metadata as any)?.tipo_contrato_id) {
      initialTipoContratoId = String((user.metadata as any).tipo_contrato_id);
    }

    // Preseleccionar la contratos-frame del último contrato: primero por nombre (identificador estable),
    // fallback por ID Externo numérico.
    const initialCf = contratoFrames.find((cf) => cf.name === lastContract?.nombre_contrato) || (initialTipoContratoId ? contratoFrames.find((cf) => cf.data?.id != null && String(cf.data.id) === initialTipoContratoId) : undefined);
    const initialContratoFrameId = initialCf?._id || "";
    const initialNombreContrato = initialCf?.name || lastContract?.nombre_contrato || "";
    if (initialCf?.data?.id != null) initialTipoContratoId = String(initialCf.data.id);
    /*
      El Contrato (tipo) se resuelve a partir de la Plantilla del último contrato del miembro, y si no
      hay, de lo que declaró la SOLICITUD.

      Desde que la solicitud del móvil pide el tipo de contrato —y no sólo el trámite—, ese dato llega
      elegido por quien conoce a la persona. Volver a preguntarlo acá era pedir dos veces lo mismo y
      arriesgarse a que la respuesta no coincida con la de la solicitud que se está aprobando.
    */
    const initialContratoId = (typeof initialCf?.contratoId === "object" ? initialCf?.contratoId?._id : initialCf?.contratoId) || (user.metadata as any)?.contratoId || "";

    let initialEstadoId = "";
    if (lastContract) {
      const estadoIdFromDb = (lastContract as any).estado_id;
      const estadoNameFromDb = (lastContract as any).nombre_estado_empleado;
      console.log("[Wizard] lastContract estado_id:", estadoIdFromDb, "nombre_estado_empleado:", estadoNameFromDb);
      console.log(
        "[Wizard] allEstados count:",
        allEstados.length,
        "sample:",
        allEstados.slice(0, 3).map((e) => ({ _id: e._id, dataId: e.data?.id, name: e.name })),
      );

      // Match by numeric ID first
      if (estadoIdFromDb != null && estadoIdFromDb !== "" && estadoIdFromDb !== 0) {
        const matchedEstado = allEstados.find((e) => String(e.data?.id) === String(estadoIdFromDb) || String(e._id) === String(estadoIdFromDb));
        if (matchedEstado) {
          initialEstadoId = String(matchedEstado.data?.id ?? matchedEstado._id);
          console.log("[Wizard] Matched estado by ID:", matchedEstado.name, "-> initialEstadoId:", initialEstadoId);
        } else {
          // Use the numeric ID directly as fallback
          initialEstadoId = String(estadoIdFromDb);
          console.log("[Wizard] Using estadoIdFromDb directly:", initialEstadoId);
        }
      }
      // Match by name as fallback
      if (!initialEstadoId && estadoNameFromDb && estadoNameFromDb !== "Activo") {
        const matchedEstado = allEstados.find((e) => e.name?.toLowerCase() === estadoNameFromDb.toLowerCase());
        if (matchedEstado) {
          initialEstadoId = String(matchedEstado.data?.id ?? matchedEstado._id);
          console.log("[Wizard] Matched estado by name:", matchedEstado.name, "-> initialEstadoId:", initialEstadoId);
        }
      }
    }
    if (!initialEstadoId && user.metadata?.estadoId) {
      initialEstadoId = String(user.metadata.estadoId);
    }
    if (!initialEstadoId && (user.metadata as any)?.estado_id) {
      initialEstadoId = String((user.metadata as any).estado_id);
    }
    if (!initialEstadoId) {
      initialEstadoId = String(activoEstado?.data?.id || "");
    }
    console.log("[Wizard] FINAL initialEstadoId:", initialEstadoId);

    /*
      LA SEDE ES LA DEL PROYECTO. Se configura ahí y el alta ya no la pregunta (el paso «Extras» se
      sacó). Sólo si el proyecto no tiene sede se cae a la del último contrato, para no borrarla.
    */
    let initialSedeId = project?.metadata?.sedeId ? String(project.metadata.sedeId) : lastContract?.sede_id ? String(lastContract.sede_id) : "";
    if (!initialSedeId && lastContract?.nombre_sede) {
      const foundSede = allSedes.find((s) => s.name === lastContract.nombre_sede);
      if (foundSede) initialSedeId = String(foundSede.data.id);
    }
    if (!initialSedeId && (user.metadata as any)?.sedeId) {
      initialSedeId = String((user.metadata as any).sedeId);
    }

    let initialRolFrameId = lastContract?.rol_frame_id ? String(lastContract.rol_frame_id) : "";
    if (!initialRolFrameId && lastProject?.nombre_rol_frame) {
      // Find role frame by name
      const foundRF = allRoleFrames.find((rf) => rf.name === lastProject.nombre_rol_frame);
      if (foundRF) initialRolFrameId = String(foundRF.data.rol.id);
    } else if (!initialRolFrameId && user.metadata?.roleFrameId) {
      initialRolFrameId = String(user.metadata.roleFrameId);
    }

    // Pre-fill assignments if they already exist in teamConfig
    // Primary source: project teamConfig
    const existingConfig = teamConfig.find((c) => String(c.userId) === String(user._id));
    let existingAssignments = existingConfig?.areaShiftAssignments || [];

    // Secondary source: user contract history (if teamConfig is missing it)
    if (existingAssignments.length === 0 && lastContract?.areaShiftAssignments) {
      existingAssignments = lastContract.areaShiftAssignments;
    }

    /*
      El área y turno que declaró la SOLICITUD.

      Al aprobar va PRIMERO, por encima del equipo y del contrato anterior: es lo que se pidió, y para
      alguien que ya está en el proyecto (una renovación) las otras dos fuentes traen el área vieja,
      que es justamente lo que la solicitud puede venir a cambiar.

      Para un alta nueva las dos de arriba están vacías —la persona todavía no es del equipo ni tiene
      contratos—, así que el wizard abría sin área y había que elegirla de nuevo. La solicitud la trae
      desde el móvil: es el área que coordina quien pidió el alta.
    */
    const areasDeLaSolicitud = Array.isArray((solicitud?.metadata as any)?.areaShiftAssignments) ? (solicitud!.metadata as any).areaShiftAssignments : [];
    if (areasDeLaSolicitud.length > 0) existingAssignments = areasDeLaSolicitud;

    // Map existing assignments to the wizard format, ensuring we use string IDs
    const areaShiftAssignments = (existingAssignments || []).map((a: any) => ({
      areaId: String(a.areaId?._id || a.areaId || ""),
      shiftIds: (a.shiftIds || []).map((s: any) => String(s?._id || s)),
    }));

    setSelectedUserForWizard(user);
    setWizardStep(1);
    setHerenciaReemplazo(null); // el aviso de herencia es por cada vez que se elige a quién reemplaza
    setAreaExpandida(undefined); // que el acordeón vuelva a abrir el área de ESTE miembro, no la del anterior

    // Aseguramos tener la lista de empresas para poblar los selects de Empresa del Contrato / Release.
    if (companies.length === 0) {
      companiesAPI
        .list()
        .then(setCompanies)
        .catch(() => {});
    }
    // El catálogo de Convenios traduce los `convenioIds` de la empresa a códigos de CCT: es lo que
    // permite ofrecer solo las categorías que ARCA le va a aceptar a esa empleadora. Si falla, la
    // lista queda vacía y no se filtra nada — mejor ofrecer de más que dejar al operador sin opciones.
    if (allConvenios.length === 0) {
      createSimpleCatalogApi("/convenios")
        .list()
        .then(setAllConvenios)
        .catch(() => {});
    }

    // Helper for date formatting
    const formatDate = (dateStr: any) => {
      if (!dateStr) return "";
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return "";
        return d.toISOString().split("T")[0];
      } catch {
        return "";
      }
    };

    // Horario de la solicitud (metadata.schedule = "HH:MM - HH:MM") como fallback cuando no hay contrato
    // previo (p.ej. al aprobar una solicitud desde el wizard).
    const metaSchedule = String((user.metadata as any)?.schedule || "");
    const [metaHoraInicio, metaHoraFin] = metaSchedule.includes("-") ? metaSchedule.split("-").map((s) => s.trim()) : ["", ""];

    // Se resetea ACÁ (no en el efecto) para que la primera corrida del auto-set de estado, tras este
    // reset, no confunda "recién abrí el wizard" con "el usuario cambió el Tipo de Contrato".
    prevContratoFrameIdRef.current = initialContratoFrameId;

    /*
      El filtro arranca en el convenio de la categoría que ya está cargada.

      Al editar un contrato existente —o al precargar desde el último contrato— la categoría YA define
      un encuadre. Arrancar en «todos» mostraría el catálogo entero de la empleadora con una categoría
      elegida de uno solo, y el primer cambio de convenio la limpiaría sin que nadie hubiera pedido
      cambiar de encuadre.

      Sin categoría todavía, queda en «todos»: no hay nada de dónde deducirlo.
    */
    /*
      El filtro de trámite arranca en el que ya está declarado, mirando en este orden:

        1. el tipo de contrato que PIDE la solicitud que se está aprobando;
        2. el trámite que la solicitud declaró;
        3. el tipo de contrato que se precargó de un contrato anterior (ese ya lo decidió).

      Al aprobar manda la solicitud: es el contrato que el formulario va a tener elegido, y arrancar
      filtrando por el trámite del contrato VIEJO dejaría el filtro contradiciendo al tipo elegido.
      Fuera de una aprobación no hay solicitud y queda el contrato anterior, que es un hecho consumado.
      Si no hay ninguno, queda sin filtrar: no se inventa una vía.
    */
    const metaParaTramite: any = (solicitud?.metadata as any) || (user.metadata as any) || {};
    const tramiteDelContrato = tipoImpositivoDeContrato(initialContratoId, contratoFrames, allEstados);
    const tramitePedido = solicitud && metaParaTramite.contratoId ? tipoImpositivoDeContrato(String(metaParaTramite.contratoId), contratoFrames, allEstados) : null;
    const tramiteDeclarado = esTipoImpositivo(metaParaTramite.tipoImpositivo) ? (metaParaTramite.tipoImpositivo as TipoImpositivo) : null;
    setFiltroTramite(tramitePedido || (solicitud ? tramiteDeclarado || tramiteDelContrato : tramiteDelContrato || tramiteDeclarado) || "");

    /*
      LO QUE PIDIÓ QUIEN CARGÓ LA SOLICITUD MANDA.

      La solicitud ya trae el contrato entero —tipo, período, días, jornadas, horario, categoría,
      importe, empresa y reemplazo—, así que aprobar es revisar y guardar, no volver a cargarlo todo
      mirando otra pantalla. Va al final del `setWizardData`, pisando lo que se dedujo de un contrato
      anterior (en un alta nueva no hay ninguno).

      La categoría viaja como `_id` del catálogo y el formulario trabaja con el id numérico: se traduce
      acá. Sin esa traducción quedaba sin elegir, y con ella en 0 quedaban el neto, el bruto y el resto.
    */
    const metaSolicitud: any = solicitud ? (solicitud.metadata as any) || {} : null;
    const catDeSolicitud = metaSolicitud?.categoriaSatId ? allCategoriasSat.find((c) => String(c._id) === String(metaSolicitud.categoriaSatId) || String(c.data?.id) === String(metaSolicitud.categoriaSatId)) : undefined;
    const rolDeSolicitud = (() => {
      const rf = metaSolicitud?.roles_frame?.[0] ?? metaSolicitud?.rolesFrameIds?.[0];
      const id = rf && typeof rf === "object" ? rf._id : rf;
      return id ? allRoleFrames.find((r) => String(r._id) === String(id)) : undefined;
    })();
    const plantillasDeSolicitud = metaSolicitud?.contratoId ? contratoFrames.filter((cf) => String(typeof cf.contratoId === "object" ? cf.contratoId?._id : cf.contratoId) === String(metaSolicitud.contratoId)) : [];
    const unicaPlantillaSolicitud = plantillasDeSolicitud.length === 1 ? plantillasDeSolicitud[0] : undefined;
    const deLaSolicitud: Record<string, any> = !metaSolicitud
      ? {}
      : {
          ...(rolDeSolicitud?.data?.rol?.id != null ? { rol_frame_id: String(rolDeSolicitud.data.rol.id) } : {}),
          ...(catDeSolicitud?.data?.id != null ? { categoria_sat_id: String(catDeSolicitud.data.id) } : {}),
          ...(metaSolicitud.contratoId ? { contrato_id: String(metaSolicitud.contratoId) } : {}),
          ...(unicaPlantillaSolicitud ? { contrato_frame_id: unicaPlantillaSolicitud._id, nombre_contrato: unicaPlantillaSolicitud.name, tipo_contrato_id: unicaPlantillaSolicitud.data?.id != null ? String(unicaPlantillaSolicitud.data.id) : "" } : {}),
          ...(metaSolicitud.empresaContratoId ? { empresaContratoId: String(metaSolicitud.empresaContratoId) } : {}),
          ...(metaSolicitud.startDate ? { fecha_alta_contrato: String(metaSolicitud.startDate).slice(0, 10) } : {}),
          ...(metaSolicitud.dueDate ? { fecha_baja_contrato: String(metaSolicitud.dueDate).slice(0, 10) } : {}),
          ...(Number(metaSolicitud.diasPorSemana) ? { dias_por_semana: Number(metaSolicitud.diasPorSemana) } : {}),
          ...(Array.isArray(metaSolicitud.diasSemana) && metaSolicitud.diasSemana.length > 0 ? { dias_semana: metaSolicitud.diasSemana as number[] } : {}),
          ...(metaSolicitud.diasRotativos !== undefined ? { dias_rotativos: !!metaSolicitud.diasRotativos } : {}),
          ...(Number(metaSolicitud.workdaysCount) ? { cantidad_jornadas_laborales: Number(metaSolicitud.workdaysCount) } : {}),
          ...(Number(metaSolicitud.dailyRate) ? { sueldo_jornada: Number(metaSolicitud.dailyRate) } : {}),
          ...(metaSolicitud.isReplacement !== undefined ? { reemplazo: !!metaSolicitud.isReplacement } : {}),
          ...(metaSolicitud.empleado_id_reemplezado ? { empleado_id_reemplezado: String(metaSolicitud.empleado_id_reemplezado) } : {}),
        };

    const catInicial = initialCatId ? allCategoriasSat.find((c) => String(c.data?.id) === String(initialCatId)) : undefined;
    setConvenioFiltro(String((catDeSolicitud || catInicial)?.data?.convenio || "").trim());
    setVerTodasDelConvenio(false);
    setAvisoConvenio("");

    // Reset wizard data with pulled data or defaults
    setWizardData({
      rol_frame_id: initialRolFrameId,
      categoria_sat_id: initialCatId,
      contrato_id: initialContratoId,
      contrato_frame_id: initialContratoFrameId,
      nombre_contrato: initialNombreContrato,
      tipo_contrato_id: initialTipoContratoId,
      estado_id: initialEstadoId,
      empresaContratoId: lastContract?.empresaContratoId ? String(lastContract.empresaContratoId) : "",
      empresaReleaseId: lastContract?.empresaReleaseId ? String(lastContract.empresaReleaseId) : "",
      hora_inicio: lastContract?.hora_inicio || metaHoraInicio || "09:00",
      hora_fin: lastContract?.hora_fin || metaHoraFin || "18:00",
      fecha_alta_contrato: formatDate(lastContract?.fecha_alta_contrato) || formatDate(new Date()),
      fecha_baja_contrato: formatDate(lastContract?.fecha_baja_contrato),
      cantidad_jornadas_laborales: lastContract?.cantidad_jornadas_laborales || 5,
      // Los contratos anteriores a este campo no traen días: se abren vacíos y hay que elegirlos,
      // en vez de inventar una semana que nadie declaró.
      dias_por_semana: Number((lastContract as any)?.dias_por_semana) || 5,
      dias_semana: Array.isArray((lastContract as any)?.dias_semana) ? ((lastContract as any).dias_semana as number[]) : [],
      dias_rotativos: !!(lastContract as any)?.dias_rotativos,
      sueldo_jornada: lastContract?.sueldo_jornada || 0,
      sueldo_mano: lastContract?.sueldo_mano || 0,
      sueldo_mano_texto: lastContract?.sueldo_mano_texto || "",
      sueldo_diario_neto: lastContract?.sueldo_diario_neto || 0,
      diferencia_diaria_neto: lastContract?.diferencia_diaria_neto || 0,
      sueldo_neto: lastContract?.sueldo_neto || 0,
      sueldo_bruto: lastContract?.sueldo_bruto || 0,
      sede_id: initialSedeId,
      reemplazo: lastContract?.reemplazo || false,
      empleado_id_reemplezado: lastContract?.empleado_id_reemplezado || "",
      observaciones: lastContract?.observaciones || "",
      areaShiftAssignments: areaShiftAssignments,
      // Lo de la solicitud, último: es lo que pidió quien la cargó.
      ...deLaSolicitud,
    });
  };

  // Al llegar desde "Editar" del modal de Contratos (admin), abrir el wizard precargado con ese contrato.
  const wizardAutoOpenedRef = useRef(false);
  useEffect(() => {
    const st = location.state as any;
    if (wizardAutoOpenedRef.current) return;
    if (!st?.openWizardFor || !project) return;
    const { userId, contractIndex } = st.openWizardFor;
    if (!userId) return;
    wizardAutoOpenedRef.current = true;
    handleOpenWizard(userId, undefined, typeof contractIndex === "number" ? contractIndex : undefined);
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, project]);

  /**
   * Campos del paso 1 que faltan completar. Es la única fuente de verdad de qué es obligatorio: los
   * asteriscos de las etiquetas salen de esta misma lista, para que no prometan algo que después no
   * se valida (antes el único chequeo real era el de área/turno).
   */
  const faltantesPaso1 = (): string[] => {
    const faltan: string[] = [];
    if (!wizardData.rol_frame_id) faltan.push("Role Frame a Desempeñar");
    if (!esServicios && !wizardData.categoria_sat_id) faltan.push("Categoría");
    if (!wizardData.contrato_id) faltan.push("Tipo de contrato");
    // La Plantilla solo se elige a mano cuando el contrato tiene más de una (si hay una sola se
    // asigna sola, y si no hay ninguna se puede guardar igual: solo no se podrá generar el PDF).
    const plantillas = contratoFrames.filter((cf) => (typeof cf.contratoId === "object" ? cf.contratoId?._id : cf.contratoId) === wizardData.contrato_id);
    if (plantillas.length > 1 && !wizardData.contrato_frame_id) faltan.push("Plantilla");
    if (!wizardData.estado_id) faltan.push("Estado");
    // Un contrato a plazo tiene que decir cuándo termina; los de tiempo indeterminado no llevan baja
    // (de hecho el campo ni se muestra).
    const contratoSel = contratos.find((c) => c._id === wizardData.contrato_id);
    if (contratoSel && !contratoSel.data.esTiempoIndeterminado && !wizardData.fecha_baja_contrato) faltan.push("Fecha baja contrato");
    if (!wizardData.areaShiftAssignments || wizardData.areaShiftAssignments.length === 0) faltan.push("Área y turno");
    if (!wizardData.hora_inicio || !wizardData.hora_fin) faltan.push("Horario (entrada y salida)");
    if (horarioExcedidoWizard) faltan.push(`Horario dentro de las ${limiteHorasWizard} h por jornada del contrato`);
    if (erroresJornadasWizard.jornadas) faltan.push("Cantidad de jornadas");
    if (erroresJornadasWizard.motivo || erroresJornadasWizard.nota) faltan.push("Motivo del ajuste de jornadas");
    /*
      LOS DÍAS QUE TRABAJA SON OBLIGATORIOS, no una sugerencia.

      El aviso ámbar de abajo del campo («Elegí exactamente 5 día(s)») decía lo que faltaba pero no
      frenaba nada: se guardaba igual, con la cantidad declarada y ningún día marcado. Eso deja un
      contrato afirmando que trabaja cinco días sin decir cuáles — el dato queda a medias justo donde
      importa, que es cuando hay que saber si un feriado o una licencia le caen en día laborable.

      La regla vive en `faltaDefinirDias` y no se copia acá: comparte con el aviso del campo la parte
      de los días, y agrega la cantidad — que al guardar tampoco puede quedar vacía.
    */
    const faltaDias = faltaDefinirDias(wizardData.dias_por_semana, wizardData.dias_rotativos, wizardData.dias_semana);
    if (faltaDias) faltan.push(`Días que trabaja (${faltaDias})`);
    return faltan;
  };

  const handleSaveWizard = async () => {
    if (!selectedUserForWizard || !project) return;

    const faltan = faltantesPaso1();
    if (faltan.length > 0) {
      sweetAlert.error("Faltan campos obligatorios", `Completá: ${faltan.join(", ")}.`);
      setWizardStep(1);
      return;
    }

    // Determine if this is an update (existing member) or new assignment
    const isExistingMember = teamMembers.some((m) => m._id === selectedUserForWizard._id);

    try {
      setLoading(true);
      // Construct the data to send to specific assignment endpoint
      // backend will handle UserProject and internal assignedUsers
      // Extract first assignment for backward-compatible contract fields
      const firstAssignment = wizardData.areaShiftAssignments[0];
      const primaryShiftId = firstAssignment?.shiftIds?.[0] || "";
      const primaryAreaId = firstAssignment?.areaId || "";

      // Los contratos de tiempo indeterminado no llevan fecha de baja
      // El Contrato (tipo) es la fuente de verdad de "tiempo indeterminado"; se resuelve por ahí y no
      // por la Plantilla, para que funcione aunque el Contrato todavía no tenga ninguna asignada.
      const contratoSel = contratos.find((c) => c._id === wizardData.contrato_id);
      const esTiempoIndeterminado = contratoSel ? contratoSel.data.esTiempoIndeterminado : false;

      // El rol frame se toma de `roles_frame`; el backend no lo resuelve desde `infos`, así que
      // mandamos el nombre elegido para que no quede "Sin rol frame".
      const rfSel = allRoleFrames.find((rf) => String(rf.data?.rol?.id) === String(wizardData.rol_frame_id));

      await projectsAPI.assignMember(project._id, {
        userId: selectedUserForWizard._id,
        // Aprobar SIEMPRE agrega un contrato, aunque la persona ya esté en el equipo: una renovación
        // es un contrato nuevo y el anterior tiene que seguir estando (es el historial de la persona).
        isUpdate: approvingSolicitudId ? false : isExistingMember,
        // Si se está editando un contrato puntual, el backend actualiza ESE índice (no el último).
        contractIndex: approvingSolicitudId ? undefined : editingContractIndex ?? undefined,
        // Si el wizard se abrió para aprobar una solicitud, el backend la marca aprobada.
        // Qué solicitud se está aprobando: el contrato va en la persona real, así que hay que decir cuál.
        approveSolicitud: approvingSolicitudId || undefined,
        contract: {
          ...wizardData,
          fecha_baja_contrato: esTiempoIndeterminado ? "" : wizardData.fecha_baja_contrato,
          areaId: primaryAreaId,
          shiftId: primaryShiftId,
          areaShiftAssignments: wizardData.areaShiftAssignments,
          externalEmployeeId: (selectedUserForWizard.metadata as any)?.id,
          externalProjectId: (project.metadata as any)?.id || project.externalId,
          sede_id: Number(wizardData.sede_id),
          estado_id: Number(wizardData.estado_id),
          categoria_sat_id: Number(wizardData.categoria_sat_id),
          nombre_contrato: wizardData.nombre_contrato,
          tipo_contrato_id: wizardData.tipo_contrato_id ? Number(wizardData.tipo_contrato_id) : null,
          nombre_rol_frame: rfSel?.name || "",
          rol_frame_id: Number(wizardData.rol_frame_id),
          empleado_id_reemplezado: wizardData.empleado_id_reemplezado ? Number(wizardData.empleado_id_reemplezado) : null,
          dias_por_semana: wizardData.dias_por_semana,
          dias_semana: wizardData.dias_semana,
          dias_rotativos: wizardData.dias_rotativos,
          // Enviar null (no "") para que Mongoose no falle al castear a ObjectId cuando no se elige empresa.
          empresaContratoId: wizardData.empresaContratoId || null,
          empresaReleaseId: wizardData.empresaReleaseId || null,
        },
      });

      /*
        El oficio elegido por el buscador se le suma a la FICHA de la persona.

        Que además sea Utilero no es un dato de este contrato: la próxima vez tiene que aparecer en la
        lista corta sin que nadie lo vuelva a buscar. Va con su propio catch porque el miembro ya quedó
        guardado y eso es lo que no se puede perder.
      */
      if (rolFrameAgregado) {
        try {
          await usersAPI.agregarRolesFrame(selectedUserForWizard._id, [rolFrameAgregado._id]);
        } catch (e) {
          console.error("No se pudo agregar el rol empresa a la ficha:", e);
        }
      }

      const wasApproving = !!approvingSolicitudId;
      const nombre = selectedUserForWizard.metadata?.fullName || selectedUserForWizard.firstName || "El usuario";
      sweetAlert.success(wasApproving ? "Solicitud Aprobada" : isExistingMember ? "Miembro Actualizado" : "Miembro Agregado", `${nombre} ha sido ${wasApproving ? "aprobado e incorporado al equipo" : isExistingMember ? "actualizado" : "incorporado al equipo"}.`);

      // Refresh Data
      const updatedProject = await projectsAPI.getProject(project._id, { team: "ids" });
      setProject(updatedProject);
      setTeamConfig(updatedProject.teamConfig || []);

      await fetchFullTeamLite();
      fetchTeamPage(teamPage);

      // Si se aprobó una solicitud, refrescar la pestaña Solicitudes y su contador.
      if (wasApproving) {
        setSolicitudesRefresh((x) => x + 1);
        try {
          const solis = await usersAPI.listSolicitudes();
          setSolicitudesCount(solis.filter((u) => u.metadata?.projectIds?.includes(projectId!) && (u.metadata?.solicitudStatus || "pendiente") === "pendiente").length);
        } catch {
          /* noop */
        }
      }
      setApprovingSolicitudId(null);

      setSelectedUserForWizard(null);
      setRolFrameAgregado(null);
      setRolFrameBusqueda("");
      setShowAddModal(false);
    } catch (error: any) {
      console.error("Assign member error:", error);
      let errorMsg = "Internal server error during assignment";
      if (error.response?.data?.error) {
        errorMsg = error.response.data.error;
        if (error.response?.data?.details) {
          errorMsg += `\nDetalles: ${error.response.data.details}`;
        }
      }
      sweetAlert.error("Error", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!project) return;
    const result = await sweetAlert.confirm("¿Retirar del equipo?", "El usuario será retirado del proyecto y se eliminarán sus asignaciones de áreas y turnos.");
    if (!result.isConfirmed) return;

    try {
      setLoading(true);

      // Use the new thorough removal endpoint
      await projectsAPI.removeMember(project._id, userId);

      // Refresh local state (equipo liviano + página actual, no todo el tenant → evita OOM)
      const updatedProject = await projectsAPI.getProject(project._id, { team: "ids" });
      setProject(updatedProject);
      setTeamConfig(updatedProject.teamConfig || []);
      await fetchFullTeamLite();
      fetchTeamPage(teamPage);

      sweetAlert.success("Usuario Retirado", "El usuario ha sido retirado del equipo y sus asignaciones han sido limpiadas.");
    } catch (error: any) {
      console.error("Error removing user:", error);
      sweetAlert.error("Error", error.response?.data?.error || "No se pudo retirar al usuario.");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Sube el PDF de "Alta ARCA"/"Alta Servicios" de un contrato puntual. A diferencia de editar/eliminar,
   * el modal de contratos queda ABIERTO después de subir, así que en vez de recargar todo el equipo se
   * actualiza `selectedMemberForDetail` in-place (misma referencia que usa EmployeeContractsModal).
   */
  const handleUploadAltaDocumento = async (user: User, contractIndex: number, file: File) => {
    if (!projectId) return;
    try {
      const { altaDocumentoUrl, altaDocumentoNombre } = await projectsAPI.uploadAltaDocumento(projectId, user._id, contractIndex, file);
      setSelectedMemberForDetail((prev) => {
        if (!prev || prev._id !== user._id || !prev.metadata?.projects) return prev;
        return {
          ...prev,
          metadata: {
            ...prev.metadata,
            projects: prev.metadata.projects.map((p) => {
              const pId = typeof p.projectId === "object" ? (p.projectId as any)?._id : p.projectId;
              if (String(pId) !== String(projectId)) return p;
              const contracts = [...(p.contracts || [])];
              if (!contracts[contractIndex]) return p;
              contracts[contractIndex] = { ...contracts[contractIndex], altaDocumentoUrl, altaDocumentoNombre };
              return { ...p, contracts };
            }),
          },
        };
      });
      sweetAlert.success("Documento subido", "El documento se guardó correctamente.");
    } catch (error: any) {
      sweetAlert.error("Error", error.response?.data?.error || "No se pudo subir el documento.");
    }
  };

  /* --------------------------------View ---------------------------------- */

  if (!project && !loading) {
    return <EmptyState icon={faBriefcase} title="Proyecto no encontrado" description="El proyecto no existe o no tienes acceso." action={{ label: "volver", onClick: () => navigate(-1) }} />;
  }

  // Último contrato del empleado en ESTE proyecto (mismo criterio que la columna Contrato).
  const getActiveContract = (user: User): any => {
    const projectMeta = user.metadata?.projects?.find((p: any) => {
      const pId = p.projectId;
      const idToCheck = typeof pId === "object" ? (pId as any)?._id : pId;
      return String(idToCheck) === String(projectId);
    });
    return getContratoActivo(projectMeta?.contracts as any[]);
  };

  // Áreas/turnos de un miembro en el proyecto: misma fuente que usa el wizard al abrirse (teamConfig y,
  // si ahí no está, el último contrato del miembro).
  const getMemberAssignments = (memberId: string): { areaId: string; shiftIds: string[] }[] => {
    const config = teamConfig.find((c) => String(c.userId) === String(memberId));
    let assignments: any[] = config?.areaShiftAssignments || [];
    if (assignments.length === 0) {
      const member = teamMembers.find((m) => String(m._id) === String(memberId));
      const lastContract = member ? getActiveContract(member) : null;
      assignments = lastContract?.areaShiftAssignments || [];
    }
    return (assignments || []).map((a: any) => ({
      areaId: String(a.areaId?._id || a.areaId || ""),
      shiftIds: (a.shiftIds || []).map((s: any) => String(s?._id || s)),
    }));
  };

  /**
   * Al elegir a quién reemplaza, el miembro hereda por defecto el área/turno de esa persona. Se descarta
   * lo que ya no aplique: áreas que el proyecto no tiene, turnos que el área ya no ofrece y áreas de
   * sistema (coordinador) si el miembro no tiene ese rol.
   */
  const applyReplacedMemberAssignments = (empleadoExternoId: string) => {
    const replaced = teamMembers.find((m) => String((m.metadata as any)?.id) === String(empleadoExternoId));
    if (!replaced) {
      setHerenciaReemplazo(null);
      return;
    }
    const replacedName = `${replaced.firstName || ""} ${replaced.lastName || ""}`.trim() || replaced.email;
    const isCoordinadorRole = coordinaAreas(selectedUserForWizard?.roles);

    const assignments = getMemberAssignments(replaced._id)
      .map((a) => {
        const areaConfig = (project?.areasConfig || []).find((c: any) => String(typeof c.areaId === "object" ? c.areaId?._id : c.areaId) === a.areaId);
        if (!areaConfig) return null;
        const areaObj = allAreas.find((ar) => String(ar._id) === a.areaId);
        if (areaObj?.isSystem && !isCoordinadorRole) return null;
        const allowedShiftIds = ((areaConfig as any).shiftIds || []).map((s: any) => String(typeof s === "object" ? s._id : s));
        const shiftIds = a.shiftIds.filter((s) => allowedShiftIds.includes(s));
        return shiftIds.length > 0 ? { areaId: a.areaId, shiftIds } : null;
      })
      .filter(Boolean) as { areaId: string; shiftIds: string[] }[];

    if (assignments.length === 0) {
      // Sin nada heredable se deja lo que ya eligió el usuario, pero se avisa para que lo cargue a mano.
      const origen = getMemberAssignments(replaced._id);
      setHerenciaReemplazo({
        ok: false,
        replacedName,
        detalle: origen.length === 0 ? "Esa persona no tiene área ni turno cargados en el proyecto. Elegí el área y el turno abajo." : "Su área o sus turnos ya no están disponibles en la configuración del proyecto. Elegí el área y el turno abajo.",
      });
      return;
    }

    /*
      SE HEREDA UN ÁREA Y UN TURNO, no todo lo que tenga la persona reemplazada.

      Es la misma regla que la elección a mano: dejar dos heredadas pondría al wizard en un estado que
      nadie puede volver a armar desde la pantalla, y bastaría tocar cualquier turno para perder una
      sin haber querido. Si la reemplazada tiene más de uno se avisa cuál se tomó, en `detalle`.
    */
    const heredadas = [{ areaId: assignments[0].areaId, shiftIds: assignments[0].shiftIds.slice(0, 1) }];

    const detalle = heredadas
      .map((a) => {
        const areaName = allAreas.find((ar) => String(ar._id) === a.areaId)?.name || a.areaId;
        const turnos = a.shiftIds.map((s) => allShifts.find((sh) => String(sh._id) === s)?.name || s).join(", ");
        return `${areaName} (${turnos})`;
      })
      .join(" + ");

    setWizardData((prev) => ({ ...prev, areaShiftAssignments: heredadas }));
    setAreaExpandida(undefined); // que se abra el área heredada, y no la que estuviera abierta
    setHerenciaReemplazo({ ok: true, replacedName, detalle });
  };

  // Render function for Table Row
  /**
   * CUÁNTAS HORAS SALEN DE UN HORARIO. Se calcula, no se guarda.
   *
   * Guardarlo sería un tercer dato que puede contradecir a los otros dos: alguien corrige la hora de
   * salida y el total queda diciendo otra cosa. Derivado, no se puede desincronizar.
   *
   * EL TURNO QUE CRUZA MEDIANOCHE es el caso que hay que contemplar: «18:00 - 00:00» son seis horas,
   * no menos veinticuatro. Cuando la salida no es posterior a la entrada, se le suma un día.
   */
  const horasPorDia = (inicio?: string, fin?: string): number | null => {
    const minutos = (h?: string) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || "").trim());
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    };
    const desde = minutos(inicio);
    const hasta = minutos(fin);
    if (desde == null || hasta == null) return null;
    const total = (hasta > desde ? hasta - desde : hasta + 24 * 60 - desde) / 60;
    // Un decimal: los horarios parten en medias horas, y «7,5» se lee mejor que «7,50».
    return Math.round(total * 10) / 10;
  };

  const renderUserRow = (user: User) => {
    const userConfig = teamConfig.find((c) => c.userId === user._id);
    const projectMeta = user.metadata?.projects?.find((p: any) => {
      const pId = p.projectId;
      const idToCheck = typeof pId === "object" ? (pId as any)?._id : pId;
      return String(idToCheck) === String(projectId);
    });
    const rolFrame = projectMeta?.nombre_rol_frame || (user.externalInfo?.rolFrames?.length ? user.externalInfo.rolFrames[0] : "-");
    const activeContract = getContratoActivo(projectMeta?.contracts as any[]);

    // `group` para que la celda fija pueda repintar su propio fondo en el hover: al ser opaca no la
    // alcanza el `hover:` de la fila, que queda por detrás.
    // El borde de abajo va en las celdas y no en el `<tr>`: la tabla usa `border-separate`, que
    // ignora los bordes de fila (ver el comentario del `<table>`).
    return (
      <tr key={user._id} onClick={() => handleOpenMemberDetail(user)} className="group [&>td]:border-b [&>td]:border-gray-100 dark:[&>td]:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer">
        <td className="sticky left-0 z-[5] px-4 py-3 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-800 border-r-2 border-gray-300 dark:border-gray-600 shadow-[4px_0_6px_-4px_rgba(0,0,0,0.25)]">
          {/* Sin avatar: era el mismo ícono genérico en las 65 filas, así que no distinguía a nadie
              y solo corría el nombre —lo único que sí identifica— hacia la derecha. */}
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}` : user.email}</p>
              <div className="flex flex-col gap-1.5 mt-0.5 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  {getUserVacationStatus(user._id) && (
                    <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                      <FontAwesomeIcon icon={faUmbrellaBeach} className="mr-1" />
                      VC
                    </span>
                  )}
                </div>
                {(() => {
                  const projectRespId = project?.metadata?.responsableId;
                  const userMetaId = user.metadata?.id;
                  const isReallyResponsable = projectRespId && userMetaId && Number(projectRespId) === Number(userMetaId);

                  if (isReallyResponsable) {
                    return <span className="w-fit text-[10px] px-2 py-0.5 rounded font-medium border whitespace-nowrap border-green-500/30 text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400">Coordinador del Proyecto</span>;
                  }
                  return null;
                })()}
              </div>
            </div>
          </div>
        </td>
        {/* Vigencia y fechas del ÚLTIMO contrato, pegadas al nombre: es lo primero que se mira de
            cada persona. Ver el encabezado «Último Contrato». */}
        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
          {activeContract ? (
            <div className="flex flex-col gap-1">
              {(() => {
                const vigente = esContratoVigente(activeContract);
                return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold w-fit ${vigente ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{vigente ? "VIGENTE" : "NO VIGENTE"}</span>;
              })()}
              <div className="flex flex-col gap-0.5">
                <span>
                  <span className="text-gray-400">Alta:</span> {formatContractDate(activeContract.fecha_alta_contrato)}
                </span>
                <span>
                  <span className="text-gray-400">Baja:</span> {activeContract.fecha_baja_contrato ? formatContractDate(activeContract.fecha_baja_contrato) : "—"}
                </span>
              </div>
            </div>
          ) : (
            "—"
          )}
        </td>
        {/* Cantidad de contratos de la persona EN ESTE PROYECTO (la columna Contrato muestra el último). */}
        <td className="px-4 py-3 text-center">
          <span className="text-sm font-bold px-2.5 py-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" title="Contratos de esta persona en el proyecto">
            {projectMeta?.contracts?.length || 0}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {(() => {
              const filteredRoles = user.roles.filter((r) => !r.name.toLowerCase().includes("responsable"));

              return (
                <>
                  {filteredRoles.slice(0, 3).map((r) => {
                    const lower = r.name.toLowerCase();
                    const isCoordinador = lower.includes("coordinador");

                    let badgeClasses = "border-blue-500/30 text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400";
                    if (isCoordinador) {
                      badgeClasses = "border-amber-500/30 text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400";
                    }

                    return (
                      <span key={r._id} className={`text-[10px] px-2 py-0.5 rounded font-medium border whitespace-nowrap ${badgeClasses}`}>
                        {r.name}
                      </span>
                    );
                  })}
                  {filteredRoles.length > 3 && <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">+{filteredRoles.length - 3}</span>}
                </>
              );
            })()}
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{rolFrame}</td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${user.metadata?.activo ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{user.metadata?.activo ? "ACTIVO" : "INACTIVO"}</span>
        </td>
        <td
          className="px-4 py-3 cursor-pointer"
          title="Editar miembro"
          onClick={(e) => {
            e.stopPropagation();
            handleOpenScheduleModal(user);
          }}
        >
          {(() => {
            const isCoord = checkIsCoordinator(user);

            // Build area data list
            let areaData: { id: string; name: string }[] = [];

            // 1. Priority: Detailed project team configuration (areaShiftAssignments)
            const config = teamConfig.find((c) => String(c.userId) === String(user._id));
            if (config?.areaShiftAssignments && config.areaShiftAssignments.length > 0) {
              areaData = config.areaShiftAssignments
                .map((asa: any) => {
                  const aId = typeof asa.areaId === "object" ? asa.areaId?._id : asa.areaId;
                  const aName = typeof asa.areaId === "object" ? asa.areaId?.name : allAreas.find((a) => String(a._id) === String(aId) || String(a.data?.id) === String(aId))?.name;
                  return aName ? { id: String(aId), name: aName } : null;
                })
                .filter(Boolean) as { id: string; name: string }[];
            }

            // 1b. Alternative: Check last contract in projects metadata (backup source)
            if (areaData.length === 0 && activeContract?.areaShiftAssignments && activeContract.areaShiftAssignments.length > 0) {
              areaData = activeContract.areaShiftAssignments
                .map((asa: any) => {
                  const aId = typeof asa.areaId === "object" ? asa.areaId?._id : asa.areaId;
                  const aName = typeof asa.areaId === "object" ? asa.areaId?.name : allAreas.find((a) => String(a._id) === String(aId))?.name;
                  return aName ? { id: String(aId), name: aName } : null;
                })
                .filter(Boolean) as { id: string; name: string }[];
            }
            // 2. Secondary: If coordinator and no detailed config, check coordinatorAssignments
            if (areaData.length === 0 && isCoord && project?.coordinatorAssignments) {
              const myAssignments = project.coordinatorAssignments.filter((asm) => {
                const uid = typeof asm.userId === "object" ? asm.userId?._id : asm.userId;
                return String(uid) === String(user._id);
              });
              const areaIds = Array.from(new Set(myAssignments.map((asm) => (typeof asm.areaId === "object" ? asm.areaId?._id : asm.areaId))));
              areaData = areaIds
                .map((id) => {
                  const a = allAreas.find((area) => String(area._id) === String(id));
                  return a ? { id: String(a._id), name: a.name } : null;
                })
                .filter(Boolean) as { id: string; name: string }[];
            }

            // 3. Fallback: Global user area (legacy/basic)
            if (areaData.length === 0) {
              const userAreaId = typeof user.areaId === "object" ? user.areaId?._id : user.areaId;
              const userAreaName = typeof user.areaId === "object" ? user.areaId?.name : allAreas.find((a) => String(a._id) === String(userAreaId))?.name;
              if (userAreaId && userAreaName) {
                areaData = [{ id: String(userAreaId), name: userAreaName }];
              }
            }

            if (areaData.length === 0) return <span className="text-xs text-gray-400">—</span>;

            return (
              <div className="flex flex-wrap items-center gap-1.5">
                {areaData.map((ad, i) => {
                  const shifts = getStandardShifts(user, userConfig, activeContract, ad.id, ad.name);
                  return (
                    <div key={i} className="flex flex-col gap-1">
                      <div className="group relative flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 pl-2 pr-1 py-1 rounded-lg border border-blue-100 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-600 transition-all w-fit">
                        <span className="text-blue-700 dark:text-blue-400 text-[10px] font-black uppercase tracking-widest whitespace-nowrap">{ad.name}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingShiftsData({ user, areaId: ad.id, areaName: ad.name, assignmentType: "standard" });
                          }}
                          className="flex items-center justify-center w-4 h-4 rounded-md text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors text-xs font-black"
                          title="Ver turnos"
                        >
                          +
                        </button>
                      </div>
                      {shifts.length > 0 && (
                        <div className="flex flex-col gap-1 mt-0.5 pl-0.5">
                          {shifts.map((s, idx) => (
                            <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-50/50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-100/50 dark:border-blue-900/40 whitespace-nowrap w-fit" title={`${s.startTime} - ${s.endTime}`}>
                              {s.name} ({s.startTime} - {s.endTime})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </td>
        <td className="px-4 py-3">
          {(() => {
            const myCoordinatedAssignments =
              project?.coordinatorAssignments?.filter((asm) => {
                const uid = typeof asm.userId === "object" ? (asm.userId as any)?._id : asm.userId;
                return String(uid) === String(user._id);
              }) || [];

            if (myCoordinatedAssignments.length === 0) return <span className="text-xs text-gray-400">—</span>;

            const coordAreaDataMap = new Map<string, { id: string; name: string }>();
            myCoordinatedAssignments.forEach((asm) => {
              const aid = typeof asm.areaId === "object" ? (asm.areaId as any)?._id : asm.areaId;
              const aName = typeof asm.areaId === "object" ? (asm.areaId as any)?.name : allAreas.find((a) => String(a._id) === String(aid))?.name;
              if (aid && aName) {
                coordAreaDataMap.set(String(aid), { id: String(aid), name: aName });
              }
            });

            const coordAreaData = Array.from(coordAreaDataMap.values());

            return (
              <div className="flex flex-wrap items-center gap-1.5">
                {coordAreaData.map((ad, i) => {
                  const shifts = getCoordinatedShifts(user, ad.id);
                  // Total del área: personas distintas entre todos sus horarios (sin repetir a
                  // quien esté asignado a más de uno).
                  const totalArea = getAreaPeopleCount(
                    ad.id,
                    shifts.map((s) => String(s._id)),
                  );
                  return (
                    <div key={i} className="flex flex-col gap-1">
                      <div className="group relative flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 pl-2 pr-1 py-1 rounded-lg border border-amber-100 dark:border-amber-800 hover:border-amber-300 dark:hover:border-amber-600 transition-all w-fit">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenAreaShiftDetail(ad.id, ad.name, null, shifts);
                          }}
                          className="text-amber-700 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest whitespace-nowrap hover:text-amber-900 dark:hover:text-amber-200 transition-colors cursor-pointer"
                          title={`Ver las personas de ${ad.name} en los horarios que supervisa: ${totalArea} activa${totalArea === 1 ? "" : "s"} con contrato vigente (cada persona una sola vez)`}
                        >
                          {ad.name} ({totalArea})
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingShiftsData({ user, areaId: ad.id, areaName: ad.name, assignmentType: "coordinated" });
                          }}
                          className="flex items-center justify-center w-4 h-4 rounded-md text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors text-xs font-black"
                          title="Ver turnos supervisados"
                        >
                          +
                        </button>
                      </div>
                      {shifts.length > 0 && (
                        <div className="flex flex-col gap-1 mt-0.5 pl-0.5">
                          {shifts.map((s, idx) => {
                            const coordinados = getAreaShiftPeopleCount(ad.id, String(s._id));
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenAreaShiftDetail(ad.id, ad.name, s);
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50/50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-100/50 dark:border-amber-900/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 hover:border-amber-300 dark:hover:border-amber-700 transition-colors whitespace-nowrap w-fit cursor-pointer"
                                title={`Ver las ${coordinados} persona${coordinados === 1 ? "" : "s"} activa${coordinados === 1 ? "" : "s"} con contrato vigente en ${ad.name} / ${s.name}`}
                              >
                                {s.name} ({s.startTime} - {s.endTime})<span className="font-black text-amber-800 dark:text-amber-300">({coordinados})</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </td>
        {/*
          Coordinadores supervisados: sólo en la fila del supervisor del proyecto. Cada coordinador con
          las áreas que tiene a cargo, sin turnos: el detalle por turno está en Área/Turno Coordinada
          de la fila de cada coordinador. Los nombres salen de `allUsers` (el equipo completo), no de
          la página cargada, para que no falte ninguno.
        */}
        <td className="px-4 py-3">
          {(() => {
            const respId = project?.metadata?.responsableId;
            const userMetaId = (user.metadata as any)?.id;
            const esSupervisor = respId != null && userMetaId != null && Number(respId) === Number(userMetaId);
            if (!esSupervisor) return <span className="text-xs text-gray-400">—</span>;

            const areasPorCoordinador = new Map<string, Map<string, string>>();
            for (const asm of project?.coordinatorAssignments || []) {
              const uid = typeof asm.userId === "object" ? asm.userId?._id : asm.userId;
              const aid = typeof asm.areaId === "object" ? asm.areaId?._id : asm.areaId;
              if (!uid || !aid) continue;
              const nombreArea = (typeof asm.areaId === "object" ? asm.areaId?.name : "") || allAreas.find((a) => String(a._id) === String(aid))?.name || "Área";
              if (!areasPorCoordinador.has(String(uid))) areasPorCoordinador.set(String(uid), new Map());
              areasPorCoordinador.get(String(uid))!.set(String(aid), nombreArea);
            }
            if (areasPorCoordinador.size === 0) return <span className="text-xs italic text-gray-400">Sin supervisores</span>;

            return (
              <div className="flex flex-col gap-2">
                {[...areasPorCoordinador].map(([uid, areas]) => {
                  const coord = allUsers.find((x) => String(x._id) === uid);
                  return (
                    <div key={uid} className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">{coord ? `${coord.firstName || ""} ${coord.lastName || ""}`.trim() || coord.email : "Supervisor"}</span>
                      <div className="flex flex-wrap gap-1">
                        {[...areas].map(([aid, nombre]) => (
                          <span key={aid} className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest whitespace-nowrap bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                            {nombre}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </td>
        <td className="px-4 py-3">
          <span className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300" title="Ver contratos para descargar">
            <FontAwesomeIcon icon={faFileContract} className="h-3 w-3 text-blue-500 dark:text-blue-400 shrink-0" />
            {activeContract?.nombre_contrato || "-"}
          </span>
        </td>
        {/* Estado del contrato (Pedido servicios, Disponible, ...) — distinto del estado del usuario. */}
        <td className="px-4 py-3">{activeContract?.nombre_estado_empleado ? <EstadoBadge name={activeContract.nombre_estado_empleado} className="text-[10px] whitespace-nowrap" /> : <span className="text-xs text-gray-400">—</span>}</td>
        {/* Estado impositivo (Alta ARCA / Alta Servicios): según el Tipo de Contrato, no el estado actual. */}
        <td className="px-4 py-3">
          {(() => {
            const estadoImpositivo = activeContract ? estadoImpositivoDelContrato(activeContract, contratoFrames, allEstados) : null;
            if (!estadoImpositivo) return <span className="text-xs text-gray-400">—</span>;
            return estadoImpositivo.data?.etiquetaSecundaria?.trim() ? <EstadoSecundarioBadge estado={estadoImpositivo} className="text-[10px] whitespace-nowrap" /> : <EstadoBadge name={estadoImpositivo.name} className="text-[10px] whitespace-nowrap" />;
          })()}
        </td>
        {/* Reemplazo: a quién reemplaza esta persona en su contrato vigente. */}
        <td className="px-4 py-3">
          {activeContract?.reemplazo ? (
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded border border-amber-200/50 dark:border-amber-800/50 w-fit">
              <FontAwesomeIcon icon={faIdCard} className="text-[9px]" />
              <span>
                {(() => {
                  const replaced = allUsers.find((u) => (u.metadata as any)?.id === activeContract.empleado_id_reemplezado);
                  return replaced ? `${replaced.firstName} ${replaced.lastName}` : `ID: ${activeContract.empleado_id_reemplezado}`;
                })()}
              </span>
            </div>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        {/* Monto / Jornadas del contrato vigente (mismo formato que la tabla de Contratos). */}
        <td className="px-4 py-3 text-right whitespace-nowrap">
          {activeContract?.sueldo_mano != null ? (
            <>
              <div className="text-sm font-bold text-primary-600 dark:text-primary-400">${Number(activeContract.sueldo_mano).toLocaleString("es-AR")}</div>
              {activeContract?.cantidad_jornadas_laborales ? <div className="text-xs text-gray-400">{activeContract.cantidad_jornadas_laborales} jor.</div> : null}
            </>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        {/*
          LAS JORNADAS, EN SU PROPIA COLUMNA.

          Ya estaban, pero como renglón chico debajo del monto: ahí se leen como una aclaración de la
          cifra —«$44.282,11 de 1 jornada»— y no como un dato que se pueda recorrer y comparar entre
          filas, que es para lo que se mira. En su columna se pueden barrer con el ojo.

          Sigue apareciendo también bajo el monto: ahí es el denominador que explica esa cifra, y
          sacarlo dejaría el importe sin decir de cuántas jornadas sale.
        */}
        <td className="px-4 py-3 text-right whitespace-nowrap">
          {activeContract?.cantidad_jornadas_laborales ? (
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{activeContract.cantidad_jornadas_laborales}</span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        {/*
          CUÁNTOS DÍAS Y CUÁLES.

          La cantidad con la unidad pegada («5 d»), porque el número solo, en una fila que al lado
          tiene jornadas y horas, no dice de qué es. Y debajo los días concretos: «5» no alcanza para
          saber si son de lunes a viernes o rotativos, que es la diferencia que importa al armar un
          turno o al cruzar con las novedades.

          ROTATIVOS NO ES UNA LISTA VACÍA: trabaja esa cantidad de días pero no siempre los mismos.
          Mostrarlo como «—» lo haría indistinguible de un contrato al que le falta cargar los días,
          que es un dato incompleto y no una modalidad.
        */}
        <td className="px-4 py-3 text-right whitespace-nowrap">
          {activeContract?.dias_por_semana ? (
            <div className="flex flex-col items-end gap-1">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                {activeContract.dias_por_semana}
                <span className="ml-0.5 text-xs font-normal text-gray-400">d</span>
              </span>
              {activeContract?.dias_rotativos ? (
                <span className="text-[11px] text-gray-500 dark:text-gray-400 italic">Rotativos</span>
              ) : Array.isArray(activeContract?.dias_semana) && activeContract.dias_semana.length > 0 ? (
                // Sin `flex-wrap`: los días son una unidad y partirlos en dos renglones —«Lu Ma Mi Ju»
                // arriba y «Vi» abajo— hace crecer la fila y que la semana deje de leerse de un
                // vistazo. La columna se ensancha, que es hacia donde la tabla ya scrollea.
                <span className="flex justify-end gap-1 whitespace-nowrap">
                  {DIAS_SEMANA.filter((d) => (activeContract.dias_semana as number[]).includes(d.indice)).map((d) => (
                    <span key={d.indice} title={d.largo} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                      {d.corto}
                    </span>
                  ))}
                </span>
              ) : (
                // Ámbar y no gris: no es «no aplica», es un dato que falta y que el alta necesita.
                <span className="text-[11px] text-amber-600 dark:text-amber-400">Sin definir</span>
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 font-medium whitespace-nowrap">{activeContract?.hora_inicio ? `${activeContract.hora_inicio} - ${activeContract.hora_fin}` : "-"}</td>
        {/* Las horas que sale de ese horario. Se calcula y no se guarda: ver `horasPorDia`. */}
        <td className="px-4 py-3 text-right whitespace-nowrap">
          {(() => {
            const horas = horasPorDia(activeContract?.hora_inicio, activeContract?.hora_fin);
            return horas == null ? (
              <span className="text-xs text-gray-400">—</span>
            ) : (
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                {horas.toLocaleString("es-AR")}
                <span className="ml-0.5 text-xs font-normal text-gray-400">h</span>
              </span>
            );
          })()}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenScheduleModal(user);
              }}
              className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
              title="Editar miembro"
            >
              <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveUser(user._id);
              }}
              className="p-1 text-gray-400 hover:text-red-500 transition-colors ml-1"
              title="Retirar del proyecto"
            >
              <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const renderUserCard = (user: User) => {
    const userConfig = teamConfig.find((c) => String(c.userId) === String(user._id));
    return (
      <UserCard
        key={user._id}
        user={user}
        allProjects={allProjects}
        allClients={allClients}
        vacations={vacations as any}
        projectContext={project!}
        userConfig={userConfig}
        userLookup={userLookup}
        onClick={() => handleOpenMemberDetail(user)}
        actions={[
          {
            icon: faEdit,
            title: "Editar Horario",
            onClick: () => handleOpenScheduleModal(user),
          },
          {
            icon: faTrash,
            title: "Retirar del equipo",
            onClick: () => handleRemoveUser(user._id),
            className: "text-red-500 hover:text-red-700",
          },
        ]}
      />
    );
  };

  return (
    <PageLayout
      title="Gestionar Equipo"
      itemCount={displayedCount}
      subtitle="Agrega o quita miembros del equipo"
      onBack={() => navigate(-1)}
      faIcon={{ icon: faUsers }}
      clientMiniAvatar={
        project
          ? {
              label: displayedClientName,
              fallback: displayedClientName.charAt(0).toUpperCase(),
              src: client?.logo,
            }
          : undefined
      }
      badge={project ? { text: project.name, variant: "default" } : undefined}
      badgeSecondary={sedeName ? { text: sedeName, variant: "default" } : undefined}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry?.title || "Información",
        content: helpEntry?.content,
      }}
      modal={
        openCoordinadoresInfo
          ? {
              isOpen: true,
              onClose: () => setOpenCoordinadoresInfo(false),
              title: "Asignación de Supervisores",
              content: <p className="text-gray-600 dark:text-gray-300">Asigna un supervisor designado para cada combinación de Área y Turno del proyecto. Todas las combinaciones deben estar cubiertas.</p>,
            }
          : undefined
      }
      headerActions={
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddModal(true)} title="Agregar miembro" aria-label="Agregar miembro" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
            <FontAwesomeIcon icon={faPlus} />
          </button>
          {/* Atajo a Contratos → Gestión de Contratos, ya filtrado por este proyecto. */}
          <button onClick={() => navigate(`/admin/contracts?tab=management&projectId=${projectId}`)} title="Gestión masiva de Contratos de este proyecto" className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faFileContract} />
            <span className="hidden lg:block whitespace-nowrap">Gestión masiva de Contratos</span>
          </button>
        </div>
      }
    >
      {/* Loading state */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando equipo..." />
        </div>
      ) : project ? (
        <div className="flex flex-col gap-6">
          {/* TABS */}
          <div className="sticky top-[144px] pb-1 pt-3 z-[40] bg-[#f3f4f6] dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 flex items-center justify-between shadow-sm lg:shadow-none hover:shadow-md transition-shadow">
            <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar flex-nowrap">
              <button onClick={() => setActiveTab("equipo")} className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === "equipo" ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                <FontAwesomeIcon icon={faUsers} className="text-xs" />
                Equipo ({teamTotal})
              </button>
              <button onClick={() => setActiveTab("coordinadores")} className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === "coordinadores" ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                <FontAwesomeIcon icon={faUserTie} className="text-xs" />
                Supervisores ({coordinadoresCount})
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenCoordinadoresInfo(true);
                  }}
                  className={`ml-1.5 text-gray-400 hover:text-blue-500 transition-colors cursor-pointer ${activeTab === "coordinadores" ? "text-blue-400" : ""}`}
                  title="Información de asignación"
                >
                  <FontAwesomeIcon icon={faInfoCircle} className="h-3.5 w-3.5" />
                </span>
              </button>
              <button onClick={() => setActiveTab("jerarquia")} className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === "jerarquia" ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                <FontAwesomeIcon icon={faSitemap} className="text-xs" />
                Jerarquía
              </button>
              <button onClick={() => setActiveTab("solicitudes")} className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === "solicitudes" ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                <FontAwesomeIcon icon={faClipboardList} className="text-xs" />
                Solicitudes
                {solicitudesCount > 0 && <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1">{solicitudesCount}</span>}
              </button>
            </div>
            {/* The right side portal target */}
            <div id="tab-actions-portal" className="shrink-0 mb-1 lg:mb-0"></div>
          </div>

          {/* Tab Content */}
          <div className="mt-0">
            {activeTab === "equipo" && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 items-start justify-between">
                  <div className="flex-1 w-full">
                    <SearchAndFilters
                      searchTerm={searchTermTeam}
                      onSearchChange={setSearchTermTeam}
                      searchPlaceholder="Buscar en equipo actual..."
                      radioFilters={[
                        {
                          label: "Estado de usuarios",
                          value: filterUserStatus,
                          onChange: setFilterUserStatus,
                          options: [
                            { label: "Usuarios Activos", value: "active" },
                            { label: "Usuarios Inactivos", value: "inactive" },
                            { label: "Todos los usuarios", value: "" },
                          ],
                        },
                        {
                          label: "Contratos",
                          value: filterVigencia,
                          onChange: setFilterVigencia,
                          options: [
                            { label: "Vigentes", value: "vigente" },
                            { label: "No Vigentes", value: "novigente" },
                            { label: "Todos los contratos", value: "" },
                          ],
                        },
                      ]}
                      selectFilters={[
                        {
                          label: "Rol/es",
                          value: filterRolMobile,
                          onChange: setFilterRolMobile,
                          placeholder: "Todos los roles",
                          options: MOBILE_ROLE_OPTIONS,
                        },
                        {
                          label: "Tipo de contrato",
                          value: filterTipoContrato,
                          onChange: setFilterTipoContrato,
                          placeholder: "Todos los tipos",
                          options: contratoFrames.map((cf) => ({ value: cf.name, label: cf.name })),
                        },
                        {
                          label: "Área / Turno",
                          value: filterAreaTurno,
                          onChange: setFilterAreaTurno,
                          placeholder: "Todas las áreas/turnos",
                          options: [{ value: "__none__", label: "Sin área/turno" }, ...areaTurnoOptions],
                        },
                        {
                          label: "Estado de contrato",
                          value: filterEstadoContrato,
                          onChange: setFilterEstadoContrato,
                          placeholder: "Todos los estados",
                          options: estadoContratoOptions,
                          renderOption: (opt) => <EstadoBadge name={opt.label} />,
                        },
                        {
                          label: "Reemplazo",
                          value: filterReemplazo,
                          onChange: setFilterReemplazo,
                          placeholder: "Con y sin reemplazo",
                          options: [
                            { value: "con", label: "Con reemplazo" },
                            { value: "sin", label: "Sin reemplazo" },
                          ],
                        },
                      ]}
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setViewMode("cards")} className={`px-3 py-2 rounded-md transition-all border dark:border-gray-700 ${effectiveViewMode === "cards" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tarjetas">
                      <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
                    </button>
                    <button onClick={() => setViewMode("table")} className={`px-3 py-2 rounded-md transition-all border dark:border-gray-700 ${effectiveViewMode === "table" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tabla">
                      <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Sin áreas en el proyecto no se puede guardar ningún cambio de miembro (área/turno es obligatorio). */}
                {(project?.areasConfig || []).length === 0 && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-xl space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                    <p className="text-red-800 dark:text-red-400 font-bold flex items-center gap-2 text-sm">
                      <FontAwesomeIcon icon={faTriangleExclamation} />
                      El proyecto no tiene áreas asignadas
                    </p>
                    <p className="text-red-700 dark:text-red-500 text-xs leading-normal">La asignación por área y turno es obligatoria: hasta que el proyecto tenga al menos un área, no vas a poder configurar ni editar a los miembros del equipo.</p>
                    <div className="flex items-center gap-3 pt-1">
                      <button type="button" onClick={() => navigate(`/projects/${projectId}`, { state: { openEdit: true } })} className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400 hover:underline" title="Ir a Editar Proyecto para agregar áreas">
                        <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3" />
                        Editar proyecto para agregar áreas
                      </button>
                      <button type="button" onClick={() => setShowSinAreasInfo(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700/80 dark:text-red-400/80 hover:underline" title="Qué implica que el proyecto no tenga áreas">
                        <FontAwesomeIcon icon={faInfoCircle} className="h-3 w-3" />
                        Más información
                      </button>
                    </div>
                  </div>
                )}

                {!hasMobileCoordinator && teamMembers.length > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-xl space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                    <p className="text-amber-800 dark:text-amber-400 font-bold flex items-center gap-2 text-sm">
                      <FontAwesomeIcon icon={faInfoCircle} />
                      Asignación requerida
                    </p>
                    <p className="text-amber-700 dark:text-amber-500 text-xs leading-normal">
                      Para asignar áreas y turnos hace falta que el equipo tenga a alguien con un rol que incluya <strong>«Supervisa áreas y turnos»</strong>.
                    </p>
                  </div>
                )}

                {(() => {
                  // Todos los filtros se aplican en el server (ver fetchTeamPage), así que la página
                  // que llega ya viene filtrada y la paginación muestra los resultados correlativos.
                  const rows = teamRows;
                  const hayFiltros = !!(searchTermTeam || filterUserStatus || filterRolMobile || filterVigencia || filterTipoContrato || filterAreaTurno || filterEstadoContrato || filterReemplazo);

                  // Orden alfabético tal como lo devuelve el server (sort=name).
                  if (teamTotal === 0 && !teamFetching) {
                    return (
                      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center h-64 text-gray-500">
                        <FontAwesomeIcon icon={faUsers} className="h-12 w-12 mb-4 opacity-10" />
                        <p className="text-base font-medium">{hayFiltros ? "No se encontraron miembros" : "Aún no hay miembros en el equipo"}</p>
                        <p className="text-sm mt-1">{hayFiltros ? "Probá ajustar la búsqueda o los filtros." : 'Usa el botón "Agregar Miembro" para comenzar.'}</p>
                      </div>
                    );
                  }

                  return effectiveViewMode === "table" ? (
                    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-opacity ${teamFetching ? "opacity-60" : ""}`}>
                      <div className="overflow-x-auto">
                        {/*
                          `border-separate` Y NO `border-collapse`, PARA PODER FIJAR «Usuario».

                          Con el modelo colapsado los bordes no son de la celda sino de la grilla de
                          la tabla, así que no acompañan a una celda `sticky`: la columna viaja y su
                          filo se queda. Separado, cada celda pinta lo suyo y se mueve con ella —es
                          la misma configuración que usan las tablas de Contratos, que tienen tres
                          columnas fijas.
                          A cambio, el modelo separado IGNORA los bordes puestos en `<tr>`: los que
                          separan las filas pasan a las celdas (`[&>td]:border-b`), que es de donde
                          sí se dibujan.
                        */}
                        <table className="w-full text-left border-separate border-spacing-0">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-gray-900/50 [&>th]:border-b [&>th]:border-gray-200 dark:[&>th]:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              {/*
                                «Usuario» fija a la izquierda: con dieciocho columnas, al llegar a
                                Contrato o Estado Impositivo ya no se sabía de quién era la fila, y
                                justamente ahí es donde se está completando.
                                El fondo va OPACO y no `dark:bg-gray-900/50` como el resto de la
                                fila: por una celda fija translúcida se ve pasar lo que scrollea.
                                `#18202f` es ese mismo gris ya mezclado sobre el fondo del panel.
                              */}
                              <th className="sticky left-0 z-[15] px-4 py-3 font-semibold bg-gray-50 dark:bg-[#18202f] border-r-2 border-gray-300 dark:border-gray-600 shadow-[4px_0_6px_-4px_rgba(0,0,0,0.25)]">Usuario</th>
                              {/*
                                «Último Contrato», y no «Alta / Baja».

                                Una persona puede tener varios contratos en el proyecto —la columna
                                «Contratos» dice cuántos—, así que un par de fechas sueltas no decía
                                de CUÁL eran. Estas son las del último, que es el que manda. El detalle
                                no se pierde: la celda sigue rotulando sus dos líneas con «Alta:» y
                                «Baja:».
                              */}
                              <th className="px-4 py-3 font-semibold whitespace-nowrap">Último Contrato</th>
                              <th className="px-4 py-3 font-semibold text-center">Contratos</th>
                              <th className="px-4 py-3 font-semibold">Rol/es</th>
                              <th className="px-4 py-3 font-semibold">Rol/es Frame</th>
                              <th className="px-4 py-3 font-semibold">Estado</th>
                              <th className="px-4 py-3 font-semibold">Área / Turno</th>
                              <th className="px-4 py-3 font-semibold text-amber-600 dark:text-amber-400">
                                <span className="inline-flex items-center gap-1.5">
                                  Área/Turno Supervisada
                                  <button type="button" onClick={() => setOpenCoordCountInfo(true)} className="text-amber-500/70 hover:text-amber-500 transition-colors" title="Qué significa el número entre paréntesis" aria-label="Información del número de personas supervisadas">
                                    <FontAwesomeIcon icon={faInfoCircle} className="h-3.5 w-3.5" />
                                  </button>
                                </span>
                              </th>
                              <th className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">Supervisores coordinados</th>
                              <th className="px-4 py-3 font-semibold">Contrato</th>
                              <th className="px-4 py-3 font-semibold whitespace-nowrap">Estado Contrato</th>
                              <th className="px-4 py-3 font-semibold whitespace-nowrap">Estado Impositivo</th>
                              <th className="px-4 py-3 font-semibold">Reemplazo</th>
                              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Monto / Jorn.</th>
                              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Jornadas</th>
                              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Días por semana</th>
                              <th className="px-4 py-3 font-semibold">Horario</th>
                              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Horas / día</th>
                              <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                            </tr>
                          </thead>
                          {/* Sin `divide-y`: en el modelo separado los bordes de `<tr>` no se
                              dibujan. La línea entre filas la pone cada celda (ver `renderUserRow`). */}
                          <tbody>{rows.map((u) => renderUserRow(u))}</tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 transition-opacity ${teamFetching ? "opacity-60" : ""}`}>{rows.map((u) => renderUserCard(u))}</div>
                  );
                })()}

                {/* Paginación server-side (misma lógica que Usuarios) */}
                {teamTotalPages > 1 && (
                  <div className="mt-6 flex flex-col sm:flex-row items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-4 gap-4">
                    {/* Mobile */}
                    <div className="flex-1 flex justify-between sm:hidden w-full">
                      <button onClick={() => setTeamPage((p) => Math.max(p - 1, 1))} disabled={teamPage === 1} className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                        Anterior
                      </button>
                      <button onClick={() => setTeamPage((p) => Math.min(p + 1, teamTotalPages))} disabled={teamPage === teamTotalPages} className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                        Siguiente
                      </button>
                    </div>

                    {/* Desktop */}
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between w-full">
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        Mostrando <span className="font-semibold text-primary-600">{teamRows.length}</span> de <span className="font-semibold text-primary-600">{teamTotal}</span>
                      </p>
                      <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                        <button onClick={() => setTeamPage((p) => Math.max(p - 1, 1))} disabled={teamPage === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">
                          <FontAwesomeIcon icon={faChevronLeft} className="h-4 w-4" />
                        </button>
                        {Array.from({ length: teamTotalPages }).map((_, i) => {
                          const p = i + 1;
                          if (p === 1 || p === teamTotalPages || (p >= teamPage - 2 && p <= teamPage + 2)) {
                            return (
                              <button key={p} onClick={() => setTeamPage(p)} className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${teamPage === p ? "bg-primary-600 border-primary-600 text-white z-10" : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"}`}>
                                {p}
                              </button>
                            );
                          }
                          if ((p === 2 && teamPage > 4) || (p === teamTotalPages - 1 && teamPage < teamTotalPages - 3)) {
                            return (
                              <span key={`dots-${p}`} className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm">
                                ...
                              </span>
                            );
                          }
                          return null;
                        })}
                        <button onClick={() => setTeamPage((p) => Math.min(p + 1, teamTotalPages))} disabled={teamPage === teamTotalPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">
                          <FontAwesomeIcon icon={faChevronRight} className="h-4 w-4" />
                        </button>
                      </nav>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "coordinadores" && project && (
              <TeamCoordinadoresTab
                projectId={projectId!}
                project={project}
                allUsers={allUsers}
                teamMembers={teamMembers}
                onGoToTeam={() => setActiveTab("equipo")}
                onUpdated={async () => {
                  const updatedProject = await projectsAPI.getProject(projectId!, { team: "ids" });
                  setProject(updatedProject);
                  setTeamConfig(updatedProject.teamConfig || []);
                }}
              />
            )}

            {activeTab === "jerarquia" && project && (
              <TeamJerarquiaTab
                project={project}
                teamMembers={teamMembers}
                allAreas={allAreas}
                allShifts={allShifts}
                onRefresh={async () => {
                  const updatedProject = await projectsAPI.getProject(projectId!, { team: "ids" });
                  setProject(updatedProject);
                  setTeamConfig(updatedProject.teamConfig || []);
                }}
              />
            )}

            {activeTab === "solicitudes" && project && <TeamSolicitudesTab projectId={projectId!} project={project} refreshSignal={solicitudesRefresh} onApprove={(u) => handleOpenWizard(u._id, undefined, undefined, u._id)} />}
          </div>

          {/* Modals */}

          <Modal
            isOpen={showAddModal}
            onClose={() => setShowAddModal(false)}
            title="Agregar Miembros al Equipo"
            subtitle={
              <div className="flex items-center gap-2">
                <span>Disponibles para asignar ({filteredCandidates.length})</span>
                <button type="button" onClick={() => setShowCandidatesInfo(true)} className="text-gray-400 hover:text-blue-500 transition-colors" title="¿Qué usuarios se muestran?">
                  <FontAwesomeIcon icon={faInfoCircle} className="text-xs" />
                </button>
              </div>
            }
            size="xl"
          >
            <div className="space-y-4 max-h-[85vh] flex flex-col">
              <div className="flex flex-col gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FontAwesomeIcon icon={faSearch} className="text-gray-400" />
                    </div>
                    <input type="text" placeholder="Buscar usuario por nombre o email..." className="input-field pl-10 w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoFocus />
                  </div>
                  <button onClick={() => setShowFilters(true)} className={`relative px-4 py-2 rounded-lg border transition-all flex items-center gap-2 text-sm font-medium ${activeAddFiltersCount > 0 ? "bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800" : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"}`}>
                    <FontAwesomeIcon icon={faFilter} className="text-xs" />
                    Filtros
                    {activeAddFiltersCount > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-blue-500 text-white text-[10px] font-bold rounded-full border-2 border-white dark:border-gray-800 shadow-sm">{activeAddFiltersCount}</span>}
                  </button>
                </div>

                {/* Filter Badges */}
                {activeAddFiltersCount > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mt-1 px-1">
                    {filterRole && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        <span className="opacity-60">Rol:</span> {filterRole}
                        <button onClick={() => setFilterRole("")} className="hover:text-blue-900 dark:hover:text-blue-100 transition-colors">
                          <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
                        </button>
                      </span>
                    )}
                    {filterRoleFrame && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                        <span className="opacity-60">Role Frame:</span> {filterRoleFrame}
                        <button onClick={() => setFilterRoleFrame("")} className="hover:text-purple-900 dark:hover:text-purple-100 transition-colors">
                          <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
                        </button>
                      </span>
                    )}
                    {filterProject && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
                        <span className="opacity-60">Proyecto:</span> {filterProject}
                        <button onClick={() => setFilterProject("")} className="hover:text-green-900 dark:hover:text-green-100 transition-colors">
                          <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
                        </button>
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setFilterRole("");
                        setFilterRoleFrame("");
                        setFilterProject("");
                      }}
                      className="text-[10px] text-gray-500 hover:text-red-500 font-bold ml-1 transition-colors uppercase tracking-wider"
                    >
                      Limpiar Todo
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar border border-gray-100 dark:border-gray-700 rounded-lg">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                        <th className="px-4 py-3">Nombre</th>
                        <th className="px-4 py-3">Rol</th>
                        <th className="px-4 py-3">Rol/es Frame</th>
                        <th className="px-4 py-3">Proyecto/s</th>
                        <th className="px-4 py-3">Turnos asociados</th>
                        <th className="px-4 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-xs">
                      {searchingCandidates ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                            <FontAwesomeIcon icon={faSearch} className="animate-pulse mr-2" />
                            Buscando candidatos...
                          </td>
                        </tr>
                      ) : filteredCandidates.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                            {searchTerm ? `No se encontraron usuarios para "${searchTerm}"` : "No hay usuarios disponibles para asignar"}
                          </td>
                        </tr>
                      ) : (
                        filteredCandidates.map((user) => {
                          const isCoordinator = checkIsCoordinator(user);
                          const metadataProjects = user.metadata?.projects || [];
                          // Role frames desde contratos/proyectos (unificados por el backend) + los propios del usuario (metadata.roles_frame)
                          const ownRolFrameNames = (((user.metadata as any)?.rolesFrameIds || (user.metadata as any)?.roles_frame || []) as any[]).map((rf: any) => (typeof rf === "object" ? rf?.name : allRoleFrames.find((i) => i._id === rf)?.name)).filter(Boolean) as string[];
                          const rolFrames = Array.from(new Set([...(user.externalInfo?.rolFrames || []), ...ownRolFrameNames])).filter(Boolean);
                          const activeProjects = Array.from(new Set(metadataProjects.map((p) => p.nombre_proyecto))).filter(Boolean);

                          return (
                            <tr key={user._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}` : user.email}</span>
                                  <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[180px]">{user.email}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1 max-w-[150px]">
                                  {(user.roles || []).map((r) => {
                                    const lower = r.name.toLowerCase();
                                    const isCoord = lower.includes("coordinador");
                                    const isResp = lower.includes("responsable");

                                    let classes = "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-100 dark:border-blue-800";
                                    if (isCoord) {
                                      classes = "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800";
                                    } else if (isResp) {
                                      classes = "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800";
                                    }

                                    return (
                                      <span key={r._id} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap border ${classes}`}>
                                        {r.name}
                                      </span>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {rolFrames.length > 0 ? (
                                  <div className="flex flex-wrap gap-1 max-w-[180px]">
                                    {rolFrames.map((rf, idx) => (
                                      <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                                        {rf}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-0.5">
                                  {activeProjects.length > 0 ? (
                                    activeProjects.map((p, idx) => (
                                      <span key={idx} className="text-[10px] text-gray-500 dark:text-gray-400 italic truncate max-w-[150px]">
                                        {p}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs text-gray-400">—</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1.5">
                                  {user.turnos && user.turnos.length > 0 ? (
                                    user.turnos.map((t) => (
                                      <div key={typeof t === "string" ? t : t._id} className="flex flex-col gap-0.5">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700 uppercase w-fit">{typeof t === "object" ? t.name : "Turno"}</span>
                                        {typeof t === "object" && t.startTime && t.endTime && (
                                          <span className="text-[9px] text-gray-400 dark:text-gray-500 font-medium ml-0.5 italic">
                                            {t.startTime} - {t.endTime}
                                          </span>
                                        )}
                                      </div>
                                    ))
                                  ) : (
                                    <span className="text-xs text-gray-400">—</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button onClick={() => handleOpenWizard(user._id)} className="btn-secondary text-[11px] py-1.5 px-3 flex items-center gap-2 ml-auto hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all font-bold">
                                  <FontAwesomeIcon icon={faPlus} className="text-[10px]" />
                                  Agregar
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Paginación de candidatos (misma UX que Contratos/Novedades) */}
              {candTotalPages > 1 && (
                <div className="mt-1 flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 shrink-0">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{filteredCandidates.length}</span> en esta página · <span className="font-semibold text-gray-900 dark:text-gray-100">{candTotal}</span> usuarios · pág. {candPage}/{candTotalPages}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setCandPage((p) => Math.max(1, p - 1))} disabled={candPage === 1 || searchingCandidates} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                      <FontAwesomeIcon icon={faChevronLeft} />
                    </button>
                    <div className="flex items-center px-4 text-sm font-medium dark:text-gray-100">
                      Página {candPage} de {candTotalPages}
                    </div>
                    <button onClick={() => setCandPage((p) => Math.min(candTotalPages, p + 1))} disabled={candPage === candTotalPages || searchingCandidates} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                      <FontAwesomeIcon icon={faChevronRight} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Modal>

          {/* Candidates Filter Modal */}
          <Modal
            isOpen={showFilters}
            onClose={() => setShowFilters(false)}
            title="Filtros Avanzados"
            subtitle="Configura los filtros para refinar los candidatos"
            size="sm"
            footer={
              <div className="flex items-center justify-between w-full">
                <button
                  onClick={() => {
                    setFilterRole("");
                    setFilterRoleFrame("");
                    setFilterProject("");
                    setShowFilters(false);
                  }}
                  className="btn-secondary"
                >
                  Limpiar Todo
                </button>
                <button onClick={() => setShowFilters(false)} className="btn-primary">
                  Aplicar
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Filtrar por Rol</label>
                <div className="relative">
                  <select className="input-field py-2 w-full text-xs pr-8" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
                    <option value="">Todos los Roles</option>
                    {Array.from(new Set(allUsers.flatMap((u) => (u.roles || []).map((r) => r.name))))
                      .sort()
                      .map((roleName) => (
                        <option key={roleName} value={roleName}>
                          {roleName}
                        </option>
                      ))}
                  </select>
                  <FontAwesomeIcon icon={faChevronDown} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Filtrar por Rol/es Frame</label>
                <div className="relative">
                  <select className="input-field py-2 w-full text-xs pr-8" value={filterRoleFrame} onChange={(e) => setFilterRoleFrame(e.target.value)}>
                    <option value="">Todos los Rol Frames</option>
                    {allRoleFrames.map((rf) => (
                      <option key={rf._id} value={rf.name}>
                        {rf.name}
                      </option>
                    ))}
                  </select>
                  <FontAwesomeIcon icon={faChevronDown} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Filtrar por Proyecto/s</label>
                <div className="relative">
                  <select className="input-field py-2 w-full text-xs pr-8" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
                    <option value="">Todos los Proyectos</option>
                    {Array.from(new Set(allUsers.flatMap((u) => (u.metadata?.projects || []).map((p) => p.nombre_proyecto))))
                      .filter(Boolean)
                      .sort()
                      .map((projectName) => (
                        <option key={projectName} value={projectName}>
                          {projectName}
                        </option>
                      ))}
                  </select>
                  <FontAwesomeIcon icon={faChevronDown} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                </div>
              </div>

              {activeAddFiltersCount > 0 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                  <p className="text-[11px] text-blue-700 dark:text-blue-300 font-medium">
                    Tienes <strong>{activeAddFiltersCount}</strong> filtro{activeAddFiltersCount > 1 ? "s" : ""} aplicado{activeAddFiltersCount > 1 ? "s" : ""}.
                  </p>
                </div>
              )}
            </div>
          </Modal>

          {/* Info Modal for Candidates */}
          <Modal isOpen={showCandidatesInfo} onClose={() => setShowCandidatesInfo(false)} title="Usuarios Disponibles" size="md">
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl">
                <FontAwesomeIcon icon={faInfoCircle} className="text-blue-600 dark:text-blue-400 mt-1" />
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <p className="font-bold mb-2">¿Quiénes aparecen en esta lista?</p>
                  <p>
                    La lista muestra a todos los <strong>usuarios activos</strong> de la plataforma que actualmente <strong>no forman parte del equipo</strong> de este proyecto.
                  </p>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400 ml-4 list-disc">
                <li>Usuarios con estado "Activo" en sus metadatos.</li>
                <li>Se excluyen usuarios que ya están asignados a este proyecto.</li>
                <li>Puedes buscar por nombre o email para filtrar resultados específicos.</li>
              </ul>
            </div>
          </Modal>

          {/* Viewing Shifts Modal */}
          <Modal
            isOpen={!!viewingShiftsData}
            onClose={() => setViewingShiftsData(null)}
            title={`Turnos ${viewingShiftsData?.assignmentType === "coordinated" ? "Supervisados" : "Asignados"} - ${viewingShiftsData?.areaName}`}
            subtitle={
              viewingShiftsData ? (
                <p className="text-lg font-black text-blue-600 dark:text-blue-400 mt-1 uppercase tracking-tight">
                  {viewingShiftsData.user.firstName} {viewingShiftsData.user.lastName}
                </p>
              ) : (
                ""
              )
            }
            size="md"
          >
            <div className="space-y-4">
              {(() => {
                if (!viewingShiftsData) return null;
                const { user, areaId, assignmentType } = viewingShiftsData;
                const userConfig = teamConfig.find((c) => String(c.userId) === String(user._id));
                let shifts: any[] = [];

                // Helper to get coordinated shift IDs for exclusion
                const getCoordinatedShiftIds = () => {
                  if (!project?.coordinatorAssignments) return [];
                  return project.coordinatorAssignments
                    .filter((asm) => {
                      const uid = typeof asm.userId === "object" ? (asm.userId as any)?._id : asm.userId;
                      const aid = typeof asm.areaId === "object" ? (asm.areaId as any)?._id : asm.areaId;
                      return String(uid) === String(user._id) && String(aid) === String(areaId);
                    })
                    .map((asm) => (typeof asm.shiftId === "object" ? (asm.shiftId as any)?._id : asm.shiftId));
                };

                const coordShiftIds = getCoordinatedShiftIds();

                // 1. If viewing coordinated, check ONLY coordinatorAssignments
                if (assignmentType === "coordinated") {
                  if (project?.coordinatorAssignments) {
                    const myCoordAsgn = project.coordinatorAssignments.filter((asm) => {
                      const uid = typeof asm.userId === "object" ? (asm.userId as any)?._id : asm.userId;
                      const aid = typeof asm.areaId === "object" ? (asm.areaId as any)?._id : asm.areaId;
                      return String(uid) === String(user._id) && String(aid) === String(areaId);
                    });
                    myCoordAsgn.forEach((asm) => {
                      const sid = typeof asm.shiftId === "object" ? (asm.shiftId as any)?._id : asm.shiftId;
                      const shift = allShifts.find((s) => String(s._id) === String(sid));
                      if (shift && !shifts.some((s) => String(s._id) === String(shift._id))) shifts.push(shift);
                    });
                  }
                } else {
                  // 2. If viewing standard, check team configuration assignments (Wizard) and EXCLUDE coordinated ones
                  const assignments = userConfig?.areaShiftAssignments || [];
                  const areaAssign = assignments.find((a: any) => {
                    const aid = typeof a.areaId === "object" ? a.areaId?._id : a.areaId;
                    if (String(aid) === String(areaId)) return true;
                    const aData = allAreas.find((area) => String(area._id) === String(aid) || String(area.data?.id) === String(aid));
                    const targetName = viewingShiftsData.areaName;
                    return aData && targetName && aData.name.toLowerCase() === targetName.toLowerCase();
                  });

                  if (areaAssign) {
                    const sids = areaAssign.shiftIds || [];
                    sids.forEach((sid: any) => {
                      const actualSid = typeof sid === "object" ? sid?._id : sid;

                      // EXCLUDE if it's in coordinated
                      if (coordShiftIds.includes(actualSid)) return;

                      const shift = allShifts.find((s) => String(s._id) === String(actualSid));
                      if (shift && !shifts.some((s) => String(s._id) === String(shift._id))) {
                        shifts.push(shift);
                      }
                    });
                  }

                  // 3. Check user's contract history (metadata) fallback
                  if (shifts.length === 0) {
                    const projectMeta = user.metadata?.projects?.find((p: any) => {
                      const pId = p.projectId;
                      const idToCheck = typeof pId === "object" ? (pId as any)?._id : pId;
                      return String(idToCheck) === String(project?._id);
                    });
                    const activeContract = getContratoActivo(projectMeta?.contracts as any[]);

                    if (activeContract?.areaShiftAssignments && activeContract.areaShiftAssignments.length > 0) {
                      const fallbackAssign = activeContract.areaShiftAssignments.find((a: any) => {
                        const aid = typeof a.areaId === "object" ? a.areaId?._id : a.areaId;
                        if (String(aid) === String(areaId)) return true;
                        const aData = allAreas.find((area) => String(area._id) === String(aid) || String(area.data?.id) === String(aid));
                        const targetName = viewingShiftsData.areaName;
                        return aData && targetName && aData.name.toLowerCase() === targetName.toLowerCase();
                      });

                      if (fallbackAssign) {
                        const sids = fallbackAssign.shiftIds || [];
                        sids.forEach((sid: any) => {
                          const actualSid = typeof sid === "object" ? sid?._id : sid;

                          // EXCLUDE if it's in coordinated
                          if (coordShiftIds.includes(actualSid)) return;

                          const shift = allShifts.find((s) => String(s._id) === String(actualSid));
                          if (shift && !shifts.some((s) => String(s._id) === String(shift._id))) {
                            shifts.push(shift);
                          }
                        });
                      }
                    }
                  }
                }

                // 4. Legacy members fallback
                if (shifts.length === 0) {
                  // Fallback for legacy members (only if nothing found yet)
                  const shiftIdFromUser = user.turnos && user.turnos.length > 0 ? (typeof user.turnos[0] === "object" ? user.turnos[0]._id : user.turnos[0]) : undefined;
                  const finalShiftId = userConfig?.shiftId || shiftIdFromUser;
                  const shift = allShifts.find((sh) => String(sh._id) === String(finalShiftId));
                  if (shift) shifts = [shift];
                }

                if (shifts.length === 0) return <p className="text-center text-gray-500 py-12">No hay turnos asignados para esta área.</p>;

                // En los que coordina, cada turno abre el detalle de sus personas: la columna de la
                // tabla ya muestra sólo las áreas, así que es el camino para ver un horario puntual.
                const abrirDetalle = (s: any) => {
                  setViewingShiftsData(null);
                  handleOpenAreaShiftDetail(areaId, viewingShiftsData.areaName, s);
                };
                return shifts.map((s, idx) => (
                  <div
                    key={idx}
                    onClick={assignmentType === "coordinated" ? () => abrirDetalle(s) : undefined}
                    title={assignmentType === "coordinated" ? "Ver las personas de este turno" : undefined}
                    className={`p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 flex flex-col gap-3 ${assignmentType === "coordinated" ? "cursor-pointer hover:border-amber-300 dark:hover:border-amber-600 transition-colors" : ""}`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tighter">
                        {s.name}
                        {assignmentType === "coordinated" && <span className="ml-1.5 text-amber-600 dark:text-amber-400">({getAreaShiftPeopleCount(areaId, String(s._id))})</span>}
                      </span>
                      <span className="px-2 py-1 bg-blue-500 text-white rounded-lg text-[10px] font-black shadow-sm">
                        {s.startTime} — {s.endTime} HS
                      </span>
                    </div>
                    {s.days && s.days.length > 0 && (
                      <div className="flex gap-1.5 mt-1">
                        {["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"].map((label, dIdx) => (
                          <span key={dIdx} className={`text-[10px] font-black px-2 py-1 rounded-md transition-all ${s.days.includes(dIdx) ? "bg-white dark:bg-blue-800 text-blue-600 dark:text-blue-300 shadow-sm ring-1 ring-blue-200 dark:ring-blue-700" : "text-gray-300 dark:text-gray-600"}`}>
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ));
              })()}
            </div>
          </Modal>

          {/* Detalle de personas de un área/turno: click en el chip del área (todos los horarios) o en un turno */}
          <Modal
            isOpen={!!viewingAreaShift}
            onClose={() => {
              setViewingAreaShift(null);
              setAreaShiftMembers(null);
            }}
            title={viewingAreaShift ? `Personas en ${viewingAreaShift.areaName}` : "Personas"}
            subtitle={viewingAreaShift ? <p className="text-sm font-bold text-amber-600 dark:text-amber-400 mt-1">{viewingAreaShift.shift ? `${viewingAreaShift.shift.name} (${viewingAreaShift.shift.startTime} - ${viewingAreaShift.shift.endTime})` : (viewingAreaShift.shifts || []).map((s: any) => s.name).join(" · ") || "Todos los horarios del área"}</p> : ""}
            size="lg"
          >
            {loadingAreaShiftMembers ? (
              <div className="py-12">
                <LoadingSpinner message="Cargando personas..." />
              </div>
            ) : !areaShiftMembers || areaShiftMembers.total === 0 ? (
              <p className="text-center text-gray-500 py-12">No hay personas asignadas a esta área y turno.</p>
            ) : (
              (() => {
                const cuentan = areaShiftMembers.members.filter((m) => m.cuenta);
                const noCuentan = areaShiftMembers.members.filter((m) => !m.cuenta);
                // Viendo el área completa, cada persona muestra en qué horarios está.
                const mostrarTurnos = !viewingAreaShift?.shift;

                const renderMember = (m: (typeof areaShiftMembers.members)[number]) => (
                  <div key={m._id} className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border ${m.cuenta ? "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700" : "bg-gray-50 dark:bg-gray-900/40 border-gray-200/70 dark:border-gray-700/60 opacity-80"}`}>
                    <div className="flex flex-col min-w-0 gap-1">
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{m.firstName || m.lastName ? `${m.firstName} ${m.lastName}`.trim() : m.email}</span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{m.email}</span>
                      {mostrarTurnos && (m.shiftIds || []).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {(m.shiftIds || []).map((sid) => {
                            const s: any = allShifts.find((x) => String(x._id) === String(sid));
                            return (
                              <span key={sid} className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50/50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-100/50 dark:border-amber-900/40 whitespace-nowrap">
                                {s ? `${s.name} (${s.startTime} - ${s.endTime})` : "Turno"}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${m.activo ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{m.activo ? "ACTIVO" : "INACTIVO"}</span>
                      {m.estadoContrato ? <EstadoBadge name={m.estadoContrato} className="text-[10px] whitespace-nowrap" /> : <span className="text-[10px] text-gray-400">Sin contrato</span>}
                      <div className="flex flex-col items-end gap-0.5 text-[10px] text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded uppercase font-bold ${m.vigente ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{m.vigente ? "VIGENTE" : "NO VIGENTE"}</span>
                        <span>Alta: {formatContractDate(m.fechaAlta)}</span>
                        <span>Baja: {m.fechaBaja ? formatContractDate(m.fechaBaja) : "—"}</span>
                      </div>
                    </div>
                  </div>
                );

                return (
                  <div className="space-y-4">
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <p className="text-xs text-amber-800 dark:text-amber-300">
                        <strong>{areaShiftMembers.cuentan}</strong> persona{areaShiftMembers.cuentan === 1 ? "" : "s"} activa{areaShiftMembers.cuentan === 1 ? "" : "s"} con contrato vigente
                        {areaShiftMembers.total !== areaShiftMembers.cuentan ? (
                          <>
                            {" "}
                            · <strong>{areaShiftMembers.total}</strong> asignada{areaShiftMembers.total === 1 ? "" : "s"} en total
                          </>
                        ) : null}
                        {mostrarTurnos ? " en los horarios que supervisa de esta área." : ". El número de la columna Área/Turno Supervisada es el primero."}
                      </p>
                    </div>

                    {cuentan.length > 0 && <div className="space-y-2">{cuentan.map(renderMember)}</div>}

                    {noCuentan.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pt-2">No suman al total ({noCuentan.length})</p>
                        {noCuentan.map(renderMember)}
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </Modal>

          {/*
            Buscador del catálogo completo de oficios, para cuando el que corresponde no está entre
            los de la persona. Se elige UNO: es con el que se la contrata acá, y al guardar se le suma
            a la ficha. Va por encima del wizard, que es desde donde se abre.
          */}
          <Modal
            isOpen={rolFrameBuscadorOpen}
            onClose={() => setRolFrameBuscadorOpen(false)}
            title="Otro rol empresa"
            subtitle="El que elijas se le agrega a la ficha de la persona al guardar"
            size="md"
            zIndex={110}
            footer={
              <div className="flex w-full justify-end">
                <button type="button" onClick={() => setRolFrameBuscadorOpen(false)} className="btn-secondary">
                  Cancelar
                </button>
              </div>
            }
          >
            <div className="space-y-3">
              <input type="text" autoFocus value={rolFrameBusqueda} onChange={(e) => setRolFrameBusqueda(e.target.value)} placeholder="Buscar especialidad…" className="input-field w-full" />
              <div className="grid max-h-[45vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {rolesFrameParaBuscar.length === 0 ? (
                  <p className="col-span-full py-8 text-center text-xs italic text-gray-400">{rolFrameBusqueda ? `No hay especialidades que coincidan con "${rolFrameBusqueda}"` : "La persona ya tiene todos los oficios del catálogo."}</p>
                ) : (
                  rolesFrameParaBuscar.map((rf) => (
                    <button
                      key={rf._id}
                      type="button"
                      onClick={() => {
                        setRolFrameAgregado(rf);
                        // Se deja elegido en el desplegable, que es lo que el wizard guarda.
                        setWizardData((prev) => ({ ...prev, rol_frame_id: String(rf.data?.rol?.id || ""), categoria_sat_id: "" }));
                        setRolFrameBuscadorOpen(false);
                        setRolFrameBusqueda("");
                      }}
                      className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-left text-sm text-gray-700 transition-all hover:border-blue-400 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-200"
                    >
                      {rf.name}
                    </button>
                  ))
                )}
              </div>
            </div>
          </Modal>

          {/* Wizard Modal */}
          <Modal
            isOpen={!!selectedUserForWizard}
            onClose={() => {
              setSelectedUserForWizard(null);
              // El oficio agregado a mano es de ESTA carga: si se cierra sin guardar, no queda nada.
              setRolFrameAgregado(null);
              setRolFrameBusqueda("");
            }}
            title={esEdicionMiembro ? "Configurar Miembro" : "Agregar Miembro"}
            subtitle={
              selectedUserForWizard ? (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{project?.name}</span>
                  <p className="text-base font-black text-blue-600 dark:text-blue-400 uppercase tracking-tight">
                    {selectedUserForWizard.firstName} {selectedUserForWizard.lastName}
                  </p>
                </div>
              ) : (
                project?.name
              )
            }
            size="xl"
            footer={
              <div className="flex gap-3 w-full">
                {/* Una sola acción: el formulario es uno solo y se guarda desde cualquier punto. */}
                <button type="button" onClick={handleSaveWizard} className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-bold hover:bg-blue-600 shadow-lg shadow-blue-500/20 transition-all active:scale-95 uppercase tracking-wider">
                  GUARDAR
                </button>
              </div>
            }
          >
            <div className="flex flex-col h-[520px]">
              {/* Un solo formulario, en una sola columna con scroll: el orden va de arriba hacia abajo. */}
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-4">
                {(
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/*
                      EMPLEADO OCUPA MEDIA FILA, no la entera.

                      Es un campo de solo lectura —el nombre de quien se está configurando— así que no
                      gana nada con el ancho completo, y lo que costaba era el desfasaje: al ocupar dos
                      columnas, todo lo de abajo quedaba corrido medio lugar y los pares se partían.
                      «Empresa del Contrato» terminaba al lado de «Role Frame», y «Empresa del Release»
                      al lado de «Convenio», que son justamente los que hay que leer juntos.

                      Con esto las filas quedan: Empleado | Role Frame · Empresa del Contrato | Empresa
                      del Release · Convenio | Categoría · Tipo de Contrato | Estado. Los pares que
                      comparten fila son los que se deciden juntos, y el orden sigue la cadena:
                      empresa → convenios de ese CUIT → categorías de esos convenios.
                    */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">
                        Empleado <span className="text-red-500">*</span>
                      </label>
                      <input type="text" className="input-field w-full bg-gray-50 dark:bg-transparent" value={`${selectedUserForWizard?.firstName} ${selectedUserForWizard?.lastName}`} readOnly />
                    </div>

                    {/*
                      EL DESPLEGABLE OFRECE LOS OFICIOS DE LA PERSONA; EL BOTÓN, TODOS LOS DEMÁS.

                      La lista corta es la correcta el 90% de las veces y por eso sigue siendo la que se
                      ve. Pero cuando se contrata a alguien para algo que no figura en su ficha —porque
                      nunca lo hizo acá, o porque quedó incompleta— antes no había salida: el select no
                      lo ofrecía y el wizard exige uno. Se elegía cualquiera con tal de avanzar.

                      Lo que se elige por el buscador se le AGREGA a la ficha al guardar: que además sea
                      Utilero es un dato de la persona, no de este contrato, y la próxima vez tiene que
                      estar en la lista corta.
                    */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">
                        Role Frame a Desempeñar <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <select className="input-field w-full" value={wizardData.rol_frame_id} onChange={(e) => setWizardData((prev) => ({ ...prev, rol_frame_id: e.target.value, categoria_sat_id: "" }))} required>
                          <option value="">Selecciona role frame...</option>
                          {rolesFrameOfrecidos.map((rf) => (
                            <option key={rf._id} value={rf.data.rol.id}>
                              {rf.name}
                              {!userAssignedRoleFrames.some((p) => p._id === rf._id) ? " (nuevo)" : ""}
                            </option>
                          ))}
                        </select>
                        <button type="button" onClick={() => setRolFrameBuscadorOpen(true)} title="Buscar otro rol empresa" className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">
                          Otro rol
                        </button>
                      </div>
                      {rolFrameAgregado && <p className="ml-1 text-[11px] text-amber-600 dark:text-amber-400">«{rolFrameAgregado.name}» no estaba en su ficha: se le agrega al guardar.</p>}
                    </div>

                    {/*
                      LA EMPRESA VA ANTES QUE EL CONVENIO, Y ESO NO ES ORDEN ESTÉTICO.

                      La cadena es empresa → convenios registrados por ese CUIT → categorías de esos
                      convenios. Estaba 200 líneas más abajo, así que quien cargaba de arriba hacia
                      abajo llegaba a Convenio sin empresa elegida y se encontraba el select apagado
                      diciéndole que eligiera algo que todavía no había aparecido en pantalla.
                    */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Empresa del Contrato</label>
                      <select className="input-field w-full" value={wizardData.empresaContratoId} onChange={(e) => setWizardData((prev) => ({ ...prev, empresaContratoId: e.target.value }))}>
                        <option value="">{contratoEmpresas.length ? "Selecciona empresa..." : "No hay empresas cargadas"}</option>
                        {contratoEmpresas.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">Define qué convenios y categorías se pueden elegir abajo.</p>
                    </div>

                    {/* Las dos empresas juntas: se eligen de la misma lista y se confunden si están separadas. */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Empresa del Release</label>
                      <select className="input-field w-full" value={wizardData.empresaReleaseId} onChange={(e) => setWizardData((prev) => ({ ...prev, empresaReleaseId: e.target.value }))}>
                        <option value="">{releaseEmpresas.length ? "Selecciona empresa..." : "No hay empresas cargadas"}</option>
                        {releaseEmpresas.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      {/*
                        RÓTULO, FILTRO Y BADGE, TODO EN UNA FILA DE ALTO FIJO.

                        Antes los tres trámites estaban como botones sueltos entre el rótulo y el
                        desplegable: además de ser tres cosas para elegir una, esa fila empujaba el
                        select hacia abajo y lo desalineaba de «Categoría», que está a la izquierda en
                        la misma grilla. Y como la fila aparecía o no según el caso, la desalineación
                        cambiaba sola.

                        Ahora el filtro se elige en una ventana aparte —el mismo patrón de «Filtros
                        avanzados»— y acá arriba queda solo el que está aplicado, como badge con una X
                        para sacarlo. El `h-6` es lo que garantiza la alineación: la fila mide siempre
                        lo mismo, haya badge o no, igual que la de «Categoría».
                      */}
                      <div className="h-6 flex items-center gap-2 ml-1">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">
                          Tipo de contrato <span className="text-red-500">*</span>
                        </label>
                        {impositivosDelAbm.length > 0 && (
                          <button type="button" onClick={() => setFiltroTramiteOpen(true)} title="Filtrar por trámite (ARCA / Servicios)" className="text-gray-400 hover:text-blue-500 transition-colors">
                            <FontAwesomeIcon icon={faFilter} className="h-3 w-3" />
                          </button>
                        )}
                        {estadoImpositivoPorTipo(allEstados, filtroTramite) && (
                          /*
                            EL FILTRO APLICADO, MÁS CHICO QUE EL BADGE DE ESTADO Y CON LA X ADENTRO.

                            Son dos badges de color a pocos centímetros —éste dice «por qué la lista
                            está recortada» y el de Estado dice «qué estado va a quedar»— y del mismo
                            tamaño se leen como lo mismo. Acá va en 9px y con la X dentro del recuadro:
                            pegada por fuera parecía otro control suelto, no la forma de sacar ESTE
                            filtro.
                          */
                          <EstadoBadge name={estadoImpositivoPorTipo(allEstados, filtroTramite)!.name} className="text-[9px] px-1.5 py-0 whitespace-nowrap">
                            <button type="button" onClick={() => setFiltroTramite("")} title="Quitar el filtro" className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity" aria-label="Quitar el filtro de trámite">
                              <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
                            </button>
                          </EstadoBadge>
                        )}
                      </div>

                      {/*
                        Lista propia y no un <select> nativo: un <option> solo admite texto, y acá
                        cada tipo tiene que mostrar SU badge de trámite al lado del nombre. Es el
                        mismo badge de Contratos, para que se lea como lo mismo. Ver
                        `components/contratos/TipoContratoSelect.tsx`.
                      */}
                      <TipoContratoSelect
                        options={contratosFiltradosPorTramite}
                        value={wizardData.contrato_id}
                        estados={allEstados}
                        tramitePorContrato={tramitePorContrato}
                        onChange={(contratoId) => {
                          const contrato = contratos.find((c) => c._id === contratoId);
                          // Plantilla(s) de este Contrato: si hay una sola, se resuelve sola; si hay
                          // varias, la elige el select de abajo; si no hay ninguna, queda pendiente.
                          const plantillasDelContrato = contratoFrames.filter((cf) => (typeof cf.contratoId === "object" ? cf.contratoId?._id : cf.contratoId) === contratoId);
                          const unicaPlantilla = plantillasDelContrato.length === 1 ? plantillasDelContrato[0] : undefined;
                          setWizardData((prev) => ({
                            ...prev,
                            contrato_id: contratoId,
                            contrato_frame_id: unicaPlantilla?._id || "",
                            nombre_contrato: unicaPlantilla?.name || "",
                            tipo_contrato_id: unicaPlantilla?.data?.id != null ? String(unicaPlantilla.data.id) : "",
                            fecha_baja_contrato: contrato?.data.esTiempoIndeterminado ? "" : prev.fecha_baja_contrato,
                          }));
                        }}
                      />


                      {filtroTramite && contratosFiltradosPorTramite.length === 0 && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 ml-1">Ningún tipo de contrato está configurado para este trámite. Vinculalo desde el ABM de Estados, o mirá todos.</p>
                      )}
                      {contratoDelWizard && (limiteHorasWizard != null || limiteDiasWizard != null) && (
                        <p className="ml-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600 dark:text-gray-400">
                          {limiteHorasWizard != null && (
                            <span>
                              <strong className="text-gray-900 dark:text-white">{limiteHorasWizard}</strong> h por jornada
                            </span>
                          )}
                          {limiteDiasWizard != null && (
                            <span>
                              <strong className="text-gray-900 dark:text-white">{limiteDiasWizard}</strong> días por semana
                            </span>
                          )}
                          <span className="text-gray-400">Limitan el horario y los días.</span>
                        </p>
                      )}
                    </div>

                    {(() => {
                      if (!wizardData.contrato_id) return null;
                      const plantillasDelContrato = contratoFrames.filter((cf) => (typeof cf.contratoId === "object" ? cf.contratoId?._id : cf.contratoId) === wizardData.contrato_id);

                      // Varias Plantillas para el mismo Contrato: hay que elegir cuál usar para el PDF.
                      if (plantillasDelContrato.length > 1) {
                        return (
                          <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">
                              Plantilla <span className="text-red-500">*</span>
                            </label>
                            <select
                              className="input-field w-full"
                              value={wizardData.contrato_frame_id}
                              onChange={(e) => {
                                const cf = plantillasDelContrato.find((p) => p._id === e.target.value);
                                setWizardData((prev) => ({
                                  ...prev,
                                  contrato_frame_id: cf?._id || "",
                                  nombre_contrato: cf?.name || "",
                                  tipo_contrato_id: cf?.data?.id != null ? String(cf.data.id) : "",
                                }));
                              }}
                              required
                            >
                              <option value="">Selecciona plantilla...</option>
                              {plantillasDelContrato.map((cf) => (
                                <option key={cf._id} value={cf._id}>
                                  {cf.name}
                                </option>
                              ))}
                            </select>
                            <p className="text-[10px] text-gray-400 ml-1">Este contrato tiene más de una plantilla: elegí cuál se usa para generar el PDF.</p>
                          </div>
                        );
                      }

                      // Ninguna Plantilla asignada todavía: se puede guardar, pero no se podrá generar el PDF.
                      if (plantillasDelContrato.length === 0) {
                        return (
                          <div className="md:col-span-2 -mt-2">
                            <p className="text-[11px] text-amber-600 dark:text-amber-400">
                              Este contrato todavía no tiene ninguna Plantilla asignada: se puede guardar, pero no se va a poder generar el PDF hasta asignarle una desde <strong>Plantillas | Contratos</strong>.
                            </p>
                          </div>
                        );
                      }

                      return null;
                    })()}

                    <div className="space-y-1.5">
                      {esAltaNueva ? (
                        <>
                          {/* `h-6`, el mismo alto fijo que el rótulo de «Tipo de contrato» que está a
                              la izquierda en esta fila: es lo que hace que los dos campos arranquen a
                              la misma altura. Sin esto el rótulo mide lo que mida su contenido —acá,
                              un botón de info; allá, un badge que aparece o no— y la desalineación
                              cambia sola según el caso. */}
                          <div className="h-6 flex items-center gap-1.5 ml-1">
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">
                              Estado <span className="text-red-500">*</span>
                            </label>
                            <button type="button" onClick={() => setShowEstadoInfo(true)} className="text-gray-400 hover:text-blue-500 transition-colors" title="¿Dónde se configura?" aria-label="Información sobre el Estado">
                              <FontAwesomeIcon icon={faInfoCircle} className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="input-field w-full flex items-center">{estadoImpositivoAuto ? <EstadoBadge name={estadoImpositivoAuto.name} /> : <span className="text-gray-400 dark:text-gray-500 text-sm">{wizardData.contrato_frame_id ? "Este tipo de contrato no tiene un estado impositivo configurado" : "Elegí primero el Tipo de contrato"}</span>}</div>
                        </>
                      ) : (
                        <>
                          <div className="h-6 flex items-center ml-1">
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">
                              Estado <span className="text-red-500">*</span>
                            </label>
                          </div>
                          {/*
                            SE MUESTRA, NO SE ELIGE — igual que en el alta.

                            El estado sale del Tipo de Contrato: al cambiarlo, este valor se recalcula
                            solo. Mientras fue un selector, elegir a mano acá dejaba un estado que el
                            siguiente cambio de tipo pisaba sin avisar, y no había forma de saber si el
                            que se veía era el elegido o el derivado.
                          */}
                          <div className="input-field w-full flex items-center">
                            {estadoElegido ? <EstadoBadge name={estadoElegido.name} /> : <span className="text-gray-400 dark:text-gray-500 text-sm">{wizardData.contrato_id ? "Este tipo de contrato no tiene un estado configurado" : "Elegí primero el Tipo de contrato"}</span>}
                          </div>
                        </>
                      )}
                    </div>

                    {/*
                      Alta y baja del contrato, juntas: son los dos extremos del mismo período.

                      Cada par va en su PROPIA fila de dos columnas y no suelto en el grid de arriba:
                      «Fecha baja» desaparece cuando el tipo de contrato es de tiempo indeterminado, y
                      con los campos sueltos ese hueco corría a todos los de abajo — las horas quedaban
                      apareadas con una fecha según qué contrato estuviera elegido.
                    */}
                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Fecha alta contrato</label>
                        <input type="date" className="input-field w-full text-sm" value={wizardData.fecha_alta_contrato} onChange={(e) => setWizardData((prev) => ({ ...prev, fecha_alta_contrato: e.target.value }))} />
                      </div>
                      {!(contratos.find((c) => c._id === wizardData.contrato_id)?.data.esTiempoIndeterminado ?? false) && (
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">
                            Fecha baja contrato <span className="text-red-500">*</span>
                          </label>
                          <input type="date" className="input-field w-full text-sm" value={wizardData.fecha_baja_contrato} onChange={(e) => setWizardData((prev) => ({ ...prev, fecha_baja_contrato: e.target.value }))} />
                        </div>
                      )}
                    </div>

                    {/*
                      Los días de la semana. EL MISMO componente que la Solicitud de Contratación de mobile.

                      Va debajo del horario porque es la otra mitad del mismo dato: el horario dice a
                      qué hora, esto dice qué días. Estaban separados —uno acá y el otro solo en
                      mobile— y el escritorio guardaba 5 jornadas fijas sin que nadie lo eligiera.
                    */}
                    <div className="md:col-span-2">
                      <DiasDeTrabajo jornadas={wizardData.dias_por_semana} onJornadas={(n) => setWizardData((prev) => ({ ...prev, dias_por_semana: limiteDiasWizard != null ? Math.min(n, limiteDiasWizard) : n }))} rotativos={wizardData.dias_rotativos} onRotativos={(v) => setWizardData((prev) => ({ ...prev, dias_rotativos: v }))} dias={wizardData.dias_semana} onDias={(d) => setWizardData((prev) => ({ ...prev, dias_semana: d }))} desde={wizardData.fecha_alta_contrato} hasta={wizardData.fecha_baja_contrato} jornadasTotales={wizardData.cantidad_jornadas_laborales} onJornadasTotales={(n) => setWizardData((prev) => ({ ...prev, cantidad_jornadas_laborales: n }))} />
                    </div>

                    {/* Las jornadas que se pagan: se calculan con las fechas y los días, y se ajustan a mano con motivo. */}
                    <div className="md:col-span-2">
                      <JornadasSolicitud
                        desde={wizardData.fecha_alta_contrato}
                        hasta={wizardData.fecha_baja_contrato}
                        rotativos={wizardData.dias_rotativos}
                        calculadas={jornadasCalculadasWizard}
                        dias={wizardData.dias_semana}
                        valor={String(wizardData.cantidad_jornadas_laborales || "")}
                        onValor={(v) => setWizardData((prev) => ({ ...prev, cantidad_jornadas_laborales: Number(v) || 0 }))}
                        ajustado={ajusteJornadas.ajustado}
                        motivo={ajusteJornadas.motivo}
                        nota={ajusteJornadas.nota}
                        onEditarManual={() => setAjusteJornadas((a) => ({ ...a, ajustado: true }))}
                        onCancelarAjuste={() => {
                          setAjusteJornadas({ ajustado: false, motivo: "", nota: "" });
                          if (jornadasCalculadasWizard !== null) setWizardData((prev) => ({ ...prev, cantidad_jornadas_laborales: jornadasCalculadasWizard }));
                        }}
                        onMotivo={(m) => setAjusteJornadas((a) => ({ ...a, motivo: m }))}
                        onNota={(n) => setAjusteJornadas((a) => ({ ...a, nota: n }))}
                        errores={erroresJornadasWizard}
                        mostrarErrores
                      />
                    </div>

                    {/* --- CONFIGURACIÓN POR ÁREA (visual toggle) --- */}
                    <div className="md:col-span-2 space-y-3 pt-6 border-t border-gray-100 dark:border-gray-700">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">
                        <FontAwesomeIcon icon={faLayerGroup} className="mr-1" />
                        Asignación por Área y Turno <span className="text-red-500">*</span>
                      </label>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 -mt-1 ml-1">
                        Elegí el área y el turno donde va a trabajar este miembro: uno solo de cada uno. Tocá un área para ver sus turnos. El horario de entrada y salida se completa con el del turno que elijas; más abajo se puede modificar.
                      </p>

                      {(project?.areasConfig || []).length === 0 && (
                        // Sin áreas en el proyecto no se puede completar este paso (es obligatorio) → link a Editar Proyecto.
                        <div className="flex flex-col items-center gap-2 py-4 text-center bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                          <p className="text-sm text-gray-500">Este proyecto no tiene áreas configuradas.</p>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => navigate(`/projects/${projectId}`, { state: { openEdit: true } })} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline" title="Ir a Editar Proyecto para agregar áreas">
                              <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3" />
                              Editar proyecto para agregar áreas
                            </button>
                            <button type="button" onClick={() => setShowSinAreasInfo(true)} className="text-blue-500 hover:text-blue-600 transition-colors" title="Por qué no puedo guardar los cambios del miembro" aria-label="Información: el proyecto no tiene áreas configuradas">
                              <FontAwesomeIcon icon={faInfoCircle} className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        {(() => {
                          const isCoordinadorRole = coordinaAreas(selectedUserForWizard?.roles);
                          /*
                            UN ÁREA Y UN TURNO, Y LAS ÁREAS CERRADAS HASTA QUE SE ABRAN.

                            Antes se podían tildar varios turnos de varias áreas a la vez, y por eso hacía falta
                            toda una maquinaria que detectaba superposiciones horarias y bloqueaba los turnos
                            incompatibles. Elegir de a uno la vuelve innecesaria —no hay con qué superponerse— y
                            saca de la pantalla los avisos de «se superpone» que hoy tapan la mitad de la grilla.

                            Un proyecto con ocho áreas por cuatro turnos son treinta y dos tarjetas abiertas, que
                            es lo que empuja el resto del formulario fuera de la pantalla. Cerradas se leen las
                            áreas de un vistazo, y la elegida muestra su turno en el encabezado sin abrirla.

                            Al contrato que ya tenga varias áreas guardadas de antes no se le toca nada: se
                            muestran todas marcadas y la primera elección lo deja en una sola. Normalizarlo al
                            abrir el wizard sería borrarle asignaciones a alguien que sólo vino a mirar.
                          */
                          const seleccionActual = wizardData.areaShiftAssignments[0];
                          // Sin tocar nada se abre la que tiene la elección; `null` es «la cerré yo».
                          const areaAbierta = areaExpandida === undefined ? seleccionActual?.areaId ?? null : areaExpandida;
                          const DAY_LABELS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];

                          return (project?.areasConfig || []).map((ac: any) => {
                            const aId = typeof ac.areaId === "object" ? ac.areaId?._id : ac.areaId;
                            const areaObj = allAreas.find((a) => a._id === aId);
                            const aName = typeof ac.areaId === "object" ? ac.areaId?.name : areaObj?.name;
                            const isCoordinadorArea = areaObj?.isSystem;
                            const isAreaRestricted = isCoordinadorArea && !isCoordinadorRole;

                            const shiftIdsForArea = (ac.shiftIds || []).map((s: any) => String(typeof s === "object" ? s._id : s));
                            const shiftsForArea = allShifts.filter((s) => shiftIdsForArea.includes(String(s._id))).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

                            // Current assignment for this area
                            const currentAssignment = wizardData.areaShiftAssignments.find((a) => a.areaId === aId);
                            const selectedShiftIds = currentAssignment?.shiftIds || [];
                            const isAreaActive = selectedShiftIds.length > 0;
                            const estaAbierta = areaAbierta === aId;
                            // Qué turno quedó elegido, para leerlo con el área cerrada.
                            const turnosElegidos = selectedShiftIds
                              .map((id) => allShifts.find((s) => String(s._id) === id)?.name)
                              .filter(Boolean)
                              .join(", ");

                            return (
                              <div key={aId} className={`rounded-xl border overflow-hidden transition-all ${isAreaActive ? "border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10" : isAreaRestricted ? "border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/10 opacity-75" : "border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20"}`}>
                                <button type="button" onClick={() => setAreaExpandida(estaAbierta ? null : aId)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-100/60 dark:hover:bg-gray-800/40 transition-colors" aria-expanded={estaAbierta} title={estaAbierta ? "Cerrar el área" : "Ver los turnos del área"}>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <FontAwesomeIcon icon={estaAbierta ? faChevronDown : faChevronRight} className="h-3 w-3 text-gray-400 shrink-0" />
                                    <FontAwesomeIcon icon={faLayerGroup} className={`h-4 w-4 shrink-0 ${isAreaActive ? "text-blue-500" : isAreaRestricted ? "text-amber-500" : "text-gray-400"}`} />
                                    <span className="font-bold text-sm uppercase tracking-wide truncate">{aName || aId}</span>
                                    {isAreaRestricted && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800 uppercase tracking-tighter shrink-0">Requiere Supervisor</span>}
                                  </div>
                                  {isAreaActive ? <span className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase truncate shrink-0">{turnosElegidos}</span> : <span className="text-[10px] font-medium text-gray-400 uppercase shrink-0">Sin turno</span>}
                                </button>
                                {estaAbierta && (
                                  <>
                                    {isAreaRestricted && (
                                      <div className="px-4 pb-3">
                                        <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Esta persona no puede tener áreas a cargo: le falta «Supervisa áreas y turnos». Dale un rol que lo incluya desde su ficha.</p>
                                      </div>
                                    )}
                                    <div className={`px-4 pb-3 flex flex-wrap gap-3 ${isAreaRestricted ? "pointer-events-none grayscale-[0.5]" : ""}`}>
                                      {shiftsForArea.map((shift) => {
                                        const isSelected = selectedShiftIds.includes(String(shift._id));

                                        return (
                                          <button
                                            key={shift._id}
                                            type="button"
                                            disabled={isAreaRestricted}
                                            onClick={() => {
                                              setWizardData((prev) => ({
                                                ...prev,
                                                // Elegir uno reemplaza lo que hubiera; volver a tocarlo lo deja sin área.
                                                areaShiftAssignments: isSelected ? [] : [{ areaId: aId, shiftIds: [String(shift._id)] }],
                                                /*
                                                  ELEGIR UN TURNO COMPLETA EL HORARIO DEL CONTRATO con el de ese turno.

                                                  Antes eran independientes y el horario se cargaba a mano, con los turnos
                                                  filtrados por él: había que saber a qué hora entra cada turno para que
                                                  apareciera. Ahora manda el turno, que es el dato que se conoce, y el
                                                  horario queda editable abajo para cuando esta persona entra o sale a otra
                                                  hora. Al DESELECCIONARLO no se toca: borrar el horario de un contrato
                                                  porque se destildó un turno sería perder un dato que nadie pidió cambiar.
                                                */
                                                ...(isSelected || !shift.startTime || !shift.endTime ? {} : { hora_inicio: shift.startTime, hora_fin: shift.endTime }),
                                              }));
                                            }}
                                            className={`px-3 py-2 rounded-xl border transition-all flex flex-col min-w-[120px] cursor-pointer ${isSelected ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 ring-2 ring-blue-400/50" : "bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-900/10"}`}
                                            title={isSelected ? `${shift.name} (tocá para quitarlo)` : shift.name}
                                          >
                                            <span className={`text-xs font-bold uppercase tracking-wider ${isSelected ? "text-blue-700 dark:text-blue-400" : "text-gray-800 dark:text-gray-200"}`}>{shift.name}</span>
                                            <span className={`text-[10px] font-medium uppercase mt-0.5 ${isSelected ? "text-blue-600 dark:text-blue-500" : "text-gray-500"}`}>
                                              {shift.startTime} — {shift.endTime} hs
                                            </span>
                                            {shift.days && shift.days.length > 0 && (
                                              <div className="flex gap-1 mt-1.5">
                                                {DAY_LABELS.map((label, dayIdx) => (
                                                  <span key={dayIdx} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${shift.days.includes(dayIdx) ? (isSelected ? "bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200" : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300") : "text-gray-300 dark:text-gray-600"}`}>
                                                    {label}
                                                  </span>
                                                ))}
                                              </div>
                                            )}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>

                      {wizardData.areaShiftAssignments.length === 0 && (project?.areasConfig || []).length > 0 && <p className="text-[11px] text-amber-500 dark:text-amber-400 ml-1">⚠ Elegí el área y el turno donde va a trabajar.</p>}
                    </div>

                    {/*
                      EL HORARIO, QUE YA VIENE PUESTO CON EL DEL TURNO.

                      Se llama «Modificar» porque es lo que se hace acá: el turno elegido arriba lo
                      completa, y esto es para cuando esta persona entra o sale a otra hora que el turno.
                      Inicio y fin van juntos —son las dos puntas de lo mismo— con una sola aclaración
                      debajo del par.
                    */}
                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="md:col-span-2 block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1 -mb-2">
                        <FontAwesomeIcon icon={faClock} className="mr-1" />
                        Modificar Horario (Entrada - Salida) <span className="text-red-500">*</span>
                      </label>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Entrada</label>
                        <SelectorHora
                          valor={wizardData.hora_inicio}
                          onCambio={(h) => setWizardData((prev) => ({ ...prev, hora_inicio: h, hora_fin: !prev.hora_fin && h && limiteHorasWizard != null ? sumarMinutos(h, limiteHorasWizard * 60) : prev.hora_fin }))}
                          etiqueta="Entrada"
                          placeholder="Entrada"
                          className="input-field w-full"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Salida</label>
                        {/* `desde`: en la salida, cada hora muestra cuántas horas da la jornada. */}
                        <SelectorHora valor={wizardData.hora_fin} onCambio={(h) => setWizardData((prev) => ({ ...prev, hora_fin: h }))} etiqueta="Salida" placeholder="Salida" className="input-field w-full" desde={wizardData.hora_inicio} />
                      </div>
                      {horarioExcedidoWizard ? (
                        <p className="md:col-span-2 text-[11px] font-medium text-red-600 dark:text-red-400 ml-1 -mt-2">
                          El tipo de contrato admite hasta {limiteHorasWizard} h por jornada y el horario suma {duracionHorarioWizard?.toLocaleString("es-AR", { maximumFractionDigits: 2 })} h. Ajustá la entrada o la salida.
                        </p>
                      ) : (
                        <p className="md:col-span-2 text-[10px] text-gray-400 ml-1 -mt-2">
                          Se completa con el horario del turno elegido arriba; cambialo si esta persona entra o sale a otra hora.{limiteHorasWizard != null ? ` Hasta ${limiteHorasWizard} h por jornada, según el tipo de contrato.` : ""}
                        </p>
                      )}
                      {/* Se sale del turno: se avisa y se guarda igual (ver `turnosFueraDeHorario`). */}
                      {turnosFueraDeHorario.length > 0 && (
                        <p className="md:col-span-2 text-[11px] font-medium text-amber-600 dark:text-amber-400 ml-1 -mt-1">
                          Ojo: {wizardData.hora_inicio} a {wizardData.hora_fin} se sale {turnosFueraDeHorario.length === 1 ? "del turno" : "de los turnos"} {turnosFueraDeHorario.map((sh) => `${sh.name} (${sh.startTime} a ${sh.endTime})`).join(", ")}. Se puede guardar igual.
                        </p>
                      )}
                    </div>

                    {/* Con un tipo de Servicios no hay convenio ni categoría: ver `esServicios`. */}
                    {!esServicios && (
                    <>
                    {/*
                      CONVENIO — es un FILTRO, no un dato del contrato.

                      Replica el flujo de ARCA (convenio → categoría) sin cambiar el modelo: no se
                      guarda, no viaja en el payload y no toca el TXT. Está acá porque el encuadre lo
                      terminaba decidiendo quien cargó las categorías de la función Frame, y así había
                      convenios habilitados por ARCA que no se podían usar.
                    */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Convenio (CCT)</label>
                      <select className="input-field w-full" value={convenioFiltro} onChange={(e) => cambiarConvenioFiltro(e.target.value)} disabled={!wizardData.empresaContratoId || conveniosDisponibles.length === 0}>
                        <option value="">Todos los convenios de la empleadora</option>
                        {conveniosDisponibles.map((c) => (
                          <option key={c.externalId} value={c.externalId}>
                            {c.externalId}
                            {c.name ? ` — ${c.name}` : ""} ({c.cantidadCategorias}){c.registrado ? "" : " · no registrado en ARCA"}
                          </option>
                        ))}
                      </select>
                      {!wizardData.empresaContratoId ? <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">Elegí primero la empresa contratante.</p> : conveniosDisponibles.length === 0 ? <p className="text-[11px] text-amber-700 dark:text-amber-400 ml-1">La empleadora no tiene convenios registrados. Cargalos en Empresas → ARCA.</p> : <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">Filtra las categorías. No se guarda: ARCA lo deduce de la categoría.</p>}
                    </div>

                    <div className="space-y-1.5">
                      {/* Alto fijo, igual que el rótulo de «Tipo de contrato»: es lo que mantiene
                          los dos desplegables alineados aunque el de al lado muestre un badge. */}
                      <div className="h-6 flex items-center ml-1">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">
                          Categoría <span className="text-red-500">*</span>
                        </label>
                      </div>
                      <select
                        className="input-field w-full"
                        value={wizardData.categoria_sat_id}
                        onChange={(e) => {
                          setAvisoConvenio("");
                          setWizardData((prev) => ({ ...prev, categoria_sat_id: e.target.value }));
                        }}
                        required
                      >
                        <option value="">Selecciona categoria...</option>
                        {availableCategoriasSat.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.codigoArca ? `${c.codigoArca} — ` : ""}
                            {c.nombre}
                          </option>
                        ))}
                      </select>
                      {/* La categoría que se limpió sola tiene que decirlo acá y no descubrirse al guardar. */}
                      {avisoConvenio && <p className="text-[11px] text-amber-700 dark:text-amber-400 ml-1">{avisoConvenio}</p>}

                      {/*
                        El escape hatch del filtro por función Frame.

                        Solo aparece con un convenio elegido, porque sin convenio «todas las del
                        convenio» no quiere decir nada. Cuando la función no tiene NINGUNA categoría de
                        ese convenio se prende solo y queda fijo: apagarlo dejaría el select vacío, que
                        es el estado sin explicación que esto viene a sacar.
                      */}
                      {convenioFiltro && wizardData.rol_frame_id && (
                        <label className="flex items-start gap-2 ml-1 text-[11px] text-gray-600 dark:text-gray-300 cursor-pointer select-none">
                          <input type="checkbox" checked={verTodasDelConvenio || rolNoTieneCategoriasDelConvenio} disabled={rolNoTieneCategoriasDelConvenio} onChange={(e) => setVerTodasDelConvenio(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-0.5 cursor-pointer disabled:cursor-not-allowed" />
                          <span>Ver todas las categorías de este convenio (ignora las de la función Frame)</span>
                        </label>
                      )}
                      {rolNoTieneCategoriasDelConvenio && <p className="text-[11px] text-amber-700 dark:text-amber-400 ml-1">La función Frame «{allRoleFrames.find((rf) => String(rf.data?.rol?.id) === String(wizardData.rol_frame_id))?.name || wizardData.rol_frame_id}» no tiene categorías de este convenio; se muestran todas las del convenio.</p>}

                      {/*
                        El filtro se dice, no se aplica en silencio: si una categoría que el operador
                        esperaba ver no está, tiene que saber por qué y qué la destraba.

                        Las dos causas van separadas porque llevan a acciones distintas: lo que oculta
                        ARCA no se puede destrabar desde acá (hay que registrar el convenio en la
                        empleadora); lo que oculta el filtro se destraba cambiando el select de arriba.
                      */}
                      {conveniosDeLaEmpleadora && (
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">
                          {convenioFiltro ? `Solo las del convenio ${convenioFiltro}.` : `Solo las de los convenios de la empleadora (${conveniosDeLaEmpleadora.join(", ")}).`}
                          {categoriasOcultasPorConvenio > 0 ? ` Se ocultaron ${categoriasOcultasPorConvenio} de otro convenio: ARCA no las acepta para esta empresa.` : ""}
                          {ocultasPorFiltroConvenio > 0 ? ` Otras ${ocultasPorFiltroConvenio} quedaron fuera por el convenio elegido: cambiá el filtro para verlas.` : ""}
                        </p>
                      )}
                    </div>

                    </>
                    )}

                    {/*
                      LOS IMPORTES: los mismos cuatro que la solicitud de la app, enlazados entre sí. Se
                      carga cualquiera —jornada, semana, mes o total— y los otros se recalculan; el
                      mensual es el ancla, así que un mes completo totaliza exactamente el mensual.
                      Lo que se guarda sigue siendo el sueldo por jornada.
                    */}
                    <div className="md:col-span-2 space-y-4 pt-6 border-t border-gray-100 dark:border-gray-700">
                      <ImportesDelContrato
                        className="grid grid-cols-1 md:grid-cols-2 gap-4"
                        valorJornada={wizardData.sueldo_jornada ? String(wizardData.sueldo_jornada) : ""}
                        onValorJornada={(v) => setWizardData((prev) => ({ ...prev, sueldo_jornada: Number(v) || 0 }))}
                        mesesEq={mesesEqWizard}
                        jornadas={Number(wizardData.cantidad_jornadas_laborales) || 0}
                        diasSemana={diasSemanaWizard}
                        bloqueado={!esServicios && !wizardData.categoria_sat_id}
                        textoBloqueado="Se habilita al elegir la categoría: el importe sale de su escala."
                        claseEtiqueta="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1"
                        claseCampo="input-field w-full"
                        claseCampoTotal="input-field w-full font-bold text-emerald-700 dark:text-emerald-300"
                        claseAyuda="text-[11px] text-gray-500 dark:text-gray-400 ml-1"
                      />

                      {/* Lo que se deriva de la categoría y de las jornadas: se muestra, no se carga. */}
                    <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-700">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sueldo en mano</label>
                      <input type="number" className="input-field w-full bg-gray-50 dark:bg-gray-900/50 cursor-not-allowed" value={wizardData.sueldo_mano} readOnly />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">
                        Sueldo en mano texto <span className="text-red-500">*</span>
                      </label>
                      <input type="text" className="input-field w-full bg-gray-50 dark:bg-gray-900/50 cursor-not-allowed" placeholder="Ej: Cincuenta mil pesos" value={wizardData.sueldo_mano_texto} readOnly />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sueldo diario neto</label>
                        <input type="number" step="0.01" className="input-field w-full bg-gray-50 dark:bg-gray-900/50 cursor-not-allowed" value={wizardData.sueldo_diario_neto} readOnly />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Diferencia diaria neto</label>
                        <input type="number" step="0.01" className="input-field w-full bg-gray-50 dark:bg-gray-900/50 cursor-not-allowed font-bold" style={{ color: wizardData.diferencia_diaria_neto < 0 ? "#ef4444" : "#22c55e" }} value={wizardData.diferencia_diaria_neto} readOnly />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100 dark:border-gray-700">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sueldo neto</label>
                        <input type="number" className="input-field w-full bg-gray-50 dark:bg-gray-900/50 cursor-not-allowed" value={wizardData.sueldo_neto} readOnly />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sueldo bruto</label>
                        <input type="number" className="input-field w-full bg-gray-50 dark:bg-gray-900/50 cursor-not-allowed" value={wizardData.sueldo_bruto} readOnly />
                      </div>
                    </div>
                    </div>

                    {/* --- REEMPLAZO --- va antes del área porque define el área/turno por defecto --- */}
                    <div className="md:col-span-2 space-y-3 pt-6 border-t border-gray-100 dark:border-gray-700">
                      <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-100 dark:border-gray-800">
                        <input
                          type="checkbox"
                          id="esReemplazo"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={wizardData.reemplazo}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setWizardData((prev) => ({ ...prev, reemplazo: checked, empleado_id_reemplezado: checked ? prev.empleado_id_reemplezado : "" }));
                            if (!checked) setHerenciaReemplazo(null);
                          }}
                        />
                        <label htmlFor="esReemplazo" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Es reemplazo
                        </label>
                      </div>

                      {wizardData.reemplazo && (
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Empleado reemplazado</label>
                          <select
                            className="input-field w-full"
                            value={wizardData.empleado_id_reemplezado}
                            onChange={(e) => {
                              const value = e.target.value;
                              setWizardData((prev) => ({ ...prev, empleado_id_reemplezado: value }));
                              // Por defecto, el reemplazo trabaja en el mismo área/turno que la persona reemplazada.
                              if (value) applyReplacedMemberAssignments(value);
                              else setHerenciaReemplazo(null);
                            }}
                          >
                            <option value="">Selecciona empleado...</option>
                            {teamMembers
                              .filter((m) => String(m._id) !== String(selectedUserForWizard?._id))
                              .map((m) => (
                                <option key={m._id} value={(m.metadata as any)?.id}>
                                  {m.firstName} {m.lastName}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}

                      {/* Aviso de la herencia: qué se copió (o por qué no se pudo) antes de mostrar las áreas. */}
                      {herenciaReemplazo && (
                        <div className={`rounded-lg border p-3 text-xs ${herenciaReemplazo.ok ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300" : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300"}`}>
                          <p className="font-bold flex items-center gap-2">
                            <FontAwesomeIcon icon={herenciaReemplazo.ok ? faInfoCircle : faTriangleExclamation} />
                            {herenciaReemplazo.ok ? `Área y turno heredados de ${herenciaReemplazo.replacedName}` : `No se pudo heredar el área de ${herenciaReemplazo.replacedName}`}
                          </p>
                          <p className="mt-1 leading-normal">
                            {herenciaReemplazo.ok ? (
                              <>
                                Se preseleccionó <strong>{herenciaReemplazo.detalle}</strong>. Si necesitás otra cosa, cambiala más arriba, en Asignación por Área y Turno.
                              </>
                            ) : (
                              herenciaReemplazo.detalle
                            )}
                          </p>
                        </div>
                      )}
                    </div>

                  </div>
                )}

                {/* Step 2: Sueldo */}

                {/*
                  Acá estaba el paso «Extras»: sede y observaciones. Se sacó. La sede se configura en el
                  proyecto y se toma de ahí (ver `initialSedeId`); las observaciones no se piden más. Las
                  que ya tenga un contrato no se borran: viajan tal cual en `wizardData`.
                */}
              </div>
            </div>
          </Modal>
        </div>
      ) : null}

      {/*
        FILTRO DE TRÁMITE — ventana aparte, como «Filtros avanzados».

        Elegir entre ARCA y Servicios es una decisión de filtrado, no un campo del contrato: metida
        en el formulario competía visualmente con lo que sí se está cargando y desalineaba la fila.
        Acá tiene lugar para mostrarse con los badges de color de verdad —que en una ventana de
        filtros ayudan a reconocerlos, mientras que en el medio del formulario distraían—.
      */}
      <Modal
        isOpen={filtroTramiteOpen}
        onClose={() => setFiltroTramiteOpen(false)}
        title="Filtrar tipos de contrato"
        subtitle="Por el trámite que declaran ante ARCA"
        size="sm"
        zIndex={120}
        footer={
          <div className="flex items-center justify-between w-full gap-3">
            <button
              type="button"
              onClick={() => {
                setFiltroTramite("");
                setFiltroTramiteOpen(false);
              }}
              className="btn-secondary"
            >
              Ver todos
            </button>
            <button type="button" onClick={() => setFiltroTramiteOpen(false)} className="btn-primary">
              Cerrar
            </button>
          </div>
        }
      >
        <div className="space-y-2">
          {impositivosDelAbm.map((e) => {
            const tipo = e.data?.tipoImpositivo;
            if (!esTipoImpositivo(tipo)) return null;
            const activo = filtroTramite === tipo;
            const cuantos = contratos.filter((c) => tramitePorContrato.get(c._id) === tipo).length;
            return (
              <button
                key={e._id}
                type="button"
                onClick={() => {
                  setFiltroTramite(activo ? "" : tipo);
                  setFiltroTramiteOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border text-left transition-colors ${activo ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500/20" : "border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600"}`}
              >
                <EstadoBadge name={e.name} />
                {/* Cuántos tipos de contrato quedan de cada lado: evita elegir un filtro que deja
                    la lista vacía y después no entender por qué no hay nada para seleccionar. */}
                <span className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">{cuantos === 1 ? "1 tipo" : `${cuantos} tipos`}</span>
              </button>
            );
          })}
          <p className="text-[11px] text-gray-500 dark:text-gray-400 pt-1">El filtro solo acota la lista de tipos de contrato. No cambia nada de lo que se guarda.</p>
        </div>
      </Modal>

      {/* Modal de detalle del empleado: contratos del proyecto + descargas */}
      <EmployeeContractsModal
        isOpen={!!selectedMemberForDetail}
        onClose={() => setSelectedMemberForDetail(null)}
        user={selectedMemberForDetail}
        projectId={projectId || ""}
        contratoFrames={contratoFrames}
        releases={releases}
        contratoEmpresas={contratoEmpresas}
        releaseEmpresas={releaseEmpresas}
        onEdit={(u, contract, contractIndex) => {
          setSelectedMemberForDetail(null);
          handleOpenScheduleModal(u, contract, contractIndex);
        }}
        onDelete={(id) => {
          setSelectedMemberForDetail(null);
          handleRemoveUser(id);
        }}
        onUploadAltaDocumento={handleUploadAltaDocumento}
      />

      {/* Info: por qué no se puede guardar el miembro si el proyecto no tiene áreas */}
      <InfoModal
        isOpen={showSinAreasInfo}
        onClose={() => setShowSinAreasInfo(false)}
        title="El proyecto no tiene áreas configuradas"
        subtitle="Por qué no podés guardar los cambios del miembro"
        size="sm"
        zIndex={100}
        actions={[
          {
            label: "Ir a Editar Proyecto",
            onClick: () => {
              setShowSinAreasInfo(false);
              navigate(`/projects/${projectId}`, { state: { openEdit: true } });
            },
            variant: "primary",
          },
          { label: "Entendido", onClick: () => setShowSinAreasInfo(false), variant: "secondary" },
        ]}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            La <strong>asignación por área y turno es obligatoria</strong> para guardar un miembro. Si el proyecto no tiene áreas, no hay nada para seleccionar y cualquier cambio del miembro (sueldo, contrato, extras) queda bloqueado.
          </p>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Entrá a <strong>Editar Proyecto → Configuración por Área</strong> y agregá al menos un área con sus turnos.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Volvé al equipo y configurá el miembro: ya vas a poder elegir área y turno, y guardar.</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Sin áreas, además, los usuarios no pueden cargar su área y los supervisores no pueden informar novedades sobre ellos.</span>
            </li>
          </ul>
        </div>
      </InfoModal>

      {/* Info: de dónde sale el Estado del contrato (Agregar/Configurar miembro) */}
      <InfoModal isOpen={showEstadoInfo} onClose={() => setShowEstadoInfo(false)} title="Estado del contrato" subtitle="De dónde sale y dónde se configura" size="sm" zIndex={120} actions={[{ label: "Entendido", onClick: () => setShowEstadoInfo(false), variant: "primary" }]}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            El Estado se resuelve solo, a partir del <strong>Tipo de Contrato</strong> elegido: si tiene un Estado impositivo vinculado (por ejemplo "Pedido de ARCA" o "Pedido de Servicios"), se muestra acá. Si no tiene ninguno, no hay nada para mostrar.
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Los Estados (nombre, color, y a qué Tipos de Contrato están vinculados) se configuran en{" "}
            <Link to="/contratos?tab=states" target="_blank" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              Contratos → Estados de Contratos
            </Link>
            .
          </p>
        </div>
      </InfoModal>

      {/* Info: qué significa el número entre paréntesis en Área/Turno Coordinada */}
      <InfoModal isOpen={openCoordCountInfo} onClose={() => setOpenCoordCountInfo(false)} title="Personas supervisadas por área y turno" subtitle="Qué significa el número entre paréntesis" size="sm" zIndex={100} actions={[{ label: "Entendido", onClick: () => setOpenCoordCountInfo(false), variant: "primary" }]}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            El número al lado de cada turno es la cantidad de <strong>usuarios activos y con contrato vigente</strong> asignados a esa combinación exacta de área y turno, o sea a quiénes supervisa esa persona en ese horario.
          </p>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                <strong>Estado activo</strong>: el usuario figura como ACTIVO. <strong>Contrato vigente</strong>: su contrato no tiene fecha de baja, o la baja es de hoy en adelante. Quien no cumple las dos cosas no suma.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Haciendo <strong>click en el turno</strong> se abre el detalle de esas personas con su estado, estado de contrato y alta/baja. Las que no cumplen aparecen al final, en <strong>"No suman al total"</strong>.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Cada turno cuenta el <strong>área y el horario exactos</strong>. El número al lado del <strong>área</strong> es el total de esos horarios contando a cada <strong>persona una sola vez</strong>: quien está asignado a dos turnos de la misma área suma uno, no dos.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                El <strong>supervisor se incluye a sí mismo</strong> si además pertenece a esa área y turno.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Se calcula sobre <strong>todo el equipo del proyecto</strong>, no solo sobre la página que estás viendo, y se actualiza cuando cambian las asignaciones de los miembros.
              </span>
            </li>
          </ul>
        </div>
      </InfoModal>
    </PageLayout>
  );
};
