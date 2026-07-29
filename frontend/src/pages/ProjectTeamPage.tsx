import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from '../api/axiosConfig';
import { projectsAPI, Project } from '../api/projects';
import { usersAPI, User, Contract } from '../api/users';
import { useAuthStore } from '../stores/authStore';
import { sweetAlert } from '../utils/sweetAlert';

import { PageLayout } from '../components/ui/PageLayout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { UserCard } from '../components/users/UserCard';
import { Modal } from '../components/ui/Modal';
import { InfoModal } from '../components/ui/InfoModal';
import { SearchAndFilters } from '../components/ui/SearchAndFilters';

import { getHelp } from '../data/help/helpContent';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faSearch, faFilter, faTrash, faBriefcase, faClock, faGrip, faTable, faPlus, faEdit, faIdCard, faUser, faUmbrellaBeach, faClipboardList, faUserTie, faLayerGroup, faUserShield, faUserGraduate, faBuilding, faFileContract, faInfoCircle, faTriangleExclamation, faChevronDown, faXmark, faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { vacationsAPI, VacationRequest } from '../api/vacations';
import { TeamSolicitudesTab } from '../components/team/TeamSolicitudesTab';
import { TeamCoordinadoresTab } from '../components/team/TeamCoordinadoresTab';
import { EmployeeContractsModal } from '../components/team/EmployeeContractsModal';
import { EstadoSelect, EstadoBadge, estadoLabel } from '../components/EstadoSelect';
import { contratoFrameAPI, ContratoFrameItem } from '../api/contratosFrame';
import { releasesAPI, Release } from '../api/release';
import { companiesAPI, Company } from '../api/companies';
import { Area, areasAPI } from '../api/areas';
import { positionsAPI, Position } from '../api/positions';
import { levelsAPI, Level } from '../api/levels';
import { userProjectsAPI } from '../api/userProjects';
import { shiftsAPI, Shift } from '../api/shifts';
import { clientsAPI } from '../api/clients';
import { infoAPI, InfoItem } from '../api/info';
import { categoriaSatAPI, CategoriaSatItem } from '../api/categoriasSat';
import { roleFrameAPI, RoleFrameItem } from '../api/roleFrames';
import { cachedFetch } from '../utils/refCache';

const HELP_KEY = 'projectTeam' as const;

// Formatea una fecha de contrato (ISO "YYYY-MM-DD...") a d/m/yyyy sin corrimiento de zona horaria.
function formatContractDate(d?: string): string {
  if (!d) return '—';
  const iso = String(d).substring(0, 10);
  const parts = iso.split('-');
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    return `${Number(parts[2])}/${Number(parts[1])}/${parts[0]}`;
  }
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString();
}

// Un contrato está VIGENTE si no tiene baja (tiempo indeterminado) o si la baja es hoy o futura.
// NO VIGENTE si la fecha de baja es anterior a hoy.
function isContractVigente(baja?: string): boolean {
  if (!baja) return true; // sin baja → tiempo indeterminado → vigente
  const iso = String(baja).substring(0, 10);
  const parts = iso.split('-');
  let bajaDate: Date | null = null;
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    bajaDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  } else {
    const d = new Date(baja);
    if (!isNaN(d.getTime())) bajaDate = d;
  }
  if (!bajaDate) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  bajaDate.setHours(0, 0, 0, 0);
  return bajaDate.getTime() >= today.getTime();
}

// Roles de sistema con acceso a la app mobile. El valor viaja al server como `roleName=mobile-<value>`,
// que matchea el nombre completo del rol tolerando el separador ("Mobile-Coordinador", "Mobile Coordinador", ...).
const MOBILE_ROLE_OPTIONS = [
  { value: 'colaborador', label: 'Mobile-Colaborador' },
  { value: 'coordinador', label: 'Mobile-Coordinador' },
];

function numeroALetras(num: number): string {
  const Unidades = (num: number): string => {
    switch (num) {
      case 1:
        return 'UN';
      case 2:
        return 'DOS';
      case 3:
        return 'TRES';
      case 4:
        return 'CUATRO';
      case 5:
        return 'CINCO';
      case 6:
        return 'SEIS';
      case 7:
        return 'SIETE';
      case 8:
        return 'OCHO';
      case 9:
        return 'NUEVE';
      default:
        return '';
    }
  };

  const Decenas = (num: number): string => {
    const unidad = num % 10;
    const decena = Math.floor(num / 10);
    switch (decena) {
      case 1:
        switch (unidad) {
          case 0:
            return 'DIEZ';
          case 1:
            return 'ONCE';
          case 2:
            return 'DOCE';
          case 3:
            return 'TRECE';
          case 4:
            return 'CATORCE';
          case 5:
            return 'QUINCE';
          default:
            return 'DIECI' + Unidades(unidad);
        }
      case 2:
        if (unidad === 0) return 'VEINTE';
        return 'VEINTI' + Unidades(unidad);
      case 3:
        return 'TREINTA' + (unidad > 0 ? ' Y ' + Unidades(unidad) : '');
      case 4:
        return 'CUARENTA' + (unidad > 0 ? ' Y ' + Unidades(unidad) : '');
      case 5:
        return 'CINCUENTA' + (unidad > 0 ? ' Y ' + Unidades(unidad) : '');
      case 6:
        return 'SESENTA' + (unidad > 0 ? ' Y ' + Unidades(unidad) : '');
      case 7:
        return 'SETENTA' + (unidad > 0 ? ' Y ' + Unidades(unidad) : '');
      case 8:
        return 'OCHENTA' + (unidad > 0 ? ' Y ' + Unidades(unidad) : '');
      case 9:
        return 'NOVENTA' + (unidad > 0 ? ' Y ' + Unidades(unidad) : '');
      default:
        return Unidades(num);
    }
  };

  const Centenas = (num: number): string => {
    const decenas = num % 100;
    const centenaDigito = Math.floor(num / 100);
    switch (centenaDigito) {
      case 1:
        if (decenas === 0) return 'CIEN';
        return 'CIENTO ' + Decenas(decenas);
      case 2:
        return 'DOSCIENTOS ' + Decenas(decenas);
      case 3:
        return 'TRESCIENTOS ' + Decenas(decenas);
      case 4:
        return 'CUATROCIENTOS ' + Decenas(decenas);
      case 5:
        return 'QUINIENTOS ' + Decenas(decenas);
      case 6:
        return 'SEISCIENTOS ' + Decenas(decenas);
      case 7:
        return 'SETECIENTOS ' + Decenas(decenas);
      case 8:
        return 'OCHOCIENTOS ' + Decenas(decenas);
      case 9:
        return 'NOVECIENTOS ' + Decenas(decenas);
      default:
        return Decenas(num);
    }
  };

  const Seccion = (num: number, divisor: number, strSingular: string, strPlural: string): string => {
    const cientos = Math.floor(num / divisor);
    let letras = '';

    if (cientos > 0) {
      if (cientos > 1) {
        letras = Centenas(cientos) + ' ' + strPlural;
      } else {
        letras = strSingular;
      }
    }

    return letras;
  };

  const Miles = (num: number): string => {
    const divisor = 1000;
    const resto = num % divisor;
    let strMiles = Seccion(num, divisor, 'MIL', 'MIL');
    let strCentenas = Centenas(resto);

    if (strMiles === '') return strCentenas;
    if (strMiles === 'UN MIL') strMiles = 'MIL';
    if (strCentenas === '') return strMiles;
    return strMiles + ' ' + strCentenas;
  };

  const Millones = (num: number): string => {
    const divisor = 1000000;
    const resto = num % divisor;
    let strMillones = Seccion(num, divisor, 'UN MILLÓN', 'MILLONES');
    let strMiles = Miles(resto);

    if (strMillones === '') return strMiles;
    if (strMiles === '') return strMillones;
    return strMillones + ' ' + strMiles;
  };

  const entero = Math.floor(num);
  const centavosVal = Math.round((num - entero) * 100);
  const centavosStr = centavosVal.toString().padStart(2, '0') + '/100';

  if (entero === 0) {
    return 'CERO ' + centavosStr;
  }

  return (Millones(entero) + ' ' + centavosStr).replace(/\s+/g, ' ').trim();
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
  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [allAreas, setAllAreas] = useState<Area[]>([]);
  const [allPositions, setAllPositions] = useState<Position[]>([]);
  const [allLevels, setAllLevels] = useState<Level[]>([]);
  const [allClients, setAllClients] = useState<any[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allSedes, setAllSedes] = useState<InfoItem[]>([]);
  // Catálogo REAL de Categorías SAT (colección `categorias-sat`, el mismo que muestra la ABM).
  // OJO: NO usar infoAPI.listByType("categoria-sat") → esa colección está vacía.
  const [allCategoriasSat, setAllCategoriasSat] = useState<CategoriaSatItem[]>([]);
  const [allEstados, setAllEstados] = useState<InfoItem[]>([]);
  const [allTiposContrato, setAllTiposContrato] = useState<InfoItem[]>([]);
  const [allRoleFrames, setAllRoleFrames] = useState<RoleFrameItem[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [userLookup, setUserLookup] = useState<Map<number | string, string>>(new Map());

  // Filters
  const [searchTerm, setSearchTerm] = useState(''); // For Disponibles (Modal)
  const [filterRole, setFilterRole] = useState(''); // Filter by Role
  const [filterRoleFrame, setFilterRoleFrame] = useState(''); // Filter by Role Frame
  const [filterProject, setFilterProject] = useState(''); // Filter by Project
  const [showFilters, setShowFilters] = useState(false); // Toggle filters UI
  const [searchTermTeam, setSearchTermTeam] = useState(''); // For Equipo Actual
  const [filterUserStatus, setFilterUserStatus] = useState<string>('');
  const [filterVigencia, setFilterVigencia] = useState<string>(''); // "" | "vigente" | "novigente" (client-side sobre la página)
  const [filterTipoContrato, setFilterTipoContrato] = useState<string>(''); // nombre_contrato (client-side sobre la página)
  const [filterAreaTurno, setFilterAreaTurno] = useState<string>(''); // "" | "__none__" | "areaId::shiftId" (client-side sobre la página)
  const [filterEstadoContrato, setFilterEstadoContrato] = useState<string>(''); // nombre_estado_empleado (client-side sobre la página)
  const [filterRolMobile, setFilterRolMobile] = useState<string>(''); // "" | "colaborador" | "coordinador" (server-side, paginado)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [selectedUserForWizard, setSelectedUserForWizard] = useState<User | null>(null);
  // Índice (en el array original de contracts del UserProject) del contrato que se está editando desde el
  // modal de contratos. null = no se edita uno puntual (alta nueva o edición genérica → se toca el último).
  const [editingContractIndex, setEditingContractIndex] = useState<number | null>(null);
  // Si el wizard se abrió para APROBAR una solicitud, guardamos su id: al guardar, el backend marca la
  // solicitud como aprobada. null = alta/edición normal.
  const [approvingSolicitudId, setApprovingSolicitudId] = useState<string | null>(null);
  // Se incrementa tras aprobar para que la pestaña Solicitudes recargue su lista.
  const [solicitudesRefresh, setSolicitudesRefresh] = useState(0);
  const [viewingShiftsData, setViewingShiftsData] = useState<{ user: User; areaId: string; areaName: string } | null>(null);
  const [wizardData, setWizardData] = useState({
    // Step 1: Contrato
    rol_frame_id: '',
    categoria_sat_id: '',
    contrato_frame_id: '', // _id de la contratos-frame elegida (valor del select)
    nombre_contrato: '', // nombre de la contratos-frame elegida (identificador estable / match PDF)
    tipo_contrato_id: '', // ID Externo numérico, solo si la contratos-frame lo tiene
    estado_id: '',
    // Empresas del proyecto elegidas para el contrato / release de este miembro (ObjectId o "")
    empresaContratoId: '',
    empresaReleaseId: '',
    hora_inicio: '09:00',
    hora_fin: '18:00',
    fecha_alta_contrato: new Date().toISOString().split('T')[0],
    fecha_baja_contrato: '',
    // Step 2: Sueldo
    cantidad_jornadas_laborales: 5,
    sueldo_jornada: 0,
    sueldo_mano: 0,
    sueldo_mano_texto: '',
    sueldo_diario_neto: 0,
    diferencia_diaria_neto: 0,
    sueldo_neto: 0,
    sueldo_bruto: 0,
    // Step 3: Extras
    sede_id: '',
    reemplazo: false,
    empleado_id_reemplezado: '',
    observaciones: '',
    areaShiftAssignments: [] as { areaId: string; shiftIds: string[] }[],
    positionId: '',
    levelId: '',
  });

  // UI States
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLg, setIsLg] = useState(window.innerWidth >= 1024);
  const [activeTab, setActiveTab] = useState<'equipo' | 'solicitudes' | 'coordinadores'>('equipo');
  const [solicitudesCount, setSolicitudesCount] = useState(0);
  const [showCandidatesInfo, setShowCandidatesInfo] = useState(false);
  const [showSinAreasInfo, setShowSinAreasInfo] = useState(false);
  // Aviso de la herencia de área/turno al marcar un reemplazo (qué se copió o por qué no se pudo).
  const [herenciaReemplazo, setHerenciaReemplazo] = useState<{ ok: boolean; replacedName: string; detalle: string } | null>(null);

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
    const fromProject = (ids || []).map((id) => ({ id, label: companies.find((c) => c._id === id)?.razonSocial || '' })).filter((e) => e.label);
    return fromProject.length > 0 ? fromProject : allEmpresas;
  };
  const contratoEmpresas = resolveEmpresas(project?.contratoEmpresas);
  const releaseEmpresas = resolveEmpresas(project?.releaseEmpresas);

  // Persistence for view mode
  useEffect(() => {
    const saved = localStorage.getItem('projectTeamViewMode');
    if (saved === 'table' || saved === 'cards') {
      setViewMode(saved as 'table' | 'cards');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('projectTeamViewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    const handleResize = () => setIsLg(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const effectiveViewMode = isLg ? viewMode : 'cards';

  /* -------------------------- Auto-Calculations ---------------------------
   * El Sueldo NETO y BRUTO salen de la Categoría SAT seleccionada (ya vienen
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

  // Página actual del equipo (datos completos), paginada en el server por proyecto + búsqueda + estado + rol.
  const fetchTeamPage = async (page: number, opts?: { search?: string; status?: string; rolMobile?: string }) => {
    if (!projectId) return;
    const search = opts?.search ?? searchTermTeam;
    const status = opts?.status ?? filterUserStatus;
    const rolMobile = opts?.rolMobile ?? filterRolMobile;
    const reqId = ++teamReqIdRef.current;
    try {
      setTeamFetching(true);
      const params: any = { projectId, page, limit: TEAM_PAGE_SIZE, sort: 'name' };
      if (search) params.email = search; // el backend busca fuzzy en nombre/email
      if (status === 'active') params.metadataActivo = 'true';
      if (status === 'inactive') params.metadataActivo = 'false';
      // Rol server-side: si no, el filtro se aplicaría solo sobre la página cargada y la paginación
      // quedaría con resultados salteados entre páginas.
      if (rolMobile) params.roleName = `mobile-${rolMobile}`;
      const resp = await usersAPI.list(params);
      if (reqId !== teamReqIdRef.current) return; // descartar respuestas viejas
      setTeamRows(resp.users);
      setTeamTotal(resp.pagination.total);
      setTeamTotalPages(resp.pagination.pages);
    } catch (e) {
      if (reqId === teamReqIdRef.current) console.error('Error fetching team page:', e);
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
      console.error('Error fetching full team (lite):', e);
      return [];
    }
  };

  useEffect(() => {
    if (!projectId || !token) return;

    const init = async () => {
      try {
        setLoading(true);
        const [projectData, vacationsData, areasData, positionsData, levelsData, shiftsData] = await Promise.all([
          projectsAPI.getProject(projectId), // específico del proyecto: no se cachea
          cachedFetch('vacations:all', () => vacationsAPI.getAll()),
          cachedFetch('areas:all', () => areasAPI.listAll()),
          cachedFetch('positions:all', () => positionsAPI.listAll()),
          cachedFetch('levels:all', () => levelsAPI.listAll()),
          cachedFetch('shifts:all', () => shiftsAPI.getAll()),
        ]);

        setAllPositions(positionsData);
        setAllLevels(levelsData);
        setAllShifts(shiftsData);

        // Auto-cleanup orphaned user IDs from assignedUsers
        try {
          const cleanupResult = await projectsAPI.cleanupTeam(projectId);
          if (cleanupResult.removedCount > 0) {
            // Silent cleanup - no notification shown
            // Re-fetch project to get updated assignedUsers
            const updatedProject = await projectsAPI.getProject(projectId);
            setProject(updatedProject);
            setTeamConfig(updatedProject.teamConfig || []);
          } else {
            setProject(projectData);
            setTeamConfig(projectData.teamConfig || []);
          }
        } catch (cleanupError) {
          console.warn('Could not cleanup team:', cleanupError);
          setProject(projectData);
          setTeamConfig(projectData.teamConfig || []);
        }

        // Equipo: lista liviana completa (Coordinadores/contadores) + primera página con datos completos.
        const teamUsers = await fetchFullTeamLite();
        fetchTeamPage(1);

        setVacations(vacationsData);
        setAllAreas(areasData);

        // Fetch additional data for user cards
        const [allClientsData, allProjectsResponse] = await Promise.all([cachedFetch('clients:all', () => clientsAPI.listAll()), cachedFetch('projects:all', () => projectsAPI.listAll({ limit: 500 }))]);

        setAllClients(allClientsData);
        setAllProjects(allProjectsResponse);

        // Fetch Metadata Info (datos de referencia estables → cacheados)
        const [sedes, cats, estados, tipos, rf, cfs] = await Promise.all([cachedFetch('info:sede', () => infoAPI.listByType('sede')), cachedFetch('categoriaSat:all', () => categoriaSatAPI.list()), cachedFetch('info:estado-empleado', () => infoAPI.listByType('estado-empleado')), cachedFetch('info:contrato', () => infoAPI.listByType('contrato')), cachedFetch('roleFrames:all', () => roleFrameAPI.list()), cachedFetch('contratoFrames:all', () => contratoFrameAPI.list())]);
        setAllSedes(sedes);
        setAllCategoriasSat(cats);
        setAllEstados(estados);
        setAllTiposContrato(tipos);
        setAllRoleFrames(rf);
        setContratoFrames(cfs);

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
            const name = u.firstName || u.lastName ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : u.email.split('@')[0];
            lookupMap.set(metaId, name);
          }
        });
        setUserLookup(lookupMap);
      } catch (error) {
        console.error('Error loading data:', error);
        sweetAlert.error('Error', 'No se pudieron cargar los datos del equipo.');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [projectId, token]);

  // Búsqueda / estado / rol en el Equipo → server-side, resetea a página 1 (debounced, como Usuarios).
  const teamFiltersInitedRef = React.useRef(false);
  useEffect(() => {
    if (!projectId) return;
    if (!teamFiltersInitedRef.current) {
      teamFiltersInitedRef.current = true; // evita doble fetch en el montaje (init ya carga la página 1)
      return;
    }
    const h = setTimeout(() => {
      setTeamPage(1);
      fetchTeamPage(1, { search: searchTermTeam, status: filterUserStatus, rolMobile: filterRolMobile });
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTermTeam, filterUserStatus, filterRolMobile]);

  // Cantidad de personas por área/turno: se recalcula en el server (equipo completo, no la página).
  // Se refresca cuando cambia `teamConfig`, o sea después de cada alta/edición de miembro.
  useEffect(() => {
    if (!projectId || !token) return;
    let cancelled = false;
    projectsAPI
      .getAreaShiftCounts(projectId)
      .then((counts) => {
        if (!cancelled) setAreaShiftCounts(counts);
      })
      .catch((e) => console.error('Error fetching area/shift counts:', e));
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
        const count = solis.filter((u) => u.metadata?.projectIds?.includes(projectId)).length;
        setSolicitudesCount(count);
      } catch (e) {
        console.error('Error fetching solicitudes count:', e);
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
      setSearchTerm('');
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
        const response = await usersAPI.list({ page: candPage, limit: CAND_PAGE_SIZE, metadataActivo: 'true', email: searchTerm || undefined, slimProjects: true });
        if (reqId !== candReqIdRef.current) return;
        setCandidateUsers(response.users);
        setCandTotal(response.pagination.total);
        setCandTotalPages(response.pagination.pages);
      } catch (error) {
        if (reqId === candReqIdRef.current) console.error('Error fetching candidates:', error);
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
    if (!project) return '';
    if (typeof project.clientId === 'object' && project.clientId?.name) {
      return project.clientId.name;
    }
    return '';
  }, [project]);

  const projectMap = useMemo(() => new Map(allProjects.map((p) => [p._id, p])), [allProjects]);
  const clientMap = useMemo(() => new Map(allClients.map((c) => [c._id, c])), [allClients]);

  // Combinaciones Área · Turno configuradas en el proyecto (para el filtro).
  const areaTurnoOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const seen = new Set<string>();
    (project?.areasConfig || []).forEach((ac: any) => {
      const aId = typeof ac.areaId === 'object' ? ac.areaId?._id : ac.areaId;
      const aName = typeof ac.areaId === 'object' ? ac.areaId?.name : allAreas.find((a) => String(a._id) === String(aId))?.name;
      if (!aId || !aName) return;
      (ac.shiftIds || []).forEach((sid: any) => {
        const sId = typeof sid === 'object' ? sid?._id : sid;
        const sName = typeof sid === 'object' ? sid?.name : allShifts.find((s) => String(s._id) === String(sId))?.name;
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
    // Se deduplica por etiqueta canónica: "Falta pedido de AFIP" y "Pedido de AFIP" son el mismo estado.
    const seen = new Set<string>();
    allEstados.forEach((e) => e.name && seen.add(estadoLabel(e.name)));
    // Último contrato del miembro en este proyecto (getActiveContract se declara más abajo, así que
    // acá se resuelve igual pero inline).
    teamRows.forEach((u) => {
      const projectMeta = u.metadata?.projects?.find((p: any) => {
        const pId = p.projectId;
        return String(typeof pId === 'object' ? (pId as any)?._id : pId) === String(projectId);
      });
      const contracts = projectMeta?.contracts || [];
      const estado = contracts.length ? (contracts[contracts.length - 1] as any)?.nombre_estado_empleado : null;
      if (estado) seen.add(estadoLabel(estado));
    });
    return [...seen].map((name) => ({ value: name, label: name }));
  }, [allEstados, teamRows, projectId]);

  const sedeName = useMemo(() => {
    if (!project) return null;
    return (project as any).metadataResolutions?.sede?.name || (project as any).metadataResolutions?.sede?.data?.nombre || null;
  }, [project]);

  const [client, setClient] = useState<any>(null);

  useEffect(() => {
    if (project && typeof project.clientId === 'string' && !clientName) {
      // fetch client
      projectsAPI.getClient(project.clientId).then(setClient).catch(console.error);
    }
  }, [project, clientName]);

  const displayedClientName = client?.name || clientName || 'Cliente';

  // Unificamos los IDs de usuarios asignados (cruce entre la lista del proyecto y los metadatos de los usuarios)
  const assignedUserIds = useMemo(() => {
    if (!project || !projectId) return [];

    // 1. Usuarios explícitamente asignados en el objeto Proyecto
    const fromProject = ((project.assignedUsers as any[]) || []).map((u) => (typeof u === 'string' ? u : u._id));

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
        const ownRFNames = (((user.metadata as any)?.rolesFrameIds || (user.metadata as any)?.roles_frame || []) as any[]).map((rf: any) => (typeof rf === 'object' ? rf?.name : allRoleFrames.find((i) => i._id === rf)?.name)).filter(Boolean) as string[];
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

  const displayedCount = useMemo(() => {
    if (activeTab === 'equipo') {
      return teamTotal;
    }
    if (activeTab === 'coordinadores') {
      const coordIds = new Set((project?.coordinatorAssignments || []).map((asm) => (typeof asm.userId === 'object' ? asm.userId?._id : asm.userId)).filter(Boolean));
      return coordIds.size;
    }
    if (activeTab === 'solicitudes') {
      return solicitudesCount;
    }
    return teamMembers.length;
  }, [activeTab, teamTotal, project?.coordinatorAssignments, solicitudesCount, teamMembers.length]);

  const hasMobileCoordinator = useMemo(() => {
    return teamMembers.some((u) =>
      u.roles?.some((r) => {
        const n = r.name.toLowerCase();
        return n.includes('mobile') && n.includes('coordinador');
      }),
    );
  }, [teamMembers]);

  const availableCategoriasSat = useMemo(() => {
    let list: any[] = [];
    if (wizardData.rol_frame_id) {
      const selectedRF = allRoleFrames.find((rf) => String(rf.data?.rol?.id) === String(wizardData.rol_frame_id));
      if (selectedRF && Array.isArray(selectedRF.data?.categoriasSat)) {
        list = [...selectedRF.data.categoriasSat];
      }
    }

    // Fallback: If list is empty but we have allCategoriasSat, use allCategoriasSat as options
    if (list.length === 0 && allCategoriasSat.length > 0) {
      list = allCategoriasSat.map((c) => ({
        id: c.data?.id,
        nombre: c.name,
        numeroCategoria: c.data?.numeroCategoria || c.data?.id,
      }));
    }

    // Ensure the currently selected category is in the list
    if (wizardData.categoria_sat_id) {
      const alreadyInList = list.some((c) => String(c.id) === String(wizardData.categoria_sat_id));
      if (!alreadyInList) {
        // Find it in global list
        const globalCat = allCategoriasSat.find((c) => String(c.data?.id) === String(wizardData.categoria_sat_id));
        if (globalCat) {
          list.push({
            id: globalCat.data?.id,
            nombre: globalCat.name,
            numeroCategoria: globalCat.data?.numeroCategoria || globalCat.data?.id,
          });
        }
      }
    }

    return list;
  }, [allRoleFrames, allCategoriasSat, wizardData.rol_frame_id, wizardData.categoria_sat_id]);

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
      .map((rf: any) => (typeof rf === 'object' ? rf?._id : rf))
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

  // Check Is Coordinator Helper
  const checkIsCoordinator = (user: User) => (typeof user.positionId === 'object' && user.positionId?.name?.toLowerCase().includes('coordinador')) || (user.roles && user.roles.some((r) => r.name.toLowerCase().includes('coordinador'))) || user.firstName?.toLowerCase().includes('coordinador') || user.lastName?.toLowerCase().includes('coordinador');

  // Get standard shifts for a user assigned to an area
  const getStandardShifts = (user: User, userConfig: any, activeContract: any, areaId: string, areaName: string) => {
    let shifts: any[] = [];
    if (!user) return shifts;

    // Helper to get coordinated shift IDs for exclusion
    const getCoordinatedShiftIds = () => {
      if (!project?.coordinatorAssignments) return [];
      return project.coordinatorAssignments
        .filter((asm) => {
          const uid = typeof asm.userId === 'object' ? (asm.userId as any)?._id : asm.userId;
          const aid = typeof asm.areaId === 'object' ? (asm.areaId as any)?._id : asm.areaId;
          return String(uid) === String(user._id) && String(aid) === String(areaId);
        })
        .map((asm) => (typeof asm.shiftId === 'object' ? (asm.shiftId as any)?._id : asm.shiftId));
    };

    const coordShiftIds = getCoordinatedShiftIds();

    // 1. Check team configuration assignments (Wizard) and EXCLUDE coordinated ones
    const assignments = userConfig?.areaShiftAssignments || [];
    const areaAssign = assignments.find((a: any) => {
      const aid = typeof a.areaId === 'object' ? a.areaId?._id : a.areaId;
      if (String(aid) === String(areaId)) return true;
      const aData = allAreas.find((area) => String(area._id) === String(aid) || String(area.data?.id) === String(aid));
      return aData && areaName && aData.name.toLowerCase() === areaName.toLowerCase();
    });

    if (areaAssign) {
      const sids = areaAssign.shiftIds || [];
      sids.forEach((sid: any) => {
        const actualSid = typeof sid === 'object' ? sid?._id : sid;
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
          const aid = typeof a.areaId === 'object' ? a.areaId?._id : a.areaId;
          if (String(aid) === String(areaId)) return true;
          const aData = allAreas.find((area) => String(area._id) === String(aid) || String(area.data?.id) === String(aid));
          return aData && areaName && aData.name.toLowerCase() === areaName.toLowerCase();
        });

        if (fallbackAssign) {
          const sids = fallbackAssign.shiftIds || [];
          sids.forEach((sid: any) => {
            const actualSid = typeof sid === 'object' ? sid?._id : sid;
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
      const shiftIdFromUser = user.turnos && user.turnos.length > 0 ? (typeof user.turnos[0] === 'object' ? user.turnos[0]._id : user.turnos[0]) : undefined;
      const finalShiftId = userConfig?.shiftId || shiftIdFromUser;
      const shift = allShifts.find((sh) => String(sh._id) === String(finalShiftId));
      if (shift) shifts = [shift];
    }

    return shifts;
  };

  // Personas del equipo asignadas a ese área + turno exacto (incluye al coordinador si él también
  // pertenece a esa combinación). Lo calcula el server sobre el equipo completo.
  const getAreaShiftPeopleCount = (areaId: string, shiftId: string): number => areaShiftCounts[`${areaId}::${shiftId}`] || 0;

  // Get coordinated shifts for a user assigned to an area
  const getCoordinatedShifts = (user: User, areaId: string) => {
    let shifts: any[] = [];
    if (!user) return shifts;
    if (project?.coordinatorAssignments) {
      const myCoordAsgn = project.coordinatorAssignments.filter((asm) => {
        const uid = typeof asm.userId === 'object' ? (asm.userId as any)?._id : asm.userId;
        const aid = typeof asm.areaId === 'object' ? (asm.areaId as any)?._id : asm.areaId;
        return String(uid) === String(user._id) && String(aid) === String(areaId);
      });
      myCoordAsgn.forEach((asm) => {
        const sid = typeof asm.shiftId === 'object' ? (asm.shiftId as any)?._id : asm.shiftId;
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
      const isFinal = v.status === 'delivered' || v.signatureStatus === 'signed' || (v.status === 'approved' && v.signatureStatus === 'not_required');
      if (!isFinal) return false;

      const start = new Date(v.startDate);
      const end = new Date(v.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);

      return today >= start && today <= end;
    });
  };

  const calculateDuration = (start: string, end: string) => {
    if (!start || !end) return '';
    try {
      const [startH, startM] = start.split(':').map(Number);
      const [endH, endM] = end.split(':').map(Number);
      if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return '';

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
      return '';
    }
  };

  /* --------------------------- Notifications Logic ------------------------- */

  const updateTeamConfig = async (newConfig: any[]) => {
    if (!project) return;
    try {
      const updatedProject = await projectsAPI.updateTeamConfig(project._id, newConfig);
      setTeamConfig(updatedProject.teamConfig || []);
    } catch (err) {
      console.error('Error updating team config', err);
      sweetAlert.error('Error', 'No se pudo guardar la configuración del equipo.');
    }
  };
  const handleOpenScheduleModal = (user: User, contractOverride?: Contract, contractIndex?: number) => {
    handleOpenWizard(user._id, contractOverride, contractIndex);
  };

  /* ------------------------------- Actions -------------------------------- */

  const handleOpenWizard = async (userId: string, contractOverride?: Contract, contractIndex?: number, approveSolicitudId?: string) => {
    // Si viene de editar una tarjeta puntual del modal de contratos, guardamos ese índice para
    // actualizar EXACTAMENTE ese contrato al guardar (si no, el backend toca el último).
    setEditingContractIndex(typeof contractIndex === 'number' ? contractIndex : null);
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
      console.error('No se pudo traer el usuario completo, uso el de la lista:', e);
    }
    if (!user) return;

    // Attempt to find existing data to pre-fill from user history
    const metadataProjects = user.metadata?.projects || [];

    // Prioritize current project if existing
    const currentProjectMeta = metadataProjects.find((p: any) => String(typeof p.projectId === 'string' ? p.projectId : p.projectId?._id) === String(project?._id));

    const lastProject = currentProjectMeta || (metadataProjects.length > 0 ? metadataProjects[metadataProjects.length - 1] : null);
    // Si se editó una tarjeta puntual del modal de contratos, precargar ESE contrato; si no, el último.
    const lastContract =
      contractOverride ||
      (typeof contractIndex === "number" && lastProject?.contracts?.[contractIndex] != null
        ? lastProject.contracts[contractIndex]
        : lastProject?.contracts?.length
          ? lastProject.contracts[lastProject.contracts.length - 1]
          : null);

    console.log('[Wizard] user:', user._id, 'lastProject:', lastProject?._id, 'lastContract keys:', lastContract ? Object.keys(lastContract) : 'null');
    console.log('[Wizard] lastContract:', lastContract ? JSON.stringify({ categoria_sat_id: (lastContract as any).categoria_sat_id, nombre_categoria_sat: (lastContract as any).nombre_categoria_sat, estado_id: (lastContract as any).estado_id, nombre_estado_empleado: (lastContract as any).nombre_estado_empleado }) : 'null');

    // Default statuses and IDs
    const activoEstado = allEstados.find((e) => e.name.toLowerCase().includes('activo'));

    // Prioritize IDs from last contract if they exist (numeric IDs stored in UserProject)
    let initialCatId = '';
    if (lastContract) {
      const catIdFromDb = (lastContract as any).categoria_sat_id;
      const catNameFromDb = (lastContract as any).nombre_categoria_sat;

      console.log('[Wizard] lastContract categoria_sat_id:', catIdFromDb, 'nombre_categoria_sat:', catNameFromDb);
      console.log(
        '[Wizard] allCategoriasSat count:',
        allCategoriasSat.length,
        'sample:',
        allCategoriasSat.slice(0, 3).map((c) => ({ _id: c._id, dataId: c.data?.id, name: c.name })),
      );

      // Try to find the category in the global list first by numeric ID, MongoDB ID, or Name
      let matchedCat = allCategoriasSat.find((c) => {
        const numericIdMatch = catIdFromDb != null && catIdFromDb !== '' && String(c.data?.id) === String(catIdFromDb);
        const mongoIdMatch = catIdFromDb != null && catIdFromDb !== '' && String(c._id) === String(catIdFromDb);
        const nameMatch = catNameFromDb && catNameFromDb !== 'Sin categoria' && (c.name?.toLowerCase() === catNameFromDb.toLowerCase() || c.data?.nombre?.toLowerCase() === catNameFromDb.toLowerCase());
        return numericIdMatch || mongoIdMatch || nameMatch;
      });

      // Fallback: If not found, try to look up in the current Role Frame's categories
      if (!matchedCat) {
        const foundRF = allRoleFrames.find((rf) => rf.name === lastProject?.nombre_rol_frame);
        const rfCats = foundRF?.data?.categoriasSat || [];
        const matchedInRF = rfCats.find((c: any) => {
          const numericIdMatch = catIdFromDb != null && catIdFromDb !== '' && String(c.id) === String(catIdFromDb);
          const nameMatch = catNameFromDb && catNameFromDb !== 'Sin categoria' && c.nombre?.toLowerCase() === catNameFromDb.toLowerCase();
          return numericIdMatch || nameMatch;
        });

        if (matchedInRF) {
          // Find global category matching that name
          matchedCat = allCategoriasSat.find((c) => c.name?.toLowerCase() === matchedInRF.nombre?.toLowerCase() || c.data?.nombre?.toLowerCase() === matchedInRF.nombre?.toLowerCase());
        }
      }

      if (matchedCat) {
        initialCatId = String(matchedCat.data?.id ?? matchedCat._id);
        console.log('[Wizard] Matched cat:', matchedCat.name, '-> initialCatId:', initialCatId);
      } else {
        console.log('[Wizard] No matched cat found. catIdFromDb:', catIdFromDb, 'catNameFromDb:', catNameFromDb);
        // Last resort: if we have a numeric catIdFromDb, just use it directly
        if (catIdFromDb != null && catIdFromDb !== '' && catIdFromDb !== 0) {
          initialCatId = String(catIdFromDb);
          console.log('[Wizard] Using catIdFromDb directly as initialCatId:', initialCatId);
        }
      }
    }

    // Secondary Fallbacks: User Metadata
    if (!initialCatId && user.metadata?.categoriaSatId) {
      initialCatId = String(user.metadata.categoriaSatId);
    } else if (!initialCatId && (user.metadata as any)?.categoria_sat_id) {
      initialCatId = String((user.metadata as any).categoria_sat_id);
    }

    console.log('[Wizard] FINAL initialCatId:', initialCatId);

    let initialTipoContratoId = lastContract?.tipo_contrato_id ? String(lastContract.tipo_contrato_id) : '';
    if (!initialTipoContratoId && lastContract?.nombre_contrato) {
      initialTipoContratoId = String(allTiposContrato.find((t) => t.name === lastContract.nombre_contrato)?.data.id || '');
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
    const initialContratoFrameId = initialCf?._id || '';
    const initialNombreContrato = initialCf?.name || lastContract?.nombre_contrato || '';
    if (initialCf?.data?.id != null) initialTipoContratoId = String(initialCf.data.id);

    let initialEstadoId = '';
    if (lastContract) {
      const estadoIdFromDb = (lastContract as any).estado_id;
      const estadoNameFromDb = (lastContract as any).nombre_estado_empleado;
      console.log('[Wizard] lastContract estado_id:', estadoIdFromDb, 'nombre_estado_empleado:', estadoNameFromDb);
      console.log(
        '[Wizard] allEstados count:',
        allEstados.length,
        'sample:',
        allEstados.slice(0, 3).map((e) => ({ _id: e._id, dataId: e.data?.id, name: e.name })),
      );

      // Match by numeric ID first
      if (estadoIdFromDb != null && estadoIdFromDb !== '' && estadoIdFromDb !== 0) {
        const matchedEstado = allEstados.find((e) => String(e.data?.id) === String(estadoIdFromDb) || String(e._id) === String(estadoIdFromDb));
        if (matchedEstado) {
          initialEstadoId = String(matchedEstado.data?.id ?? matchedEstado._id);
          console.log('[Wizard] Matched estado by ID:', matchedEstado.name, '-> initialEstadoId:', initialEstadoId);
        } else {
          // Use the numeric ID directly as fallback
          initialEstadoId = String(estadoIdFromDb);
          console.log('[Wizard] Using estadoIdFromDb directly:', initialEstadoId);
        }
      }
      // Match by name as fallback
      if (!initialEstadoId && estadoNameFromDb && estadoNameFromDb !== 'Activo') {
        const matchedEstado = allEstados.find((e) => e.name?.toLowerCase() === estadoNameFromDb.toLowerCase());
        if (matchedEstado) {
          initialEstadoId = String(matchedEstado.data?.id ?? matchedEstado._id);
          console.log('[Wizard] Matched estado by name:', matchedEstado.name, '-> initialEstadoId:', initialEstadoId);
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
      initialEstadoId = String(activoEstado?.data?.id || '');
    }
    console.log('[Wizard] FINAL initialEstadoId:', initialEstadoId);

    let initialSedeId = lastContract?.sede_id ? String(lastContract.sede_id) : project?.metadata?.sedeId ? String(project.metadata.sedeId) : '';
    if (!initialSedeId && lastContract?.nombre_sede) {
      const foundSede = allSedes.find((s) => s.name === lastContract.nombre_sede);
      if (foundSede) initialSedeId = String(foundSede.data.id);
    }
    if (!initialSedeId && (user.metadata as any)?.sedeId) {
      initialSedeId = String((user.metadata as any).sedeId);
    }

    let initialRolFrameId = lastContract?.rol_frame_id ? String(lastContract.rol_frame_id) : '';
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

    // Map existing assignments to the wizard format, ensuring we use string IDs
    const areaShiftAssignments = (existingAssignments || []).map((a: any) => ({
      areaId: String(a.areaId?._id || a.areaId || ''),
      shiftIds: (a.shiftIds || []).map((s: any) => String(s?._id || s)),
    }));

    setSelectedUserForWizard(user);
    setWizardStep(1);
    setHerenciaReemplazo(null); // el aviso de herencia es por cada vez que se elige a quién reemplaza

    // Aseguramos tener la lista de empresas para poblar los selects de Empresa del Contrato / Release.
    if (companies.length === 0) {
      companiesAPI
        .list()
        .then(setCompanies)
        .catch(() => {});
    }

    // Helper for date formatting
    const formatDate = (dateStr: any) => {
      if (!dateStr) return '';
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
      } catch {
        return '';
      }
    };

    // Horario de la solicitud (metadata.schedule = "HH:MM - HH:MM") como fallback cuando no hay contrato
    // previo (p.ej. al aprobar una solicitud desde el wizard).
    const metaSchedule = String((user.metadata as any)?.schedule || '');
    const [metaHoraInicio, metaHoraFin] = metaSchedule.includes('-') ? metaSchedule.split('-').map((s) => s.trim()) : ['', ''];

    // Reset wizard data with pulled data or defaults
    setWizardData({
      rol_frame_id: initialRolFrameId,
      categoria_sat_id: initialCatId,
      contrato_frame_id: initialContratoFrameId,
      nombre_contrato: initialNombreContrato,
      tipo_contrato_id: initialTipoContratoId,
      estado_id: initialEstadoId,
      empresaContratoId: lastContract?.empresaContratoId ? String(lastContract.empresaContratoId) : '',
      empresaReleaseId: lastContract?.empresaReleaseId ? String(lastContract.empresaReleaseId) : '',
      hora_inicio: lastContract?.hora_inicio || metaHoraInicio || '09:00',
      hora_fin: lastContract?.hora_fin || metaHoraFin || '18:00',
      fecha_alta_contrato: formatDate(lastContract?.fecha_alta_contrato) || formatDate(new Date()),
      fecha_baja_contrato: formatDate(lastContract?.fecha_baja_contrato),
      cantidad_jornadas_laborales: lastContract?.cantidad_jornadas_laborales || 5,
      sueldo_jornada: lastContract?.sueldo_jornada || 0,
      sueldo_mano: lastContract?.sueldo_mano || 0,
      sueldo_mano_texto: lastContract?.sueldo_mano_texto || '',
      sueldo_diario_neto: lastContract?.sueldo_diario_neto || 0,
      diferencia_diaria_neto: lastContract?.diferencia_diaria_neto || 0,
      sueldo_neto: lastContract?.sueldo_neto || 0,
      sueldo_bruto: lastContract?.sueldo_bruto || 0,
      sede_id: initialSedeId,
      reemplazo: lastContract?.reemplazo || false,
      empleado_id_reemplezado: lastContract?.empleado_id_reemplezado || '',
      observaciones: lastContract?.observaciones || '',
      areaShiftAssignments: areaShiftAssignments,
      positionId: lastContract?.positionId || '',
      levelId: lastContract?.levelId || '',
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

  const handleSaveWizard = async () => {
    if (!selectedUserForWizard || !project) return;

    // Validate area/shift assignment is required
    if (!wizardData.areaShiftAssignments || wizardData.areaShiftAssignments.length === 0) {
      sweetAlert.error('Campo requerido', 'Debes seleccionar al menos un área y turno para el miembro.');
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
      const primaryShiftId = firstAssignment?.shiftIds?.[0] || '';
      const primaryAreaId = firstAssignment?.areaId || '';

      // Los contratos de tiempo indeterminado no llevan fecha de baja
      const cfSel = contratoFrames.find((c) => c._id === wizardData.contrato_frame_id);
      const esTiempoIndeterminado = cfSel ? (cfSel.data?.esTiempoIndeterminado ?? /indetermin/i.test(cfSel.name)) : false;

      // El rol frame se toma de `roles_frame`; el backend no lo resuelve desde `infos`, así que
      // mandamos el nombre elegido para que no quede "Sin rol frame".
      const rfSel = allRoleFrames.find((rf) => String(rf.data?.rol?.id) === String(wizardData.rol_frame_id));

      await projectsAPI.assignMember(project._id, {
        userId: selectedUserForWizard._id,
        isUpdate: isExistingMember,
        // Si se está editando un contrato puntual, el backend actualiza ESE índice (no el último).
        contractIndex: editingContractIndex ?? undefined,
        // Si el wizard se abrió para aprobar una solicitud, el backend la marca aprobada.
        approveSolicitud: approvingSolicitudId ? true : undefined,
        contract: {
          ...wizardData,
          fecha_baja_contrato: esTiempoIndeterminado ? '' : wizardData.fecha_baja_contrato,
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
          nombre_rol_frame: rfSel?.name || '',
          rol_frame_id: Number(wizardData.rol_frame_id),
          empleado_id_reemplezado: wizardData.empleado_id_reemplezado ? Number(wizardData.empleado_id_reemplezado) : null,
          // Enviar null (no "") para que Mongoose no falle al castear a ObjectId cuando no se elige empresa.
          empresaContratoId: wizardData.empresaContratoId || null,
          empresaReleaseId: wizardData.empresaReleaseId || null,
        },
      });

      const wasApproving = !!approvingSolicitudId;
      const nombre = selectedUserForWizard.metadata?.fullName || selectedUserForWizard.firstName || 'El usuario';
      sweetAlert.success(wasApproving ? 'Solicitud Aprobada' : isExistingMember ? 'Miembro Actualizado' : 'Miembro Agregado', `${nombre} ha sido ${wasApproving ? 'aprobado e incorporado al equipo' : isExistingMember ? 'actualizado' : 'incorporado al equipo'}.`);

      // Refresh Data
      const updatedProject = await projectsAPI.getProject(project._id);
      setProject(updatedProject);
      setTeamConfig(updatedProject.teamConfig || []);

      await fetchFullTeamLite();
      fetchTeamPage(teamPage);

      // Si se aprobó una solicitud, refrescar la pestaña Solicitudes y su contador.
      if (wasApproving) {
        setSolicitudesRefresh((x) => x + 1);
        try {
          const solis = await usersAPI.listSolicitudes();
          setSolicitudesCount(solis.filter((u) => u.metadata?.projectIds?.includes(projectId!)).length);
        } catch {
          /* noop */
        }
      }
      setApprovingSolicitudId(null);

      setSelectedUserForWizard(null);
      setShowAddModal(false);
    } catch (error: any) {
      console.error('Assign member error:', error);
      let errorMsg = 'Internal server error during assignment';
      if (error.response?.data?.error) {
        errorMsg = error.response.data.error;
        if (error.response?.data?.details) {
          errorMsg += `\nDetalles: ${error.response.data.details}`;
        }
      }
      sweetAlert.error('Error', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!project) return;
    const result = await sweetAlert.confirm('¿Retirar del equipo?', 'El usuario será retirado del proyecto y se eliminarán sus asignaciones de áreas y turnos.');
    if (!result.isConfirmed) return;

    try {
      setLoading(true);

      // Use the new thorough removal endpoint
      await projectsAPI.removeMember(project._id, userId);

      // Refresh local state (equipo liviano + página actual, no todo el tenant → evita OOM)
      const updatedProject = await projectsAPI.getProject(project._id);
      setProject(updatedProject);
      setTeamConfig(updatedProject.teamConfig || []);
      await fetchFullTeamLite();
      fetchTeamPage(teamPage);

      sweetAlert.success('Usuario Retirado', 'El usuario ha sido retirado del equipo y sus asignaciones han sido limpiadas.');
    } catch (error: any) {
      console.error('Error removing user:', error);
      sweetAlert.error('Error', error.response?.data?.error || 'No se pudo retirar al usuario.');
    } finally {
      setLoading(false);
    }
  };

  /* --------------------------------View ---------------------------------- */

  if (!project && !loading) {
    return <EmptyState icon={faBriefcase} title="Proyecto no encontrado" description="El proyecto no existe o no tienes acceso." action={{ label: 'volver', onClick: () => navigate(-1) }} />;
  }

  // Combinaciones "areaId::shiftId" asignadas al miembro (config del equipo + coordinaciones).
  const getUserAreaShiftKeys = (user: User): Set<string> => {
    const keys = new Set<string>();
    const config = teamConfig.find((c) => String(c.userId) === String(user._id));
    (config?.areaShiftAssignments || []).forEach((asa: any) => {
      const aId = typeof asa.areaId === 'object' ? asa.areaId?._id : asa.areaId;
      if (!aId) return;
      (asa.shiftIds || []).forEach((sid: any) => {
        const sId = typeof sid === 'object' ? sid?._id : sid;
        if (sId) keys.add(`${aId}::${sId}`);
      });
    });
    if (checkIsCoordinator(user)) {
      (project?.coordinatorAssignments || []).forEach((asm: any) => {
        const uid = typeof asm.userId === 'object' ? asm.userId?._id : asm.userId;
        if (String(uid) !== String(user._id)) return;
        const aId = typeof asm.areaId === 'object' ? asm.areaId?._id : asm.areaId;
        const sId = typeof asm.shiftId === 'object' ? asm.shiftId?._id : asm.shiftId;
        if (aId && sId) keys.add(`${aId}::${sId}`);
      });
    }
    return keys;
  };

  // Último contrato del empleado en ESTE proyecto (mismo criterio que la columna Contrato).
  const getActiveContract = (user: User): any => {
    const projectMeta = user.metadata?.projects?.find((p: any) => {
      const pId = p.projectId;
      const idToCheck = typeof pId === 'object' ? (pId as any)?._id : pId;
      return String(idToCheck) === String(projectId);
    });
    return projectMeta?.contracts?.length ? projectMeta.contracts[projectMeta.contracts.length - 1] : null;
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
      areaId: String(a.areaId?._id || a.areaId || ''),
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
    const replacedName = `${replaced.firstName || ''} ${replaced.lastName || ''}`.trim() || replaced.email;
    const isCoordinadorRole = (selectedUserForWizard?.roles || []).some((r: any) => r.name.toLowerCase().includes('mobile-coordinador'));

    const assignments = getMemberAssignments(replaced._id)
      .map((a) => {
        const areaConfig = (project?.areasConfig || []).find((c: any) => String(typeof c.areaId === 'object' ? c.areaId?._id : c.areaId) === a.areaId);
        if (!areaConfig) return null;
        const areaObj = allAreas.find((ar) => String(ar._id) === a.areaId);
        if (areaObj?.isSystem && !isCoordinadorRole) return null;
        const allowedShiftIds = ((areaConfig as any).shiftIds || []).map((s: any) => String(typeof s === 'object' ? s._id : s));
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
        detalle:
          origen.length === 0
            ? 'Esa persona no tiene área ni turno cargados en el proyecto. Elegí el área y el turno abajo.'
            : 'Su área o sus turnos ya no están disponibles en la configuración del proyecto. Elegí el área y el turno abajo.',
      });
      return;
    }

    const detalle = assignments
      .map((a) => {
        const areaName = allAreas.find((ar) => String(ar._id) === a.areaId)?.name || a.areaId;
        const turnos = a.shiftIds.map((s) => allShifts.find((sh) => String(sh._id) === s)?.name || s).join(', ');
        return `${areaName} (${turnos})`;
      })
      .join(' + ');

    setWizardData((prev) => ({ ...prev, areaShiftAssignments: assignments }));
    setHerenciaReemplazo({ ok: true, replacedName, detalle });
  };

  // Render function for Table Row
  const renderUserRow = (user: User) => {
    const userConfig = teamConfig.find((c) => c.userId === user._id);
    const projectMeta = user.metadata?.projects?.find((p: any) => {
      const pId = p.projectId;
      const idToCheck = typeof pId === 'object' ? (pId as any)?._id : pId;
      return String(idToCheck) === String(projectId);
    });
    const rolFrame = projectMeta?.nombre_rol_frame || (user.externalInfo?.rolFrames?.length ? user.externalInfo.rolFrames[0] : '-');
    const activeContract = projectMeta?.contracts?.length ? projectMeta.contracts[projectMeta.contracts.length - 1] : null;

    return (
      <tr key={user._id} onClick={() => handleOpenMemberDetail(user)} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer">
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center shrink-0">
              <FontAwesomeIcon icon={faUser} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}` : user.email}</p>
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
                    return <span className="w-fit text-[10px] px-2 py-0.5 rounded font-medium border whitespace-nowrap border-green-500/30 text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400">Responsable de Proyecto</span>;
                  }
                  return null;
                })()}
              </div>
            </div>
          </div>
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
              const filteredRoles = user.roles.filter((r) => !r.name.toLowerCase().includes('responsable'));

              return (
                <>
                  {filteredRoles.slice(0, 3).map((r) => {
                    const lower = r.name.toLowerCase();
                    const isCoordinador = lower.includes('coordinador');

                    let badgeClasses = 'border-blue-500/30 text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400';
                    if (isCoordinador) {
                      badgeClasses = 'border-amber-500/30 text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400';
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
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${user.metadata?.activo ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>{user.metadata?.activo ? 'ACTIVO' : 'INACTIVO'}</span>
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
                  const aId = typeof asa.areaId === 'object' ? asa.areaId?._id : asa.areaId;
                  const aName = typeof asa.areaId === 'object' ? asa.areaId?.name : allAreas.find((a) => String(a._id) === String(aId) || String(a.data?.id) === String(aId))?.name;
                  return aName ? { id: String(aId), name: aName } : null;
                })
                .filter(Boolean) as { id: string; name: string }[];
            }

            // 1b. Alternative: Check last contract in projects metadata (backup source)
            if (areaData.length === 0 && activeContract?.areaShiftAssignments && activeContract.areaShiftAssignments.length > 0) {
              areaData = activeContract.areaShiftAssignments
                .map((asa: any) => {
                  const aId = typeof asa.areaId === 'object' ? asa.areaId?._id : asa.areaId;
                  const aName = typeof asa.areaId === 'object' ? asa.areaId?.name : allAreas.find((a) => String(a._id) === String(aId))?.name;
                  return aName ? { id: String(aId), name: aName } : null;
                })
                .filter(Boolean) as { id: string; name: string }[];
            }
            // 2. Secondary: If coordinator and no detailed config, check coordinatorAssignments
            if (areaData.length === 0 && isCoord && project?.coordinatorAssignments) {
              const myAssignments = project.coordinatorAssignments.filter((asm) => {
                const uid = typeof asm.userId === 'object' ? asm.userId?._id : asm.userId;
                return String(uid) === String(user._id);
              });
              const areaIds = Array.from(new Set(myAssignments.map((asm) => (typeof asm.areaId === 'object' ? asm.areaId?._id : asm.areaId))));
              areaData = areaIds
                .map((id) => {
                  const a = allAreas.find((area) => String(area._id) === String(id));
                  return a ? { id: String(a._id), name: a.name } : null;
                })
                .filter(Boolean) as { id: string; name: string }[];
            }

            // 3. Fallback: Global user area (legacy/basic)
            if (areaData.length === 0) {
              const userAreaId = typeof user.areaId === 'object' ? user.areaId?._id : user.areaId;
              const userAreaName = typeof user.areaId === 'object' ? user.areaId?.name : allAreas.find((a) => String(a._id) === String(userAreaId))?.name;
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
                            setViewingShiftsData({ user, areaId: ad.id, areaName: ad.name, assignmentType: 'standard' });
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
                const uid = typeof asm.userId === 'object' ? (asm.userId as any)?._id : asm.userId;
                return String(uid) === String(user._id);
              }) || [];

            if (myCoordinatedAssignments.length === 0) return <span className="text-xs text-gray-400">—</span>;

            const coordAreaDataMap = new Map<string, { id: string; name: string }>();
            myCoordinatedAssignments.forEach((asm) => {
              const aid = typeof asm.areaId === 'object' ? (asm.areaId as any)?._id : asm.areaId;
              const aName = typeof asm.areaId === 'object' ? (asm.areaId as any)?.name : allAreas.find((a) => String(a._id) === String(aid))?.name;
              if (aid && aName) {
                coordAreaDataMap.set(String(aid), { id: String(aid), name: aName });
              }
            });

            const coordAreaData = Array.from(coordAreaDataMap.values());

            return (
              <div className="flex flex-wrap items-center gap-1.5">
                {coordAreaData.map((ad, i) => {
                  const shifts = getCoordinatedShifts(user, ad.id);
                  return (
                    <div key={i} className="flex flex-col gap-1">
                      <div className="group relative flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 pl-2 pr-1 py-1 rounded-lg border border-amber-100 dark:border-amber-800 hover:border-amber-300 dark:hover:border-amber-600 transition-all w-fit">
                        <span className="text-amber-700 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest whitespace-nowrap">{ad.name}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingShiftsData({ user, areaId: ad.id, areaName: ad.name, assignmentType: 'coordinated' });
                          }}
                          className="flex items-center justify-center w-4 h-4 rounded-md text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors text-xs font-black"
                          title="Ver turnos coordinados"
                        >
                          +
                        </button>
                      </div>
                      {shifts.length > 0 && (
                        <div className="flex flex-col gap-1 mt-0.5 pl-0.5">
                          {shifts.map((s, idx) => {
                            const coordinados = getAreaShiftPeopleCount(ad.id, String(s._id));
                            return (
                              <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50/50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-100/50 dark:border-amber-900/40 whitespace-nowrap w-fit" title={`${s.startTime} - ${s.endTime}`}>
                                {s.name} ({s.startTime} - {s.endTime})
                                <span className="font-black text-amber-800 dark:text-amber-300" title={`${coordinados} persona${coordinados === 1 ? '' : 's'} en ${ad.name} / ${s.name}`}>
                                  ({coordinados})
                                </span>
                              </span>
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
        <td className="px-4 py-3">
          <span className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300" title="Ver contratos para descargar">
            <FontAwesomeIcon icon={faFileContract} className="h-3 w-3 text-blue-500 dark:text-blue-400 shrink-0" />
            {activeContract?.nombre_contrato || '-'}
          </span>
        </td>
        {/* Estado del contrato (Pedido servicios, Disponible, ...) — distinto del estado del usuario. */}
        <td className="px-4 py-3">
          {activeContract?.nombre_estado_empleado ? <EstadoBadge name={activeContract.nombre_estado_empleado} className="text-[10px] whitespace-nowrap" /> : <span className="text-xs text-gray-400">—</span>}
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
        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
          {activeContract ? (
            <div className="flex flex-col gap-1">
              {(() => {
                const vigente = isContractVigente(activeContract.fecha_baja_contrato);
                return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold w-fit ${vigente ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>{vigente ? 'VIGENTE' : 'NO VIGENTE'}</span>;
              })()}
              <div className="flex flex-col gap-0.5">
                <span>
                  <span className="text-gray-400">Alta:</span> {formatContractDate(activeContract.fecha_alta_contrato)}
                </span>
                <span>
                  <span className="text-gray-400">Baja:</span> {activeContract.fecha_baja_contrato ? formatContractDate(activeContract.fecha_baja_contrato) : '—'}
                </span>
              </div>
            </div>
          ) : (
            '—'
          )}
        </td>
        {/* Monto / Jornadas del contrato vigente (mismo formato que la tabla de Contratos). */}
        <td className="px-4 py-3 text-right whitespace-nowrap">
          {activeContract?.sueldo_mano != null ? (
            <>
              <div className="text-sm font-bold text-primary-600 dark:text-primary-400">${Number(activeContract.sueldo_mano).toLocaleString('es-AR')}</div>
              {activeContract?.cantidad_jornadas_laborales ? <div className="text-xs text-gray-400">{activeContract.cantidad_jornadas_laborales} jor.</div> : null}
            </>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 font-medium whitespace-nowrap">{activeContract?.hora_inicio ? `${activeContract.hora_inicio} - ${activeContract.hora_fin}` : '-'}</td>
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
            title: 'Editar Horario',
            onClick: () => handleOpenScheduleModal(user),
          },
          {
            icon: faTrash,
            title: 'Retirar del equipo',
            onClick: () => handleRemoveUser(user._id),
            className: 'text-red-500 hover:text-red-700',
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
      badge={project ? { text: project.name, variant: 'default' } : undefined}
      badgeSecondary={sedeName ? { text: sedeName, variant: 'default' } : undefined}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry?.title || 'Información',
        content: helpEntry?.content,
      }}
      modal={
        openCoordinadoresInfo
          ? {
              isOpen: true,
              onClose: () => setOpenCoordinadoresInfo(false),
              title: 'Asignación de Coordinadores',
              content: <p className="text-gray-600 dark:text-gray-300">Asigna un coordinador designado para cada combinación de Área y Turno del proyecto. Todas las combinaciones deben estar cubiertas.</p>,
            }
          : undefined
      }
      headerActions={
        <button onClick={() => setShowAddModal(true)} title="Agregar miembro" aria-label="Agregar miembro" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
          <FontAwesomeIcon icon={faPlus} />
        </button>
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
              <button onClick={() => setActiveTab('equipo')} className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'equipo' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                <FontAwesomeIcon icon={faUsers} className="text-xs" />
                Equipo
              </button>
              <button onClick={() => setActiveTab('coordinadores')} className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'coordinadores' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                <FontAwesomeIcon icon={faUserTie} className="text-xs" />
                Coordinadores
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenCoordinadoresInfo(true);
                  }}
                  className={`ml-1.5 text-gray-400 hover:text-blue-500 transition-colors cursor-pointer ${activeTab === 'coordinadores' ? 'text-blue-400' : ''}`}
                  title="Información de asignación"
                >
                  <FontAwesomeIcon icon={faInfoCircle} className="h-3.5 w-3.5" />
                </span>
              </button>
              <button onClick={() => setActiveTab('solicitudes')} className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'solicitudes' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
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
            {activeTab === 'equipo' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 items-start justify-between">
                  <div className="flex-1 w-full">
                    <SearchAndFilters
                      searchTerm={searchTermTeam}
                      onSearchChange={setSearchTermTeam}
                      searchPlaceholder="Buscar en equipo actual..."
                      radioFilters={[
                        {
                          label: 'Estado de usuarios',
                          value: filterUserStatus,
                          onChange: setFilterUserStatus,
                          options: [
                            { label: 'Usuarios Activos', value: 'active' },
                            { label: 'Usuarios Inactivos', value: 'inactive' },
                            { label: 'Todos los usuarios', value: '' },
                          ],
                        },
                        {
                          label: 'Contratos',
                          value: filterVigencia,
                          onChange: setFilterVigencia,
                          options: [
                            { label: 'Vigentes', value: 'vigente' },
                            { label: 'No Vigentes', value: 'novigente' },
                            { label: 'Todos los contratos', value: '' },
                          ],
                        },
                      ]}
                      selectFilters={[
                        {
                          label: 'Rol/es',
                          value: filterRolMobile,
                          onChange: setFilterRolMobile,
                          placeholder: 'Todos los roles',
                          options: MOBILE_ROLE_OPTIONS,
                        },
                        {
                          label: 'Tipo de contrato',
                          value: filterTipoContrato,
                          onChange: setFilterTipoContrato,
                          placeholder: 'Todos los tipos',
                          options: contratoFrames.map((cf) => ({ value: cf.name, label: cf.name })),
                        },
                        {
                          label: 'Área / Turno',
                          value: filterAreaTurno,
                          onChange: setFilterAreaTurno,
                          placeholder: 'Todas las áreas/turnos',
                          options: [{ value: '__none__', label: 'Sin área/turno' }, ...areaTurnoOptions],
                        },
                        {
                          label: 'Estado de contrato',
                          value: filterEstadoContrato,
                          onChange: setFilterEstadoContrato,
                          placeholder: 'Todos los estados',
                          options: estadoContratoOptions,
                          renderOption: (opt) => <EstadoBadge name={opt.label} />,
                        },
                      ]}
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setViewMode('cards')} className={`px-3 py-2 rounded-md transition-all border dark:border-gray-700 ${effectiveViewMode === 'cards' ? 'bg-blue-500 text-white shadow-sm border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="Vista de tarjetas">
                      <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
                    </button>
                    <button onClick={() => setViewMode('table')} className={`px-3 py-2 rounded-md transition-all border dark:border-gray-700 ${effectiveViewMode === 'table' ? 'bg-blue-500 text-white shadow-sm border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="Vista de tabla">
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
                    <p className="text-red-700 dark:text-red-500 text-xs leading-normal">
                      La asignación por área y turno es obligatoria: hasta que el proyecto tenga al menos un área, no vas a poder
                      configurar ni editar a los miembros del equipo.
                    </p>
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => navigate(`/projects/${projectId}`, { state: { openEdit: true } })}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400 hover:underline"
                        title="Ir a Editar Proyecto para agregar áreas"
                      >
                        <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3" />
                        Editar proyecto para agregar áreas
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowSinAreasInfo(true)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700/80 dark:text-red-400/80 hover:underline"
                        title="Qué implica que el proyecto no tenga áreas"
                      >
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
                      Usted debe asignar al equipo un usuario con el role de sistema <strong>"mobile coordinador"</strong> para poder asignarlo.
                    </p>
                  </div>
                )}

                {(() => {
                  // Filtros client-side sobre la página cargada (contrato + área/turno).
                  // El filtro de Rol/es NO va acá: se resuelve server-side para que la paginación
                  // muestre los resultados correlativos (ver fetchTeamPage → roleName).
                  const rows =
                    filterVigencia || filterTipoContrato || filterAreaTurno || filterEstadoContrato
                      ? teamRows.filter((u) => {
                          const ac = getActiveContract(u);
                          if (filterVigencia) {
                            const vig = isContractVigente(ac?.fecha_baja_contrato);
                            if (filterVigencia === 'vigente' ? !vig : vig) return false;
                          }
                          if (filterTipoContrato) {
                            if (String(ac?.nombre_contrato ?? '') !== String(filterTipoContrato)) return false;
                          }
                          if (filterEstadoContrato) {
                            if (estadoLabel(String(ac?.nombre_estado_empleado ?? '')) !== filterEstadoContrato) return false;
                          }
                          if (filterAreaTurno) {
                            const keys = getUserAreaShiftKeys(u);
                            if (filterAreaTurno === '__none__') {
                              if (keys.size > 0) return false;
                            } else if (!keys.has(filterAreaTurno)) {
                              return false;
                            }
                          }
                          return true;
                        })
                      : teamRows;

                  // Orden alfabético tal como lo devuelve el server (sort=name).
                  if (teamTotal === 0 && !teamFetching) {
                    return (
                      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center h-64 text-gray-500">
                        <FontAwesomeIcon icon={faUsers} className="h-12 w-12 mb-4 opacity-10" />
                        <p className="text-base font-medium">{searchTermTeam || filterUserStatus || filterRolMobile ? 'No se encontraron miembros' : 'Aún no hay miembros en el equipo'}</p>
                        <p className="text-sm mt-1">{searchTermTeam || filterUserStatus || filterRolMobile ? 'Probá ajustar la búsqueda o el filtro.' : 'Usa el botón "Agregar Miembro" para comenzar.'}</p>
                      </div>
                    );
                  }

                  if (rows.length === 0) {
                    return <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center h-40 text-gray-500 text-sm">Ningún miembro coincide con los filtros en esta página.</div>;
                  }

                  return effectiveViewMode === 'table' ? (
                    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-opacity ${teamFetching ? 'opacity-60' : ''}`}>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              <th className="px-4 py-3 font-semibold">Usuario</th>
                              <th className="px-4 py-3 font-semibold text-center">Contratos</th>
                              <th className="px-4 py-3 font-semibold">Rol/es</th>
                              <th className="px-4 py-3 font-semibold">Rol/es Frame</th>
                              <th className="px-4 py-3 font-semibold">Estado</th>
                              <th className="px-4 py-3 font-semibold">Área / Turno</th>
                              <th className="px-4 py-3 font-semibold text-amber-600 dark:text-amber-400">
                                <span className="inline-flex items-center gap-1.5">
                                  Área/Turno Coordinada
                                  <button
                                    type="button"
                                    onClick={() => setOpenCoordCountInfo(true)}
                                    className="text-amber-500/70 hover:text-amber-500 transition-colors"
                                    title="Qué significa el número entre paréntesis"
                                    aria-label="Información del número de personas coordinadas"
                                  >
                                    <FontAwesomeIcon icon={faInfoCircle} className="h-3.5 w-3.5" />
                                  </button>
                                </span>
                              </th>
                              <th className="px-4 py-3 font-semibold">Contrato</th>
                              <th className="px-4 py-3 font-semibold whitespace-nowrap">Estado Contrato</th>
                              <th className="px-4 py-3 font-semibold">Reemplazo</th>
                              <th className="px-4 py-3 font-semibold whitespace-nowrap">Alta / Baja</th>
                              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Monto / Jorn.</th>
                              <th className="px-4 py-3 font-semibold">Horario</th>
                              <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">{rows.map((u) => renderUserRow(u))}</tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 transition-opacity ${teamFetching ? 'opacity-60' : ''}`}>{rows.map((u) => renderUserCard(u))}</div>
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
                              <button key={p} onClick={() => setTeamPage(p)} className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${teamPage === p ? 'bg-primary-600 border-primary-600 text-white z-10' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
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

            {activeTab === 'coordinadores' && project && (
              <TeamCoordinadoresTab
                projectId={projectId!}
                project={project}
                allUsers={allUsers}
                teamMembers={teamMembers}
                onGoToTeam={() => setActiveTab('equipo')}
                onUpdated={async () => {
                  const updatedProject = await projectsAPI.getProject(projectId!);
                  setProject(updatedProject);
                  setTeamConfig(updatedProject.teamConfig || []);
                }}
              />
            )}

            {activeTab === 'solicitudes' && project && <TeamSolicitudesTab projectId={projectId!} project={project} refreshSignal={solicitudesRefresh} onApprove={(u) => handleOpenWizard(u._id, undefined, undefined, u._id)} />}
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
                  <button onClick={() => setShowFilters(true)} className={`relative px-4 py-2 rounded-lg border transition-all flex items-center gap-2 text-sm font-medium ${activeAddFiltersCount > 0 ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>
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
                        <button onClick={() => setFilterRole('')} className="hover:text-blue-900 dark:hover:text-blue-100 transition-colors">
                          <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
                        </button>
                      </span>
                    )}
                    {filterRoleFrame && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                        <span className="opacity-60">Role Frame:</span> {filterRoleFrame}
                        <button onClick={() => setFilterRoleFrame('')} className="hover:text-purple-900 dark:hover:text-purple-100 transition-colors">
                          <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
                        </button>
                      </span>
                    )}
                    {filterProject && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
                        <span className="opacity-60">Proyecto:</span> {filterProject}
                        <button onClick={() => setFilterProject('')} className="hover:text-green-900 dark:hover:text-green-100 transition-colors">
                          <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
                        </button>
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setFilterRole('');
                        setFilterRoleFrame('');
                        setFilterProject('');
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
                            {searchTerm ? `No se encontraron usuarios para "${searchTerm}"` : 'No hay usuarios disponibles para asignar'}
                          </td>
                        </tr>
                      ) : (
                        filteredCandidates.map((user) => {
                          const isCoordinator = checkIsCoordinator(user);
                          const metadataProjects = user.metadata?.projects || [];
                          // Role frames desde contratos/proyectos (unificados por el backend) + los propios del usuario (metadata.roles_frame)
                          const ownRolFrameNames = (((user.metadata as any)?.rolesFrameIds || (user.metadata as any)?.roles_frame || []) as any[]).map((rf: any) => (typeof rf === 'object' ? rf?.name : allRoleFrames.find((i) => i._id === rf)?.name)).filter(Boolean) as string[];
                          const rolFrames = Array.from(new Set([...(user.externalInfo?.rolFrames || []), ...ownRolFrameNames])).filter(Boolean);
                          const activeProjects = Array.from(new Set(metadataProjects.map((p) => p.nombre_proyecto))).filter(Boolean);

                          return (
                            <tr key={user._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}` : user.email}</span>
                                  <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[180px]">{user.email}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1 max-w-[150px]">
                                  {(user.roles || []).map((r) => {
                                    const lower = r.name.toLowerCase();
                                    const isCoord = lower.includes('coordinador');
                                    const isResp = lower.includes('responsable');

                                    let classes = 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-100 dark:border-blue-800';
                                    if (isCoord) {
                                      classes = 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800';
                                    } else if (isResp) {
                                      classes = 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800';
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
                                      <div key={typeof t === 'string' ? t : t._id} className="flex flex-col gap-0.5">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700 uppercase w-fit">{typeof t === 'object' ? t.name : 'Turno'}</span>
                                        {typeof t === 'object' && t.startTime && t.endTime && (
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
                    setFilterRole('');
                    setFilterRoleFrame('');
                    setFilterProject('');
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
                    Tienes <strong>{activeAddFiltersCount}</strong> filtro{activeAddFiltersCount > 1 ? 's' : ''} aplicado{activeAddFiltersCount > 1 ? 's' : ''}.
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
            title={`Turnos ${viewingShiftsData?.assignmentType === 'coordinated' ? 'Coordinados' : 'Asignados'} - ${viewingShiftsData?.areaName}`}
            subtitle={
              viewingShiftsData ? (
                <p className="text-lg font-black text-blue-600 dark:text-blue-400 mt-1 uppercase tracking-tight">
                  {viewingShiftsData.user.firstName} {viewingShiftsData.user.lastName}
                </p>
              ) : (
                ''
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
                      const uid = typeof asm.userId === 'object' ? (asm.userId as any)?._id : asm.userId;
                      const aid = typeof asm.areaId === 'object' ? (asm.areaId as any)?._id : asm.areaId;
                      return String(uid) === String(user._id) && String(aid) === String(areaId);
                    })
                    .map((asm) => (typeof asm.shiftId === 'object' ? (asm.shiftId as any)?._id : asm.shiftId));
                };

                const coordShiftIds = getCoordinatedShiftIds();

                // 1. If viewing coordinated, check ONLY coordinatorAssignments
                if (assignmentType === 'coordinated') {
                  if (project?.coordinatorAssignments) {
                    const myCoordAsgn = project.coordinatorAssignments.filter((asm) => {
                      const uid = typeof asm.userId === 'object' ? (asm.userId as any)?._id : asm.userId;
                      const aid = typeof asm.areaId === 'object' ? (asm.areaId as any)?._id : asm.areaId;
                      return String(uid) === String(user._id) && String(aid) === String(areaId);
                    });
                    myCoordAsgn.forEach((asm) => {
                      const sid = typeof asm.shiftId === 'object' ? (asm.shiftId as any)?._id : asm.shiftId;
                      const shift = allShifts.find((s) => String(s._id) === String(sid));
                      if (shift && !shifts.some((s) => String(s._id) === String(shift._id))) shifts.push(shift);
                    });
                  }
                } else {
                  // 2. If viewing standard, check team configuration assignments (Wizard) and EXCLUDE coordinated ones
                  const assignments = userConfig?.areaShiftAssignments || [];
                  const areaAssign = assignments.find((a: any) => {
                    const aid = typeof a.areaId === 'object' ? a.areaId?._id : a.areaId;
                    if (String(aid) === String(areaId)) return true;
                    const aData = allAreas.find((area) => String(area._id) === String(aid) || String(area.data?.id) === String(aid));
                    const targetName = viewingShiftsData.areaName;
                    return aData && targetName && aData.name.toLowerCase() === targetName.toLowerCase();
                  });

                  if (areaAssign) {
                    const sids = areaAssign.shiftIds || [];
                    sids.forEach((sid: any) => {
                      const actualSid = typeof sid === 'object' ? sid?._id : sid;

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
                      const idToCheck = typeof pId === 'object' ? (pId as any)?._id : pId;
                      return String(idToCheck) === String(project?._id);
                    });
                    const activeContract = projectMeta?.contracts?.length ? projectMeta.contracts[projectMeta.contracts.length - 1] : null;

                    if (activeContract?.areaShiftAssignments && activeContract.areaShiftAssignments.length > 0) {
                      const fallbackAssign = activeContract.areaShiftAssignments.find((a: any) => {
                        const aid = typeof a.areaId === 'object' ? a.areaId?._id : a.areaId;
                        if (String(aid) === String(areaId)) return true;
                        const aData = allAreas.find((area) => String(area._id) === String(aid) || String(area.data?.id) === String(aid));
                        const targetName = viewingShiftsData.areaName;
                        return aData && targetName && aData.name.toLowerCase() === targetName.toLowerCase();
                      });

                      if (fallbackAssign) {
                        const sids = fallbackAssign.shiftIds || [];
                        sids.forEach((sid: any) => {
                          const actualSid = typeof sid === 'object' ? sid?._id : sid;

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
                  const shiftIdFromUser = user.turnos && user.turnos.length > 0 ? (typeof user.turnos[0] === 'object' ? user.turnos[0]._id : user.turnos[0]) : undefined;
                  const finalShiftId = userConfig?.shiftId || shiftIdFromUser;
                  const shift = allShifts.find((sh) => String(sh._id) === String(finalShiftId));
                  if (shift) shifts = [shift];
                }

                if (shifts.length === 0) return <p className="text-center text-gray-500 py-12">No hay turnos asignados para esta área.</p>;

                return shifts.map((s, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tighter">
                        {s.name}
                        {assignmentType === 'coordinated' && <span className="ml-1.5 text-amber-600 dark:text-amber-400">({getAreaShiftPeopleCount(areaId, String(s._id))})</span>}
                      </span>
                      <span className="px-2 py-1 bg-blue-500 text-white rounded-lg text-[10px] font-black shadow-sm">
                        {s.startTime} — {s.endTime} HS
                      </span>
                    </div>
                    {s.days && s.days.length > 0 && (
                      <div className="flex gap-1.5 mt-1">
                        {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'].map((label, dIdx) => (
                          <span key={dIdx} className={`text-[10px] font-black px-2 py-1 rounded-md transition-all ${s.days.includes(dIdx) ? 'bg-white dark:bg-blue-800 text-blue-600 dark:text-blue-300 shadow-sm ring-1 ring-blue-200 dark:ring-blue-700' : 'text-gray-300 dark:text-gray-600'}`}>
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

          {/* Wizard Modal */}
          <Modal
            isOpen={!!selectedUserForWizard}
            onClose={() => setSelectedUserForWizard(null)}
            title={teamMembers.some((m) => m._id === selectedUserForWizard?._id) ? 'Configurar Miembro' : 'Agregar Miembro'}
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
                {wizardStep > 1 && (
                  <button type="button" onClick={() => setWizardStep((wizardStep - 1) as any)} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 transition-all uppercase tracking-wider">
                    ANTERIOR
                  </button>
                )}
                {wizardStep < 3 ? (
                  <button
                    type="button"
                    onClick={() => {
                      // Validate step 1: at least one area/shift must be selected
                      if (wizardStep === 1 && (!wizardData.areaShiftAssignments || wizardData.areaShiftAssignments.length === 0)) {
                        sweetAlert.error('Campo requerido', 'Debes seleccionar al menos un área y turno para el miembro.');
                        return;
                      }
                      setWizardStep((wizardStep + 1) as any);
                    }}
                    className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-bold hover:bg-blue-600 shadow-lg shadow-blue-500/20 transition-all active:scale-95 uppercase tracking-wider"
                  >
                    SIGUIENTE
                  </button>
                ) : (
                  <button type="button" onClick={handleSaveWizard} className="flex-1 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 shadow-lg shadow-green-600/20 transition-all active:scale-95 uppercase tracking-wider">
                    GUARDAR
                  </button>
                )}
              </div>
            }
          >
            <div className="flex flex-col h-[520px]">
              {/* Stepper Header (Fixed/Sticky at the top of the flex container) */}
              <div className="bg-white dark:bg-gray-800 pb-4 border-b border-gray-100 dark:border-gray-700 shrink-0 mb-4">
                <div className="flex items-center bg-gray-50 dark:bg-gray-900/50 rounded-lg p-1">
                  {[
                    { step: 1, label: 'Contrato' },
                    { step: 2, label: 'Sueldo' },
                    { step: 3, label: 'Extras' },
                  ].map((s) => (
                    <button
                      key={s.step}
                      type="button"
                      onClick={() => {
                        if (wizardStep === 1 && s.step > 1 && (!wizardData.areaShiftAssignments || wizardData.areaShiftAssignments.length === 0)) {
                          sweetAlert.error('Campo requerido', 'Debes seleccionar al menos un área y turno para el miembro.');
                          return;
                        }
                        setWizardStep(s.step as any);
                      }}
                      className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${wizardStep === s.step ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm border border-gray-100 dark:border-gray-700' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step Content (Scrollable) */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-6">
                {/* Step 1: Contrato */}
                {wizardStep === 1 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Empleado *</label>
                      <input type="text" className="input-field w-full bg-gray-50 dark:bg-transparent" value={`${selectedUserForWizard?.firstName} ${selectedUserForWizard?.lastName}`} readOnly />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Role Frame a Desempeñar *</label>
                      <select className="input-field w-full" value={wizardData.rol_frame_id} onChange={(e) => setWizardData((prev) => ({ ...prev, rol_frame_id: e.target.value, categoria_sat_id: '' }))} required>
                        <option value="">Selecciona role frame...</option>
                        {userAssignedRoleFrames.map((rf) => (
                          <option key={rf._id} value={rf.data.rol.id}>
                            {rf.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Categoria SAT *</label>
                      <select className="input-field w-full" value={wizardData.categoria_sat_id} onChange={(e) => setWizardData((prev) => ({ ...prev, categoria_sat_id: e.target.value }))} required>
                        <option value="">Selecciona categoria...</option>
                        {availableCategoriasSat.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            Cat {c.numeroCategoria || c.id} - {c.nombre}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Tipo de contrato *</label>
                      <select
                        className="input-field w-full"
                        value={wizardData.contrato_frame_id}
                        onChange={(e) => {
                          const cf = contratoFrames.find((c) => c._id === e.target.value);
                          const esIndeterminado = cf ? (cf.data?.esTiempoIndeterminado ?? /indetermin/i.test(cf.name)) : false;
                          setWizardData((prev) => ({
                            ...prev,
                            contrato_frame_id: cf?._id || '',
                            nombre_contrato: cf?.name || '',
                            tipo_contrato_id: cf?.data?.id != null ? String(cf.data.id) : '',
                            fecha_baja_contrato: esIndeterminado ? '' : prev.fecha_baja_contrato,
                          }));
                        }}
                        required
                      >
                        <option value="">Selecciona tipo...</option>
                        {contratoFrames.map((cf) => (
                          <option key={cf._id} value={cf._id}>
                            {cf.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Estado *</label>
                      <EstadoSelect
                        options={allEstados.map((e) => ({ value: String(e.data.id), name: e.name }))}
                        value={wizardData.estado_id}
                        onChange={(v) => setWizardData((prev) => ({ ...prev, estado_id: v }))}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Empresa del Contrato</label>
                      <select className="input-field w-full" value={wizardData.empresaContratoId} onChange={(e) => setWizardData((prev) => ({ ...prev, empresaContratoId: e.target.value }))}>
                        <option value="">{contratoEmpresas.length ? 'Selecciona empresa...' : 'No hay empresas cargadas'}</option>
                        {contratoEmpresas.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Empresa del Release</label>
                      <select className="input-field w-full" value={wizardData.empresaReleaseId} onChange={(e) => setWizardData((prev) => ({ ...prev, empresaReleaseId: e.target.value }))}>
                        <option value="">{releaseEmpresas.length ? 'Selecciona empresa...' : 'No hay empresas cargadas'}</option>
                        {releaseEmpresas.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Cargo *</label>
                      <select className="input-field w-full" value={wizardData.positionId} onChange={(e) => setWizardData((prev) => ({ ...prev, positionId: e.target.value, levelId: '' }))} required>
                        <option value="">Selecciona cargo...</option>
                        {allPositions.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Nivel *</label>
                      <select className="input-field w-full" value={wizardData.levelId} onChange={(e) => setWizardData((prev) => ({ ...prev, levelId: e.target.value }))} disabled={!wizardData.positionId} required>
                        <option value="">{wizardData.positionId ? 'Selecciona nivel...' : 'Primero selecciona cargo'}</option>
                        {allLevels
                          .filter((l) => String(typeof l.positionId === 'object' ? (l.positionId as any)?._id : l.positionId) === String(wizardData.positionId))
                          .map((l) => (
                            <option key={l._id} value={l._id}>
                              {l.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Hora inicio - HH:MM</label>
                      <input type="time" className="input-field w-full opacity-60 cursor-not-allowed" value={wizardData.hora_inicio} readOnly disabled />
                      <p className="text-[10px] text-gray-400 ml-1">Se toma del contrato del empleado (independiente de los turnos).</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Hora fin - HH:MM</label>
                      <input type="time" className="input-field w-full opacity-60 cursor-not-allowed" value={wizardData.hora_fin} readOnly disabled />
                      <p className="text-[10px] text-gray-400 ml-1">Se toma del contrato del empleado (independiente de los turnos).</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Fecha alta contrato</label>
                      <input type="date" className="input-field w-full text-sm" value={wizardData.fecha_alta_contrato} onChange={(e) => setWizardData((prev) => ({ ...prev, fecha_alta_contrato: e.target.value }))} />
                    </div>

                    {!(() => {
                      const cf = contratoFrames.find((c) => c._id === wizardData.contrato_frame_id);
                      return cf ? (cf.data?.esTiempoIndeterminado ?? /indetermin/i.test(cf.name)) : false;
                    })() && (
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Fecha baja contrato</label>
                        <input type="date" className="input-field w-full text-sm" value={wizardData.fecha_baja_contrato} onChange={(e) => setWizardData((prev) => ({ ...prev, fecha_baja_contrato: e.target.value }))} />
                      </div>
                    )}

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
                            setWizardData((prev) => ({ ...prev, reemplazo: checked, empleado_id_reemplezado: checked ? prev.empleado_id_reemplezado : '' }));
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
                        <div className={`rounded-lg border p-3 text-xs ${herenciaReemplazo.ok ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'}`}>
                          <p className="font-bold flex items-center gap-2">
                            <FontAwesomeIcon icon={herenciaReemplazo.ok ? faInfoCircle : faTriangleExclamation} />
                            {herenciaReemplazo.ok ? `Área y turno heredados de ${herenciaReemplazo.replacedName}` : `No se pudo heredar el área de ${herenciaReemplazo.replacedName}`}
                          </p>
                          <p className="mt-1 leading-normal">
                            {herenciaReemplazo.ok ? (
                              <>
                                Se preseleccionó <strong>{herenciaReemplazo.detalle}</strong>. Si necesitás otra cosa, cambiala abajo.
                              </>
                            ) : (
                              herenciaReemplazo.detalle
                            )}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* --- CONFIGURACIÓN POR ÁREA (visual toggle) --- */}
                    <div className="md:col-span-2 space-y-3 pt-6 border-t border-gray-100 dark:border-gray-700">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">
                        <FontAwesomeIcon icon={faLayerGroup} className="mr-1" />
                        Asignación por Área y Turno *
                      </label>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 -mt-1 ml-1">Selecciona las áreas y turnos donde trabajará este miembro. Los turnos con horarios superpuestos se bloquean automáticamente.</p>

                      {(project?.areasConfig || []).length === 0 && (
                        // Sin áreas en el proyecto no se puede completar este paso (es obligatorio) → link a Editar Proyecto.
                        <div className="flex flex-col items-center gap-2 py-4 text-center bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                          <p className="text-sm text-gray-500">Este proyecto no tiene áreas configuradas.</p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => navigate(`/projects/${projectId}`, { state: { openEdit: true } })}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                              title="Ir a Editar Proyecto para agregar áreas"
                            >
                              <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3" />
                              Editar proyecto para agregar áreas
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowSinAreasInfo(true)}
                              className="text-blue-500 hover:text-blue-600 transition-colors"
                              title="Por qué no puedo guardar los cambios del miembro"
                              aria-label="Información: el proyecto no tiene áreas configuradas"
                            >
                              <FontAwesomeIcon icon={faInfoCircle} className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="space-y-3">
                        {(() => {
                          const isCoordinadorRole = (selectedUserForWizard?.roles || []).some((r: any) => r.name.toLowerCase().includes('mobile-coordinador'));
                          // Helper to check time overlap
                          const timeToMinutes = (t: string) => {
                            const [h, m] = t.split(':').map(Number);
                            return h * 60 + m;
                          };
                          const timesOverlap = (s1Start: string, s1End: string, s2Start: string, s2End: string) => {
                            let a1 = timeToMinutes(s1Start),
                              b1 = timeToMinutes(s1End);
                            let a2 = timeToMinutes(s2Start),
                              b2 = timeToMinutes(s2End);
                            if (b1 <= a1) b1 += 24 * 60;
                            if (b2 <= a2) b2 += 24 * 60;
                            return a1 < b2 && a2 < b1;
                          };
                          // Helper to check if two shifts share at least one work day
                          const daysOverlap = (d1: number[], d2: number[]) => {
                            if (d1.length === 0 || d2.length === 0) return true; // if no days configured, assume overlap
                            return d1.some((d) => d2.includes(d));
                          };

                          return (project?.areasConfig || []).map((ac: any) => {
                            const aId = typeof ac.areaId === 'object' ? ac.areaId?._id : ac.areaId;
                            const areaObj = allAreas.find((a) => a._id === aId);
                            const aName = typeof ac.areaId === 'object' ? ac.areaId?.name : areaObj?.name;
                            const isCoordinadorArea = areaObj?.isSystem;
                            const isAreaRestricted = isCoordinadorArea && !isCoordinadorRole;

                            const shiftIdsForArea = (ac.shiftIds || []).map((s: any) => String(typeof s === 'object' ? s._id : s));
                            const shiftsForArea = allShifts.filter((s) => shiftIdsForArea.includes(String(s._id))).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

                            // Current assignment for this area
                            const currentAssignment = wizardData.areaShiftAssignments.find((a) => a.areaId === aId);
                            const selectedShiftIds = currentAssignment?.shiftIds || [];
                            const isAreaActive = selectedShiftIds.length > 0;

                            // Collect ALL selected shift data across ALL areas for overlap detection
                            const allSelectedShiftData: { areaId: string; shiftId: string; name: string; start: string; end: string; days: number[] }[] = [];
                            wizardData.areaShiftAssignments.forEach((asa) => {
                              asa.shiftIds.forEach((sid) => {
                                const sh = allShifts.find((s) => String(s._id) === sid);
                                if (sh) allSelectedShiftData.push({ areaId: asa.areaId, shiftId: sid, name: sh.name, start: sh.startTime, end: sh.endTime, days: sh.days || [] });
                              });
                            });

                            return (
                              <div key={aId} className={`rounded-xl border transition-all ${isAreaActive ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10' : isAreaRestricted ? 'border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/10 opacity-75' : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20'}`}>
                                <div className="flex items-center justify-between px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <FontAwesomeIcon icon={faLayerGroup} className={`h-4 w-4 ${isAreaActive ? 'text-blue-500' : isAreaRestricted ? 'text-amber-500' : 'text-gray-400'}`} />
                                    <span className="font-bold text-sm uppercase tracking-wide">{aName || aId}</span>
                                    {isAreaRestricted && <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800 uppercase tracking-tighter">Requiere Rol Coordinador</span>}
                                  </div>
                                  {isAreaActive && (
                                    <span className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase">
                                      {selectedShiftIds.length} turno{selectedShiftIds.length > 1 ? 's' : ''}
                                    </span>
                                  )}
                                </div>
                                {isAreaRestricted && (
                                  <div className="px-4 pb-3">
                                    <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Este usuario no tiene el rol "mobile-coordinador". Debes asignarle el rol primero para habilitar esta área.</p>
                                  </div>
                                )}
                                <div className={`px-4 pb-3 flex flex-wrap gap-3 ${isAreaRestricted ? 'pointer-events-none grayscale-[0.5]' : ''}`}>
                                  {shiftsForArea.map((shift) => {
                                    const isSelected = selectedShiftIds.includes(String(shift._id));

                                    // Check if this shift overlaps with ANY currently selected shift
                                    const overlappingWith = allSelectedShiftData.find((sel) => (sel.areaId !== aId || sel.shiftId !== String(shift._id)) && timesOverlap(shift.startTime, shift.endTime, sel.start, sel.end) && daysOverlap(shift.days || [], sel.days));
                                    const isBlocked = !isSelected && !!overlappingWith;

                                    const DAY_LABELS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];

                                    return (
                                      <button
                                        key={shift._id}
                                        type="button"
                                        disabled={isAreaRestricted}
                                        onClick={() => {
                                          setWizardData((prev) => {
                                            let assignments = [...prev.areaShiftAssignments];

                                            if (isSelected) {
                                              const idx = assignments.findIndex((a) => a.areaId === aId);
                                              if (idx !== -1) {
                                                assignments[idx] = {
                                                  ...assignments[idx],
                                                  shiftIds: assignments[idx].shiftIds.filter((id) => id !== String(shift._id)),
                                                };
                                                if (assignments[idx].shiftIds.length === 0) assignments.splice(idx, 1);
                                              }
                                            } else {
                                              // AUTO-DEACTIVATE OVERLAPPING SHIFTS
                                              assignments = assignments
                                                .map((a) => ({
                                                  ...a,
                                                  shiftIds: a.shiftIds.filter((sid) => {
                                                    const sh = allShifts.find((s) => String(s._id) === sid);
                                                    if (!sh) return true;
                                                    const overlaps = timesOverlap(shift.startTime, shift.endTime, sh.startTime, sh.endTime) && daysOverlap(shift.days || [], sh.days);
                                                    return !overlaps;
                                                  }),
                                                }))
                                                .filter((a) => a.shiftIds.length > 0);

                                              // Add the new shift
                                              const idx = assignments.findIndex((a) => a.areaId === aId);
                                              if (idx !== -1) {
                                                assignments[idx] = {
                                                  ...assignments[idx],
                                                  shiftIds: [...assignments[idx].shiftIds, String(shift._id)],
                                                };
                                              } else {
                                                assignments.push({ areaId: aId, shiftIds: [String(shift._id)] });
                                              }
                                            }

                                            // Los turnos NO tocan la hora del contrato: son entidades independientes.
                                            // hora_inicio/hora_fin reflejan únicamente el contrato del empleado (DB).
                                            return {
                                              ...prev,
                                              areaShiftAssignments: assignments,
                                            };
                                          });
                                        }}
                                        className={`px-3 py-2 rounded-xl border transition-all flex flex-col min-w-[120px] cursor-pointer ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 ring-2 ring-blue-400/50' : isBlocked ? 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 hover:border-blue-300 dark:hover:border-blue-600 opacity-80' : 'bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'}`}
                                        title={isBlocked ? `Se superpone con "${overlappingWith?.name}"` : shift.name}
                                      >
                                        <span className={`text-xs font-bold uppercase tracking-wider ${isSelected ? 'text-blue-700 dark:text-blue-400' : isBlocked ? 'text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>{shift.name}</span>
                                        <span className={`text-[10px] font-medium uppercase mt-0.5 ${isSelected ? 'text-blue-600 dark:text-blue-500' : isBlocked ? 'text-gray-400' : 'text-gray-500'}`}>
                                          {shift.startTime} — {shift.endTime} hs
                                        </span>
                                        {shift.days && shift.days.length > 0 && (
                                          <div className="flex gap-1 mt-1.5">
                                            {DAY_LABELS.map((label, dayIdx) => (
                                              <span key={dayIdx} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${shift.days.includes(dayIdx) ? (isSelected ? 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200' : isBlocked ? 'text-gray-400 dark:text-gray-600' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300') : 'text-gray-300 dark:text-gray-600'}`}>
                                                {label}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                        {isBlocked && <span className="text-[9px] text-red-500 dark:text-red-400 mt-1 normal-case font-medium">⚠ Se superpone con "{overlappingWith?.name}"</span>}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>

                      {wizardData.areaShiftAssignments.length === 0 && (project?.areasConfig || []).length > 0 && <p className="text-[11px] text-amber-500 dark:text-amber-400 ml-1">⚠ Debes seleccionar al menos un área y turno.</p>}
                    </div>
                  </div>
                )}

                {/* Step 2: Sueldo */}
                {wizardStep === 2 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Cantidad de jornadas laborales *</label>
                        <input type="number" className="input-field w-full" value={wizardData.cantidad_jornadas_laborales} onChange={(e) => setWizardData((prev) => ({ ...prev, cantidad_jornadas_laborales: Number(e.target.value) }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sueldo por jornada *</label>
                        <input type="number" className="input-field w-full" value={wizardData.sueldo_jornada} onChange={(e) => setWizardData((prev) => ({ ...prev, sueldo_jornada: Number(e.target.value) }))} />
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-700">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sueldo en mano</label>
                      <input type="number" className="input-field w-full bg-gray-50 dark:bg-gray-900/50 cursor-not-allowed" value={wizardData.sueldo_mano} readOnly />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sueldo en mano texto *</label>
                      <input type="text" className="input-field w-full bg-gray-50 dark:bg-gray-900/50 cursor-not-allowed" placeholder="Ej: Cincuenta mil pesos" value={wizardData.sueldo_mano_texto} readOnly />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sueldo diario neto</label>
                        <input type="number" step="0.01" className="input-field w-full bg-gray-50 dark:bg-gray-900/50 cursor-not-allowed" value={wizardData.sueldo_diario_neto} readOnly />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Diferencia diaria neto</label>
                        <input type="number" step="0.01" className="input-field w-full bg-gray-50 dark:bg-gray-900/50 cursor-not-allowed font-bold" style={{ color: wizardData.diferencia_diaria_neto < 0 ? '#ef4444' : '#22c55e' }} value={wizardData.diferencia_diaria_neto} readOnly />
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
                )}

                {/* Step 3: Extras */}
                {wizardStep === 3 && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sede *</label>
                      <select className="input-field w-full" value={wizardData.sede_id} onChange={(e) => setWizardData((prev) => ({ ...prev, sede_id: e.target.value }))}>
                        <option value="">Selecciona sede...</option>
                        {allSedes.map((s) => (
                          <option key={s._id} value={s.data.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>


                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Observaciones</label>
                      <textarea className="input-field w-full min-h-[100px] py-3" placeholder="Notas adicionales..." value={wizardData.observaciones} onChange={(e) => setWizardData((prev) => ({ ...prev, observaciones: e.target.value }))} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Modal>
        </div>
      ) : null}

      {/* Modal de detalle del empleado: contratos del proyecto + descargas */}
      <EmployeeContractsModal
        isOpen={!!selectedMemberForDetail}
        onClose={() => setSelectedMemberForDetail(null)}
        user={selectedMemberForDetail}
        projectId={projectId || ''}
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
          { label: 'Ir a Editar Proyecto', onClick: () => { setShowSinAreasInfo(false); navigate(`/projects/${projectId}`, { state: { openEdit: true } }); }, variant: 'primary' },
          { label: 'Entendido', onClick: () => setShowSinAreasInfo(false), variant: 'secondary' },
        ]}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            La <strong>asignación por área y turno es obligatoria</strong> para guardar un miembro. Si el proyecto no tiene
            áreas, no hay nada para seleccionar y cualquier cambio del miembro (sueldo, contrato, extras) queda bloqueado.
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
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Volvé al equipo y configurá el miembro: ya vas a poder elegir área y turno, y guardar.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Sin áreas, además, los usuarios no pueden cargar su área y los coordinadores no pueden informar novedades sobre ellos.
              </span>
            </li>
          </ul>
        </div>
      </InfoModal>

      {/* Info: qué significa el número entre paréntesis en Área/Turno Coordinada */}
      <InfoModal
        isOpen={openCoordCountInfo}
        onClose={() => setOpenCoordCountInfo(false)}
        title="Personas coordinadas por área y turno"
        subtitle="Qué significa el número entre paréntesis"
        size="sm"
        zIndex={100}
        actions={[{ label: 'Entendido', onClick: () => setOpenCoordCountInfo(false), variant: 'primary' }]}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            El número al lado de cada turno es la <strong>cantidad de personas del equipo asignadas a esa combinación exacta
            de área y turno</strong>, o sea a quiénes coordina esa persona en ese horario.
          </p>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Se cuenta el <strong>área y el turno exactos</strong>: alguien de la misma área en otro horario no suma.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                El <strong>coordinador se incluye a sí mismo</strong> si además pertenece a esa área y turno.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Se calcula sobre <strong>todo el equipo del proyecto</strong>, no solo sobre la página que estás viendo, y se
                actualiza cuando cambian las asignaciones de los miembros.
              </span>
            </li>
          </ul>
        </div>
      </InfoModal>
    </PageLayout>
  );
};
