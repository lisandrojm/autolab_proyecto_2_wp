import React, { useEffect, useState, useMemo } from 'react';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../api/simpleCatalog';

const valoracionesApi = createSimpleCatalogApi('/valoraciones');
import { nombreCentroCosto, idOpcional } from '../utils/centroCosto';
import { SelectorCentroCosto } from '../components/proyectos/SelectorCentroCosto';
import { fuzzyMatch } from '../utils/searchHelpers';
import { BloqueEstado } from '../components/ui/BloqueEstado';
import { useNavigate } from 'react-router-dom';
import { projectsAPI, Project } from '../api/projects';
import { clientsAPI, Client } from '../api/clients';
import { companiesAPI, Company } from '../api/companies';
import { shiftsAPI, Shift } from '../api/shifts';
import { areasAPI, Area } from '../api/areas';
import { useAuthStore } from '../stores/authStore';
import { useClientContextStore } from '../stores/clientContextStore';
import { AlcanceBanner } from '../components/context/AlcanceBanner';
import { PageLayout } from '../components/ui/PageLayout';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { InfoModal } from '../components/ui/InfoModal';
import { ConveniosDelProyecto } from '../components/proyectos/ConveniosDelProyecto';
import { CompanyMultiSelect } from '../components/CompanyMultiSelect';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { SearchAndFilters } from '../components/ui/SearchAndFilters';
import { sweetAlert } from '../utils/sweetAlert';
import { emitProjectsChanged } from '../utils/navbarEvents';
import { faBriefcase, faBuilding, faTable, faGrip, faPlus, faLayerGroup, faEdit, faTrash, faInfoCircle, faUserTie, faCalendarDay, faCalendarCheck, faUsers, faFileLines, faBell, faPiggyBank } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { getHelp, hasHelp } from '../data/help/helpContent';

export const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const { setSelectedClient, selectedClient } = useClientContextStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [openInfo, setOpenInfo] = useState(false);
  const [showResponsableInfo, setShowResponsableInfo] = useState(false);
  const [showEmpresaInfo, setShowEmpresaInfo] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');

  const HELP_KEY = 'projects';
  const helpEntry = getHelp(HELP_KEY);

  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [isXXL, setIsXXL] = useState(window.innerWidth >= 1200);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedClientId, setSelectedClientIdLocal] = useState('');
  const [availableSedes, setAvailableSedes] = useState<any[]>([]);
  const [availableCoordinators, setAvailableCoordinators] = useState<any[]>([]);
  const [availableShifts, setAvailableShifts] = useState<Shift[]>([]);
  const [availableAreas, setAvailableAreas] = useState<Area[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [isAddingArea, setIsAddingArea] = useState(false);
  const [configuringAreaId, setConfiguringAreaId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'active' as 'active' | 'completed' | 'on_hold' | 'archived',
    startDate: '',
    endDate: '',
    contratoEmpresas: [] as string[],
    convenioIds: [] as string[],
    releaseEmpresas: [] as string[],
    areasConfig: [] as { areaId: string; shiftIds: string[] }[],
    metadata: {
      centroCostoId: undefined as number | undefined,
      // La empresa de Tango del centro: el id solo es ambiguo entre empresas (ver `SelectorCentroCosto`).
      centroCostoEmpresaTangoId: undefined as number | undefined,
      sedeId: undefined as number | undefined,
      responsableId: undefined as number | undefined,
    },
  });

  useEffect(() => {
    const handleResize = () => {
      const isNowXXL = window.innerWidth >= 1200;
      setIsXXL(isNowXXL);
      if (!isNowXXL) setViewMode('cards');
    };

    const saved = localStorage.getItem('projectsViewMode');
    if (saved === 'table' || saved === 'cards') {
      if (window.innerWidth >= 1200) setViewMode(saved as 'table' | 'cards');
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isXXL) {
      localStorage.setItem('projectsViewMode', viewMode);
    }
  }, [viewMode, isXXL]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [projectsData, clientsData, companiesData] = await Promise.all([projectsAPI.listAll({ limit: 500 }), clientsAPI.listAll(), companiesAPI.list()]);
      setProjects(projectsData);
      setCompanies(companiesData);
      setClients(clientsData);
    } catch (error) {
      console.error('Error fetching projects data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch aux data for the create modal
  const fetchAuxData = async () => {
    try {
      const { token, tenantId } = useAuthStore.getState();
      const headers = { Authorization: `Bearer ${token}`, 'X-Tenant-Id': tenantId };

      const [sedesRes, responsablesRes] = await Promise.all([fetch(`${import.meta.env.VITE_API_URL}/info?type=sede`, { headers }), fetch(`${import.meta.env.VITE_API_URL}/users/eligible-responsables`, { headers })]);
      /*
        EL CATÁLOGO DE CENTROS DE COSTO YA NO SE BAJA.

        Eran 2.208 registros, más de un megabyte y nueve segundos de espera, dos veces por pantalla,
        para dos cosas: mostrar el código de cada proyecto y llenar un selector. Lo primero lo resuelve
        el server en el propio listado (`metadataResolutions.centroCosto`); lo segundo lo hace el
        selector buscando contra el server (ver `SelectorCentroCosto`).
      */

      if (sedesRes.ok) setAvailableSedes(await sedesRes.json());
      if (responsablesRes.ok) setAvailableCoordinators(await responsablesRes.json());

      // Also fetch shifts and areas
      const [shifts, areas] = await Promise.all([shiftsAPI.getAll(), areasAPI.listAll()]);
      setAvailableShifts(shifts);
      setAvailableAreas(areas);
    } catch (err) {
      console.error('Error fetching aux data:', err);
    }
  };

  /*
    Las valoraciones del tenant: para pintar el chip y para el filtro.

    Sólo nombre y color — el nivel de cada proyecto lo resolvió el SERVER y viene en
    `project.valoracionId`. Acá no se recalcula nada: una segunda implementación de la regla diría
    algo distinto de lo guardado el día que los rangos cambien.
  */
  const [valoraciones, setValoraciones] = useState<SimpleCatalogItem[]>([]);
  const [filtroValoracion, setFiltroValoracion] = useState('');
  useEffect(() => {
    void valoracionesApi
      .list()
      .then((v) => setValoraciones(Array.isArray(v) ? v : []))
      .catch(() => setValoraciones([]));
  }, []);

  const valoracionPorId = useMemo(() => new Map(valoraciones.map((v) => [v._id, v])), [valoraciones]);
  /** El id de la valoración de un proyecto, venga poblada o pelada. */
  const idValoracionDe = (p: Project): string => {
    const ref = (p as any).valoracionId;
    if (!ref) return '';
    return typeof ref === 'object' ? String(ref._id || '') : String(ref);
  };

  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    clients.forEach((c) => map.set(c._id, c));
    return map;
  }, [clients]);

  const filteredProjects = useMemo(() => {
    // El filtro por valoración va ANTES del buscador: es un recorte del conjunto, no una búsqueda.
    const base = filtroValoracion ? projects.filter((p) => idValoracionDe(p) === filtroValoracion) : projects;
    if (!searchTerm) return base;
    const lowerSearch = searchTerm.toLowerCase();
    return base.filter((p) => {

      /*
        El centro de costo también entra en la búsqueda.

        Es un número («99», «701») y es lo que la gente tiene a mano cuando busca un proyecto. Acá el
        filtro es del lado del cliente, así que se resuelve contra el catálogo ya cargado en vez de
        pedirlo al server como en el listado por cliente — el resultado tiene que ser el mismo.
      */
      const centro = nombreCentroCosto(p);
      return (
        fuzzyMatch(p.name, lowerSearch) ||
        fuzzyMatch(p.description || '', lowerSearch) ||
        fuzzyMatch(typeof p.clientId === 'object' ? p.clientId.name : clientMap.get(p.clientId)?.name || '', lowerSearch) ||
        fuzzyMatch(p.metadataResolutions?.responsable?.name || '', lowerSearch) ||
        fuzzyMatch(centro, lowerSearch)
      );
    });
  }, [projects, searchTerm, clientMap, filtroValoracion]);

  const handleProjectClick = (project: Project) => {
    const cId = typeof project.clientId === 'object' ? project.clientId._id : project.clientId;
    const client = clientMap.get(cId);

    if (client) {
      setSelectedClient(client);
    }

    navigate(`/projects/${project._id}`);
  };

  const handleOpenCreate = () => {
    setModalMode('create');
    setEditingProject(null);
    setSelectedClientIdLocal('');
    setSelectedAreaId('');
    setIsAddingArea(false);
    setConfiguringAreaId(null);
    setFormData({
      name: '',
      description: '',
      status: 'active',
      startDate: '',
      endDate: '',
      contratoEmpresas: [] as string[],
      convenioIds: [] as string[],
      releaseEmpresas: [] as string[],
      areasConfig: [],
      metadata: {
        centroCostoId: undefined,
        centroCostoEmpresaTangoId: undefined,
        sedeId: undefined,
        responsableId: undefined,
      },
    });
    setShowCreateModal(true);
    // Note: Coordinador will be added inside fetchAuxData once areas/shifts are loaded
    fetchAuxData();
  };

  const handleOpenEdit = (project: Project) => {
    setModalMode('edit');
    setEditingProject(project);
    const cId = typeof project.clientId === 'object' ? project.clientId._id : project.clientId;
    setSelectedClientIdLocal(cId || '');
    setFormData({
      name: project.name || '',
      description: project.description || '',
      status: project.status || 'active',
      startDate: project.startDate ? project.startDate.split('T')[0] : '',
      endDate: project.endDate ? project.endDate.split('T')[0] : '',
      contratoEmpresas: project.contratoEmpresas || [],
      convenioIds: project.convenioIds || [],
      releaseEmpresas: project.releaseEmpresas || [],
      areasConfig: (project.areasConfig || []).map((ac: any) => ({
        areaId: typeof ac.areaId === 'string' ? ac.areaId : ac.areaId._id,
        shiftIds: ac.shiftIds.map((s: any) => (typeof s === 'string' ? s : s._id)),
      })),
      metadata: {
        centroCostoId: project.metadata?.centroCostoId,
        centroCostoEmpresaTangoId: (project.metadata as any)?.centroCostoEmpresaTangoId,
        sedeId: project.metadata?.sedeId,
        responsableId: project.metadata?.responsableId,
      },
    });
    setSelectedAreaId('');
    setIsAddingArea(false);
    setConfiguringAreaId(null);
    setShowCreateModal(true);
    fetchAuxData();
  };

  const handleDeleteProject = async (projectId: string) => {
    const result = await sweetAlert.confirm('¿Eliminar proyecto?', 'Esta acción no se puede deshacer.');
    if (!result.isConfirmed) return;

    try {
      setLoading(true);
      await projectsAPI.deleteProject(projectId);
      sweetAlert.success('Proyecto eliminado', 'El proyecto fue eliminado correctamente');
      fetchData();
    } catch (error: any) {
      console.error('Error deleting project:', error);
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo eliminar el proyecto');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) {
      sweetAlert.error('Error', 'Seleccioná un cliente para el proyecto');
      return;
    }
    if (!formData.metadata?.responsableId) {
      sweetAlert.error('Datos incompletos', 'El coordinador del proyecto es obligatorio');
      return;
    }
    try {
      setCreating(true);

      // Validation for Area and Shift configuration
      if (!formData.areasConfig || formData.areasConfig.length === 0) {
        sweetAlert.error('Configuración requerida', 'Debes agregar al menos un área al proyecto.');
        setCreating(false);
        return;
      }

      const hasInvalidArea = formData.areasConfig.some((ac) => !ac.shiftIds || ac.shiftIds.length === 0);
      if (hasInvalidArea) {
        sweetAlert.error('Configuración requerida', 'Cada área configurada debe tener al menos un turno asignado.');
        setCreating(false);
        return;
      }

      if (modalMode === 'edit' && editingProject) {
        await projectsAPI.updateProject(editingProject._id, {
          ...formData,
        } as any);
        sweetAlert.success('Proyecto actualizado', 'El proyecto se ha actualizado correctamente');
      } else {
        await projectsAPI.createProject(selectedClientId, {
          ...formData,
        } as any);
        sweetAlert.success('Proyecto creado', 'El proyecto se ha creado correctamente');
      }

      setShowCreateModal(false);
      emitProjectsChanged(modalMode === 'edit' ? 'update' : 'create', editingProject?._id || '', selectedClientId);
      fetchData();
    } catch (error) {
      console.error('Error saving project:', error);
      sweetAlert.error('Error', modalMode === 'edit' ? 'No se pudo actualizar el proyecto' : 'No se pudo crear el proyecto');
    } finally {
      setCreating(false);
    }
  };

  return (
    <PageLayout
      title="Proyectos"
      subtitle="Todos los proyectos del sistema"
      itemCount={filteredProjects.length}
      faIcon={{ icon: faBriefcase }}
      headerActions={
        <button onClick={handleOpenCreate} className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700" title="Nuevo proyecto" aria-label="Nuevo proyecto">
          <FontAwesomeIcon icon={faPlus} />
        </button>
      }
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry?.title || 'Ayuda',
        size: helpEntry?.size as any,
        content: helpEntry?.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      // Esta pantalla NO respeta el contexto Cliente: lista los proyectos de todos. Con un cliente
      // activo eso es indistinguible de una lista filtrada, así que se dice y se ofrece el atajo a la
      // versión acotada.
      preSearchContent={<AlcanceBanner eje="cliente" modo="global" irAlFiltrado={selectedClient ? `/clients/${selectedClient._id}/projects` : undefined} />}
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
          <div className="flex-1 w-full">
            <SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar por nombre, cliente o centro de costo..." />
          </div>
          {/* Sólo si hay valoraciones cargadas: un filtro de una sola opción no es una elección. */}
          {valoraciones.length > 0 && (
            <select
              value={filtroValoracion}
              onChange={(e) => setFiltroValoracion(e.target.value)}
              title="Filtrar por valoración"
              className="shrink-0 px-3 py-2 rounded-md text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200"
            >
              <option value="">Todas las valoraciones</option>
              {valoraciones.map((v) => (
                <option key={v._id} value={v._id}>
                  {String(v.name)}
                </option>
              ))}
            </select>
          )}
          {isXXL && (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setViewMode('cards')} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === 'cards' ? 'bg-blue-500 text-white shadow-sm border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="Vista de tarjetas">
                <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode('table')} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === 'table' ? 'bg-blue-500 text-white shadow-sm border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="Vista de tabla">
                <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      }
    >
      {loading ? (
        <LoadingSpinner message="Cargando proyectos..." />
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-12">
          <FontAwesomeIcon icon={faBriefcase} className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No se encontraron proyectos</h3>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {filteredProjects.map((project) => {
            const logoUrl = typeof project.clientId === 'object' ? (project.clientId as any).logo : undefined;
            // Empresas del proyecto (contrato / release): resolvemos los ObjectIds a razón social.
            const contratoEmpresaNames = (project.contratoEmpresas || []).map((id) => companies.find((c) => String(c._id) === String(id))?.razonSocial).filter((n): n is string => Boolean(n));
            const releaseEmpresaNames = (project.releaseEmpresas || []).map((id) => companies.find((c) => String(c._id) === String(id))?.razonSocial).filter((n): n is string => Boolean(n));
            // El código del centro de costo, con el mismo helper que la tabla y la ficha.
            const centroCostoTarjeta = nombreCentroCosto(project);
            return (
              <Card
                key={project._id}
                onClick={() => handleProjectClick(project)}
                className="hover:scale-105 hover:shadow-lg transition-all duration-200 cursor-pointer"
                header={{
                  title: project.name,
                  subtitle: project.description,
                  icon: faBriefcase,
                  avatar: logoUrl
                    ? {
                        src: logoUrl,
                        fallback: '?',
                        alt: typeof project.clientId === 'object' ? project.clientId.name : undefined,
                      }
                    : undefined,
                  iconClassName: 'text-primary-600 dark:text-primary-400',
                  badges: [
                    {
                      text: project.status === 'active' ? 'Activo' : project.status === 'on_hold' ? 'En Espera' : project.status === 'completed' ? 'Completado' : 'Archivado',
                      variant: project.status === 'active' ? 'green' : project.status === 'on_hold' ? 'warning' : project.status === 'completed' ? 'info' : 'default',
                    },
                    {
                      text: (typeof project.clientId === 'object' ? project.clientId.name : clientMap.get(project.clientId as string)?.name) || 'Cliente Desconocido',
                      variant: 'cyan',
                    },
                  ],
                  badgesPosition: 'top',
                }}
                footer={{
                  leftContent: <div className="text-xs text-gray-500 dark:text-gray-500">Creado: {new Date(project.createdAt).toLocaleDateString()}</div>,
                  actions: [
                    {
                      icon: faFileLines,
                      onClick: (e: any) => {
                        e.stopPropagation();
                        // TODO: destino de Reportes (a definir)
                      },
                      title: 'Reportes',
                      tooltip: 'Reportes',
                      variant: 'default',
                    },
                    {
                      icon: faBell,
                      onClick: (e: any) => {
                        e.stopPropagation();
                        navigate(`/requests?reportsProject=${project._id}`);
                      },
                      title: 'Novedades',
                      tooltip: 'Novedades',
                      variant: 'default',
                    },
                    {
                      icon: faUsers,
                      onClick: (e: any) => {
                        e.stopPropagation();
                        navigate(`/projects/${project._id}/team`);
                      },
                      title: 'Equipo',
                      tooltip: 'Equipo',
                      variant: 'default',
                    },
                    {
                      icon: faEdit,
                      onClick: (e: any) => {
                        e.stopPropagation();
                        handleOpenEdit(project);
                      },
                      title: 'Editar proyecto',
                      variant: 'default',
                    },
                    {
                      icon: faTrash,
                      onClick: (e: any) => {
                        e.stopPropagation();
                        handleDeleteProject(project._id);
                      },
                      title: 'Eliminar proyecto',
                      variant: 'default',
                    },
                  ],
                }}
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 pb-4 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400" title="Fecha desde">
                    <FontAwesomeIcon icon={faCalendarDay} className="h-3.5 w-3.5 text-gray-400" />
                    <span>{project.startDate ? new Date(project.startDate).toLocaleDateString() : '—'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400" title="Fecha hasta">
                    <FontAwesomeIcon icon={faCalendarCheck} className="h-3.5 w-3.5 text-gray-400" />
                    <span>{project.endDate ? new Date(project.endDate).toLocaleDateString() : '—'}</span>
                  </div>
                </div>
                {/*
                  SEDE Y CENTRO DE COSTO, JUNTOS Y EN LA MISMA FILA.

                  El centro de costo estaba sólo en la vista de tabla, así que en tarjetas —que es como
                  se abre la pantalla— había que entrar al proyecto para saber a qué centro se imputa.
                  Va con el mismo badge violeta que la tabla, la ficha y la lista por cliente: es el
                  mismo dato en las cuatro pantallas y se reconoce por el color.
                */}
                {(project.metadataResolutions?.sede || centroCostoTarjeta) && (
                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    {project.metadataResolutions?.sede && (
                      <div className="flex flex-col">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex gap-1 items-center">
                          <FontAwesomeIcon icon={faBuilding} className="h-3 w-3 text-gray-400" />
                          Sede
                        </label>
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300 w-fit">{project.metadataResolutions.sede.name || project.metadataResolutions.sede.data?.nombre || 'Sede'}</span>
                      </div>
                    )}
                    {centroCostoTarjeta && (
                      <div className="flex flex-col">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex gap-1 items-center">
                          <FontAwesomeIcon icon={faPiggyBank} className="h-3 w-3 text-gray-400" />
                          Centro de costo
                        </label>
                        {/* El código, en mono: es un número y se compara de un vistazo entre tarjetas. */}
                        <span className="inline-flex items-center px-2 py-1 rounded-md font-mono text-xs font-bold bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border border-purple-100 dark:border-purple-800/50 w-fit" title={project.metadataResolutions?.centroCosto?.descAuxiliar || undefined}>
                          {centroCostoTarjeta}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex flex-col mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex gap-1 items-center">
                    <FontAwesomeIcon icon={faUsers} className="h-3 w-3 text-gray-400" />
                    Miembros
                  </label>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{project.metadataUserCount ?? 0}</span>
                </div>
                {project.metadataResolutions?.responsable && (
                  <div className="flex flex-col mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex gap-1 items-center">
                      <FontAwesomeIcon icon={faUserTie} className="h-3 w-3 text-gray-400" />
                      Responsable
                    </label>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-tight">
                      {project.metadataResolutions.responsable.firstName} {project.metadataResolutions.responsable.lastName}
                    </span>
                  </div>
                )}
                {/* Empresas del Contrato / Release (misma UI que Información del Proyecto) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faBuilding} className="text-indigo-500/50" />
                      Empresa del Contrato
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {contratoEmpresaNames.length > 0 ? (
                        contratoEmpresaNames.map((n, i) => (
                          <span key={i} className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50 w-fit">
                            {n}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-gray-400 italic">Sin empresa</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faBuilding} className="text-teal-500/50" />
                      Empresa del Release
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {releaseEmpresaNames.length > 0 ? (
                        releaseEmpresaNames.map((n, i) => (
                          <span key={i} className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 border border-teal-100 dark:border-teal-800/50 w-fit">
                            {n}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-gray-400 italic">Sin empresa</span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Proyecto</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cliente</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Valoración</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sede</th>
                  {/* Junto a Sede y con el mismo badge violeta que la ficha y la lista por cliente:
                      es el mismo dato y tiene que reconocerse igual en las tres pantallas. */}
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Centro de Costo</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Responsable</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Creado</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {filteredProjects.map((project) => {
                  const clientName = (typeof project.clientId === 'object' ? project.clientId.name : clientMap.get(project.clientId as string)?.name) || 'Cliente Desconocido';
                  const sedeName = project.metadataResolutions?.sede?.name || project.metadataResolutions?.sede?.data?.nombre || '-';
                  /* `ID: n` y no un guion cuando el id no resuelve: distingue «no tiene centro de
                     costo» de «apunta a uno que no está en el catálogo», que son cosas distintas. */
                  const centroCosto = nombreCentroCosto(project);

                  const statusColors: any = {
                    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                    on_hold: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                    completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                    archived: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
                  };
                  const statusLabel: any = {
                    active: 'Activo',
                    on_hold: 'En Espera',
                    completed: 'Completado',
                    archived: 'Archivado',
                  };

                  return (
                    <tr key={project._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group cursor-pointer" onClick={() => handleProjectClick(project)}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center shrink-0">
                            <FontAwesomeIcon icon={faBriefcase} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{project.name}</span>
                            <span className="text-xs text-gray-500 truncate max-w-[200px]">{project.description || 'Sin descripción'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300">{clientName}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${statusColors[project.status] || statusColors.archived}`}>{statusLabel[project.status] || project.status}</span>
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                          const v = valoracionPorId.get(idValoracionDe(project));
                          if (!v) return <span className="text-xs text-gray-400 dark:text-gray-600">—</span>;
                          const color = String(v.color || '');
                          return (
                            <span
                              className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold border whitespace-nowrap"
                              style={color ? { color, borderColor: color, backgroundColor: `${color}1a` } : undefined}
                              title={(project as any).valoracionManual ? 'Fijada manualmente' : 'Calculada según el presupuesto'}
                            >
                              {String(v.name)}
                              {/* El asterisco marca que la puso una persona: sin esto, un nivel que
                                  no coincide con el presupuesto se lee como un error de cálculo. */}
                              {(project as any).valoracionManual ? <span className="ml-1 opacity-70">*</span> : null}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600 dark:text-gray-400">{sedeName}</span>
                      </td>
                      <td className="px-6 py-4">
                        {centroCosto ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border border-purple-100 dark:border-purple-800/50 whitespace-nowrap">{centroCosto}</span>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{project.metadataResolutions?.responsable ? `${project.metadataResolutions.responsable.firstName} ${project.metadataResolutions.responsable.lastName || ''}` : project.metadata?.responsableId ? `ID: ${project.metadata.responsableId}` : '-'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-500">{new Date(project.createdAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEdit(project);
                            }}
                            className="p-1.5 text-gray-400 hover:text-gray-300 rounded transition-colors"
                            title="Editar"
                          >
                            <FontAwesomeIcon icon={faEdit} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProject(project._id);
                            }}
                            className="p-1.5 text-gray-400 hover:text-gray-300 rounded transition-colors"
                            title="Eliminar"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title={modalMode === 'edit' ? 'Editar Proyecto' : 'Nuevo Proyecto'} subtitle={modalMode === 'edit' ? 'Actualiza los datos del proyecto' : 'Seleccioná el cliente y completá los datos'} size="lg">
        <form onSubmit={handleCreateProject}>
          <div className="space-y-6">
            {/* Client selector - first field */}
            <div>
              <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Cliente *</label>
              <select className="input-field py-2.5 disabled:opacity-60 disabled:cursor-not-allowed" required disabled={modalMode === 'edit'} value={selectedClientId} onChange={(e) => setSelectedClientIdLocal(e.target.value)}>
                <option value="">Seleccionar cliente...</option>
                {clients.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre del Proyecto *</label>
              <input type="text" required value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} className="input-field" placeholder="Ej: Campaña Verano 2024" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
              <textarea value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} rows={3} className="input-field resize-none" placeholder="Descripción del proyecto..." />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-800/50">
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Centro de costo *</label>
                {/* Código + descripción, y con buscador: son 806 y el número solo no dice qué es. */}
                <SelectorCentroCosto required valor={formData.metadata?.centroCostoId} empresaTangoId={formData.metadata?.centroCostoEmpresaTangoId} onCambio={(id, empresa) => setFormData((p) => ({ ...p, metadata: { ...p.metadata, centroCostoId: id, centroCostoEmpresaTangoId: empresa } }))} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Sede *</label>
                <select className="input-field py-2.5" required value={formData.metadata?.sedeId || ''} onChange={(e) => setFormData((p) => ({ ...p, metadata: { ...p.metadata, sedeId: idOpcional(e.target.value) } }))}>
                  <option value="">Seleccionar del sistema...</option>
                  {availableSedes.map((s) => (
                    <option key={s._id} value={s.data?.id}>
                      {s.name || s.data?.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-2">
              <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                Coordinador del Proyecto
                <button type="button" onClick={() => setShowResponsableInfo(true)} className="text-blue-500 hover:text-blue-600 transition-colors">
                  <FontAwesomeIcon icon={faInfoCircle} />
                </button>
              </label>
              <select className="input-field py-2.5" required value={formData.metadata?.responsableId || ''} onChange={(e) => setFormData((p) => ({ ...p, metadata: { ...p.metadata, responsableId: idOpcional(e.target.value) } }))}>
                <option value="">Seleccionar del sistema...</option>
                {availableCoordinators.map((c) => (
                  <option key={c._id} value={c.metadata?.id}>
                    {c.firstName} {c.lastName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-800/50">
              <div>
                <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                  Empresa del Contrato
                  <button type="button" onClick={() => setShowEmpresaInfo(true)} className="text-blue-500 hover:text-blue-600 transition-colors">
                    <FontAwesomeIcon icon={faInfoCircle} />
                  </button>
                </label>
                <CompanyMultiSelect companies={companies} value={formData.contratoEmpresas} onChange={(ids) => setFormData((p) => ({ ...p, contratoEmpresas: ids }))} />
              </div>

              {/*
                LOS CONVENIOS DEL PROYECTO, debajo de la empresa que los aporta.

                Van en su propia fila y no al lado del Release: el Release es otra empleadora y otra
                cosa. Estos cuelgan de la Empresa del Contrato, y ponerlos en cualquier otro lado
                rompe la única relación que los explica.
              */}
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">Convenios del proyecto</label>
                <ConveniosDelProyecto companies={companies as any} empresasContrato={formData.contratoEmpresas} value={formData.convenioIds} onChange={(ids) => setFormData((p) => ({ ...p, convenioIds: ids }))} />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                  Empresa del Release
                  <button type="button" onClick={() => setShowEmpresaInfo(true)} className="text-blue-500 hover:text-blue-600 transition-colors">
                    <FontAwesomeIcon icon={faInfoCircle} />
                  </button>
                </label>
                <CompanyMultiSelect companies={companies} value={formData.releaseEmpresas} onChange={(ids) => setFormData((p) => ({ ...p, releaseEmpresas: ids }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha Inicio</label>
                <input type="date" className="input-field" value={formData.startDate} onChange={(e) => setFormData((p) => ({ ...p, startDate: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha Fin</label>
                <input type="date" className="input-field" value={formData.endDate} onChange={(e) => setFormData((p) => ({ ...p, endDate: e.target.value }))} />
              </div>

              {/* Áreas y Turnos */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6 col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Configuración por Área</label>
                  </div>
                  <button type="button" onClick={() => setIsAddingArea(true)} className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 border border-blue-100 dark:border-blue-800 transition-all shadow-sm">
                    <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                    Agregar Área
                  </button>
                </div>

                <div className="space-y-2">
                  {formData.areasConfig.length === 0 ? (
                    <div className="text-center py-10 bg-gray-50/30 dark:bg-gray-900/10 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-2xl">
                      <FontAwesomeIcon icon={faLayerGroup} className="h-8 w-8 text-gray-200 dark:text-gray-700 mb-3" />
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sin Áreas Integradas</p>
                    </div>
                  ) : (
                    formData.areasConfig.map((ac) => {
                      const area = availableAreas.find((a) => a._id === ac.areaId);
                      if (!area) return null;

                      return (
                        <div key={ac.areaId} className="flex items-center justify-between p-3 rounded-xl bg-gray-50/50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition-all group">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center text-gray-400 group-hover:text-blue-500 transition-colors">
                              <FontAwesomeIcon icon={faLayerGroup} className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                                {area.name}
                                {area.isSystem && <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-orange-500/10 text-orange-500 border border-orange-500/50 uppercase tracking-wider">Sistema</span>}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${ac.shiftIds.length > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`}>
                                  {ac.shiftIds.length} {ac.shiftIds.length === 1 ? 'Turno' : 'Turnos'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setConfiguringAreaId(ac.areaId)} className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all" title="Configurar Turnos">
                              <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                            </button>
                            {!area.isSystem && (
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData((prev) => ({
                                    ...prev,
                                    areasConfig: prev.areasConfig.filter((item) => item.areaId !== ac.areaId),
                                  }));
                                }}
                                className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all"
                                title="Quitar"
                              >
                                <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* MODAL: Agregar Área */}
              {isAddingArea && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 animate-in zoom-in-95 duration-200 overflow-hidden">
                    <div className="p-6 bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <FontAwesomeIcon icon={faLayerGroup} className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">Agregar Nueva Área</h3>
                      </div>
                    </div>

                    <div className="p-6 space-y-6">
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Áreas Disponibles</label>
                        <select
                          className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all cursor-pointer"
                          value={selectedAreaId}
                          autoFocus
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) return;
                            setFormData((prev) => ({
                              ...prev,
                              areasConfig: [...prev.areasConfig, { areaId: val, shiftIds: [] }],
                            }));
                            setSelectedAreaId('');
                            setIsAddingArea(false);
                            setConfiguringAreaId(val);
                          }}
                        >
                          <option value="">Seleccionar del sistema...</option>
                          {availableAreas
                            .filter((a) => !formData.areasConfig.some((ac) => ac.areaId === a._id))
                            .map((a) => (
                              <option key={a._id} value={a._id}>
                                {a.name}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingArea(false);
                            setSelectedAreaId('');
                          }}
                          className="px-6 py-2.5 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors uppercase tracking-widest border border-gray-100 dark:border-gray-800 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* MODAL: Configurar Turnos */}
              {configuringAreaId && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[80vh]">
                    <div className="p-6 bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                          <FontAwesomeIcon icon={faTable} className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">{availableAreas.find((a) => a._id === configuringAreaId)?.name}</h3>
                          <p className="text-[10px] text-gray-500 uppercase font-medium">Habilitar turnos para esta área</p>
                        </div>
                      </div>
                      <button onClick={() => setConfiguringAreaId(null)} className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-all flex items-center justify-center">
                        <FontAwesomeIcon icon={faPlus} className="h-4 w-4 rotate-45" />
                      </button>
                    </div>

                    <div className="p-4 overflow-y-auto space-y-3">
                      {availableShifts.map((shift) => {
                        const areaConfigIndex = formData.areasConfig.findIndex((ac) => ac.areaId === configuringAreaId);
                        const isShiftSelected = areaConfigIndex !== -1 && formData.areasConfig[areaConfigIndex].shiftIds.includes(shift._id);

                        return (
                          <div
                            key={shift._id}
                            onClick={() => {
                              if (areaConfigIndex === -1) return;
                              const newAreasConfig = [...formData.areasConfig];
                              const currentArea = newAreasConfig[areaConfigIndex];
                              if (isShiftSelected) {
                                currentArea.shiftIds = currentArea.shiftIds.filter((id) => id !== shift._id);
                              } else {
                                currentArea.shiftIds = [...currentArea.shiftIds, shift._id];
                              }
                              setFormData((prev) => ({ ...prev, areasConfig: newAreasConfig }));
                            }}
                            className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${isShiftSelected ? 'bg-emerald-50/50 border-emerald-500/30 dark:bg-emerald-900/10' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'}`}
                          >
                            <div>
                              <div className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-tight">{shift.name}</div>
                              <div className="text-[10px] text-gray-500 font-bold uppercase mt-1 tracking-wider">
                                {shift.startTime} — {shift.endTime}
                              </div>
                              {shift.days && shift.days.length > 0 && (
                                <div className="flex gap-0.5 mt-1.5">
                                  {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'].map((label, dayIdx) => (
                                    <span key={dayIdx} className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md ${shift.days.includes(dayIdx) ? (isShiftSelected ? 'bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300') : 'text-gray-300 dark:text-gray-600'}`}>
                                      {label}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${isShiftSelected ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
                              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xl ring-0 transition duration-200 ease-in-out ${isShiftSelected ? 'translate-x-5' : 'translate-x-0'}`} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="p-4 bg-gray-50/50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                      <button type="button" onClick={() => setConfiguringAreaId(null)} className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors">
                        Listo
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Estado, al final. El bloque es compartido: ver `components/ui/BloqueEstado`. */}
              <BloqueEstado
                activo={formData.status === 'active'}
                onChange={(activo) => setFormData((p) => ({ ...p, status: activo ? 'active' : 'on_hold' }))}
                etiquetaInactivo="En Espera"
                className="col-span-2"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
            <button type="submit" disabled={creating} className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors">
              {creating ? (modalMode === 'edit' ? 'Guardando...' : 'Creando...') : modalMode === 'edit' ? 'Guardar' : 'Crear'}
            </button>
            <button type="button" onClick={() => setShowCreateModal(false)} className="px-6 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </Modal>
      {/* Modal Informativo Responsable */}
      <InfoModal isOpen={showResponsableInfo} onClose={() => setShowResponsableInfo(false)} title="Coordinador del Proyecto" subtitle="Información sobre la selección de coordinadores" size="sm" zIndex={100} actions={[{ label: 'Entendido', onClick: () => setShowResponsableInfo(false), variant: 'primary' }]}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">Para que un usuario aparezca en esta lista, debe cumplir con los siguientes requisitos de sistema:</p>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                <strong>Estado Activo:</strong> El usuario debe estar marcado como activo en el módulo de Usuarios.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                <strong>Coordinador del Proyecto:</strong> hay que tildarlo en su ficha, pestaña Sistema, bloque Proyectos. No depende de sus roles.
              </span>
            </li>
          </ul>
        </div>
      </InfoModal>

      <InfoModal isOpen={showEmpresaInfo} onClose={() => setShowEmpresaInfo(false)} title="Empresa del Contrato y del Release" subtitle="Cómo se vinculan con los contratos y releases" size="sm" zIndex={100} actions={[{ label: 'Entendido', onClick: () => setShowEmpresaInfo(false), variant: 'primary' }]}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Cada Contrato (Configuración → Contratos) y cada Release (Configuración → Releases) está <strong>tagueado con una empresa</strong>.
          </p>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Al elegir acá la <strong>Empresa del Contrato</strong> y la <strong>Empresa del Release</strong>, el proyecto queda vinculado a esas empresas.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                En el equipo del proyecto, al cargar los contratos y releases de una persona <strong>solo se mostrarán los que pertenezcan a la empresa seteada</strong>. Los que no tienen empresa no aparecen.
              </span>
            </li>
          </ul>
        </div>
      </InfoModal>
    </PageLayout>
  );
};
