import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
// Si necesitás i18n, usá: import { useTranslation } from "react-i18next";
import { useAuthStore } from '../stores/authStore';
import { projectsAPI, Project } from '../api/projects';
import { nombreCentroCosto, cargarCentrosCosto, idOpcional } from '../utils/centroCosto';
import { companiesAPI, Company } from '../api/companies';
import { shiftsAPI, Shift } from '../api/shifts';
import { areasAPI, Area } from '../api/areas';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { sweetAlert } from '../utils/sweetAlert';
import { emitProjectsChanged } from '../utils/navbarEvents';
import { faPlus, faEdit, faTrash, faBriefcase, faBuilding, faTable, faGrip, faLayerGroup, faInfoCircle, faCalendarDay, faCalendarCheck, faUsers, faFileLines, faBell, faWallet } from '@fortawesome/free-solid-svg-icons';
import { Card } from '../components/ui/Card';
import { PageLayout } from '../components/ui/PageLayout';
import { getHelp, hasHelp } from '../data/help/helpContent';
import { SearchAndFilters } from '../components/ui/SearchAndFilters';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { InfoModal } from '../components/ui/InfoModal';
import { CompanyMultiSelect } from '../components/CompanyMultiSelect';
import { getImageUrl } from '../utils/imageHelpers';

const HELP_KEY = 'clientProjects' as const;

type ModalMode = 'create' | 'edit' | null;

export const ClientProjectsPage: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  // const { t } = useTranslation(); // si lo necesitás, descomentá y usalo
  const [projects, setProjects] = useState<Project[]>([]);
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [availableShifts, setAvailableShifts] = useState<Shift[]>([]);
  const [availableAreas, setAvailableAreas] = useState<Area[]>([]);
  const [availableSedes, setAvailableSedes] = useState<any[]>([]);
  const [availableCostCenters, setAvailableCostCenters] = useState<any[]>([]);
  const [availableCoordinators, setAvailableCoordinators] = useState<any[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  // búsqueda, fechas y paginación
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(''); // YYYY-MM-DD
  const [endDate, setEndDate] = useState(''); // YYYY-MM-DD
  const [page, setPage] = useState(1);

  const [totalPages, setTotalPages] = useState(1);

  // View Mode
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [isLg, setIsLg] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => setIsLg(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);

    // Fetch shifts once on component mount
    shiftsAPI.getAll().then(setAvailableShifts).catch(console.error);
    areasAPI.listAll().then(setAvailableAreas).catch(console.error);
    companiesAPI.list().then(setCompanies).catch(console.error);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const effectiveViewMode = !isLg ? 'cards' : viewMode;

  // modal unificado
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'active' as 'active' | 'completed' | 'on_hold' | 'archived',
    startDate: '',
    endDate: '',
    contratoEmpresas: [] as string[],
    releaseEmpresas: [] as string[],
    objectives: [] as string[],
    targetAudience: '',
    turnos: [] as string[],
    areasConfig: [] as { areaId: string; shiftIds: string[] }[],
    metadata: {
      centroCostoId: undefined as number | undefined,
      sedeId: undefined as number | undefined,
      responsableId: undefined as number | undefined,
      clienteId: undefined as number | undefined,
    },
  });

  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [isAddingArea, setIsAddingArea] = useState(false);
  const [configuringAreaId, setConfiguringAreaId] = useState<string | null>(null);

  // ⓘ estado del modal de información
  const [openInfo, setOpenInfo] = useState(false);
  const [showResponsableInfo, setShowResponsableInfo] = useState(false);
  const [showEmpresaInfo, setShowEmpresaInfo] = useState(false);
  const helpEntry = getHelp(HELP_KEY);

  useEffect(() => {
    if (!clientId) return;
    fetchClient();
  }, [clientId]);

  // Reset de página cuando cambian filtros
  useEffect(() => {
    setPage(1);
  }, [searchTerm, startDate, endDate]);

  useEffect(() => {
    if (!clientId) return;
    fetchProjects();
    fetchAuxData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, page, searchTerm, startDate, endDate]);

  const fetchClient = async () => {
    try {
      const { token, tenantId } = useAuthStore.getState();
      const response = await fetch(`${import.meta.env.VITE_API_URL}/clients/${clientId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Tenant-Id': tenantId,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setClient(data);
      }
    } catch (error) {
      console.error('Error fetching client:', error);
    }
  };

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const options: any = {
        q: searchTerm || undefined,
        page,
        limit: 12,
        dateFrom: startDate || undefined,
        dateTo: endDate || undefined,
      };
      const response = await projectsAPI.getClientProjects(clientId!, options);
      setProjects(response.projects);
      setTotalPages(response.pagination.pages);
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAuxData = async () => {
    try {
      const { token, tenantId } = useAuthStore.getState();
      const headers = { Authorization: `Bearer ${token}`, 'X-Tenant-Id': tenantId };

      const [sedesRes, responsablesRes] = await Promise.all([fetch(`${import.meta.env.VITE_API_URL}/info?type=sede`, { headers }), fetch(`${import.meta.env.VITE_API_URL}/users/eligible-responsables`, { headers })]);
      // Los dos catálogos de centros de costo, unidos. Ver `cargarCentrosCosto`.
      setAvailableCostCenters(await cargarCentrosCosto(import.meta.env.VITE_API_URL, headers));

      if (sedesRes.ok) setAvailableSedes(await sedesRes.json());
      if (responsablesRes.ok) {
        setAvailableCoordinators(await responsablesRes.json());
      }

      // Also fetch shifts and areas
      const [shifts, areas] = await Promise.all([shiftsAPI.getAll(), areasAPI.listAll()]);
      setAvailableShifts(shifts);
      setAvailableAreas(areas);
    } catch (err) {
      console.error('Error fetching aux data:', err);
    }
  };

  // ---- Filtrado local por fechas (fallback si el backend todavía no filtra) ----
  const visibleProjects = useMemo(() => {
    if (!startDate && !endDate) return projects;

    const startTs = startDate ? new Date(startDate).getTime() : null;
    const endTs = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : null;

    return projects.filter((p) => {
      // Usamos startDate del proyecto si existe, o createdAt
      const d = p.startDate ? p.startDate : p.createdAt;
      const t = d ? new Date(d).getTime() : NaN;
      if (Number.isNaN(t)) return false;
      let ok = true;
      if (startTs !== null) ok = ok && t >= startTs;
      if (endTs !== null) ok = ok && t <= endTs;
      return ok;
    });
  }, [projects, startDate, endDate]);

  // Removed defaultWorkSchedule

  const handleOpenCreate = () => {
    setModalMode('create');
    setEditingProject(null);
    setFormData({
      name: '',
      description: '',
      status: 'active',
      startDate: '',
      endDate: '',
      contratoEmpresas: [] as string[],
      releaseEmpresas: [] as string[],
      objectives: [],
      targetAudience: '',
      turnos: [],
      areasConfig: [],
      metadata: {
        centroCostoId: undefined,
        sedeId: undefined,
        responsableId: undefined,
        clienteId: client?.externalId ? parseInt(client.externalId) : undefined,
      },
    });
    setSelectedAreaId('');
    setIsAddingArea(false);
    setConfiguringAreaId(null);
    setShowModal(true);

    // Ensure Coordinador is added once areas/shifts are loaded (or if already loaded)
    if (availableAreas.length > 0 && availableShifts.length > 0) {
      const coordinadorArea = availableAreas.find((a) => a.name.toLowerCase() === 'coordinador');
      if (coordinadorArea) {
        setFormData((prev) => {
          const hasCoordinador = prev.areasConfig.some((ac) => ac.areaId === coordinadorArea._id);
          if (hasCoordinador) return prev;
          return {
            ...prev,
            areasConfig: [...prev.areasConfig, { areaId: coordinadorArea._id, shiftIds: availableShifts.map((s) => s._id) }],
          };
        });
      }
    }
  };

  const handleOpenEdit = (project: Project) => {
    setModalMode('edit');
    setEditingProject(project);
    setFormData({
      name: project.name || '',
      description: project.description || '',
      status: project.status || 'active',
      startDate: project.startDate ? project.startDate.split('T')[0] : '',
      endDate: project.endDate ? project.endDate.split('T')[0] : '',
      contratoEmpresas: project.contratoEmpresas || [],
      releaseEmpresas: project.releaseEmpresas || [],
      objectives: project.objectives || [],
      targetAudience: project.targetAudience || '',
      turnos: (project.turnos || []).map((t: any) => (typeof t === 'string' ? t : t._id)),
      areasConfig: (project.areasConfig || []).map((ac: any) => ({
        areaId: typeof ac.areaId === 'string' ? ac.areaId : ac.areaId._id,
        shiftIds: ac.shiftIds.map((s: any) => (typeof s === 'string' ? s : s._id)),
      })),
      metadata: {
        centroCostoId: project.metadata?.centroCostoId,
        sedeId: project.metadata?.sedeId,
        responsableId: project.metadata?.responsableId,
        clienteId: project.metadata?.clienteId,
      },
    });
    setSelectedAreaId('');
    setIsAddingArea(false);
    setConfiguringAreaId(null);
    setShowModal(true);

    // Ensure Coordinador is in the project when editing
    if (availableAreas.length > 0 && availableShifts.length > 0) {
      const coordinadorArea = availableAreas.find((a) => a.name.toLowerCase() === 'coordinador');
      if (coordinadorArea) {
        setFormData((prev) => {
          const areaConfigIndex = prev.areasConfig.findIndex((ac) => ac.areaId === coordinadorArea._id);
          if (areaConfigIndex > -1) {
            // Update existing to have all shifts if needed (as per user request "must have all active shifts")
            const newConfig = [...prev.areasConfig];
            newConfig[areaConfigIndex].shiftIds = availableShifts.map((s) => s._id);
            return { ...prev, areasConfig: newConfig };
          } else {
            // Add it
            return {
              ...prev,
              areasConfig: [...prev.areasConfig, { areaId: coordinadorArea._id, shiftIds: availableShifts.map((s) => s._id) }],
            };
          }
        });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (modalMode === 'create') {
        // Validation for Area and Shift configuration
        if (!formData.areasConfig || formData.areasConfig.length === 0) {
          sweetAlert.error('Configuración requerida', 'Debes agregar al menos un área al proyecto.');
          return;
        }

        const hasInvalidArea = formData.areasConfig.some((ac) => !ac.shiftIds || ac.shiftIds.length === 0);
        if (hasInvalidArea) {
          sweetAlert.error('Configuración requerida', 'Cada área configurada debe tener al menos un turno asignado.');
          return;
        }
      }

      const data = {
        ...formData,
      };

      if (modalMode === 'create') {
        await projectsAPI.createProject(clientId!, data);
        sweetAlert.success('Proyecto creado', 'El proyecto se ha creado correctamente');
      } else if (modalMode === 'edit' && editingProject) {
        await projectsAPI.updateProject(editingProject._id, data);
        sweetAlert.success('Proyecto actualizado', 'Los cambios se han guardado correctamente');
      }

      setShowModal(false);
      setModalMode(null);
      setEditingProject(null);
      // refrescar lista
      fetchProjects();
    } catch (error) {
      console.error('Error saving project:', error);
      sweetAlert.error('Error', modalMode === 'create' ? 'No se pudo crear el proyecto' : 'No se pudo actualizar el proyecto');
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    const result = await sweetAlert.confirm('¿Eliminar proyecto?', 'Esta acción no se puede deshacer.');
    if (!result.isConfirmed) return;

    try {
      const { token, tenantId } = useAuthStore.getState();
      const response = await fetch(`${import.meta.env.VITE_API_URL}/projects/${projectId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Tenant-Id': tenantId,
        },
      });

      if (response.ok) {
        sweetAlert.success('Proyecto eliminado', 'El proyecto fue eliminado correctamente');
        emitProjectsChanged('delete', projectId, clientId);
        fetchProjects();
      } else {
        const errorData = await response.json();
        sweetAlert.error('Error', errorData.error || 'No se pudo eliminar el proyecto');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      sweetAlert.error('Error', 'No se pudo eliminar el proyecto');
    }
  };

  if (!clientId) {
    return (
      <PageLayout title="Cliente no válido" subtitle="">
        <div className="text-center">
          <button onClick={() => navigate('/clients')} className="btn-primary">
            Volver a Clientes
          </button>
        </div>
      </PageLayout>
    );
  }

  const displayLogo = client?.attachments?.find((a: any) => a.name?.toLowerCase().includes('logo') || a.fileType?.includes('image'))?.url || client?.brandKit?.logos?.[0]?.url;

  return (
    <PageLayout
      title={client?.name ? `Proyectos` : 'Cliente'}
      itemCount={visibleProjects.length}
      faIcon={{ icon: faBriefcase }}
      clientMiniAvatar={{
        src: getImageUrl(displayLogo),
        alt: client?.name ? `${client.name} logo` : undefined,
        fallback: client?.name?.charAt(0)?.toUpperCase?.() || '?',
        label: client?.name,
      }}
      subtitle="Gestiona los proyectos del cliente"
      onBack={() => navigate(-1)}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      headerActions={
        <button onClick={handleOpenCreate} title="Nuevo proyecto" aria-label="Nuevo proyecto" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
          <FontAwesomeIcon icon={faPlus} />
        </button>
      }
      searchAndFilters={
        <SearchAndFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por nombre o centro de costo..."
          filters={[]}
          dateFilter={{
            startDate,
            endDate,
            onStartDateChange: setStartDate,
            onEndDateChange: setEndDate,
          }}
          extraActions={
            <div className="items-center gap-2 hidden lg:flex">
              <button onClick={() => setViewMode('cards')} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === 'cards' ? 'bg-blue-500 text-white shadow-sm border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="Vista de Tarjetas">
                <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode('table')} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === 'table' ? 'bg-blue-500 text-white shadow-sm border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="Vista de Tabla">
                <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
              </button>
            </div>
          }
        />
      }
      modal={
        showModal
          ? {
              isOpen: true,
              onClose: () => {
                setShowModal(false);
                setModalMode(null);
                setEditingProject(null);
              },
              title: modalMode === 'edit' ? 'Editar Proyecto' : 'Nuevo Proyecto',
              subtitle: modalMode === 'edit' ? 'Actualiza los datos del proyecto' : 'Completa los datos del proyecto',
              size: 'lg',
              actions: [
                {
                  label: modalMode === 'edit' ? 'Actualizar' : 'Crear',
                  onClick: () => {
                    const form = document.querySelector<HTMLFormElement>('#project-form');
                    form?.requestSubmit();
                  },
                  variant: 'primary',
                },
                {
                  label: 'Cancelar',
                  onClick: () => setShowModal(false),
                  variant: 'ghost',
                },
              ],
              content: (
                <form id="project-form" onSubmit={handleSubmit}>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre del Proyecto *</label>
                      <input type="text" required value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} className="input-field" placeholder="Ej: Campaña Verano 2024" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
                      <textarea
                        value={formData.description}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            description: e.target.value,
                          }))
                        }
                        rows={3}
                        className="input-field resize-none"
                        placeholder="Descripción del proyecto..."
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-800/50">
                      <div>
                        <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Centro de costo</label>
                        <select className="input-field py-2.5" value={formData.metadata?.centroCostoId || ''} onChange={(e) => setFormData((p) => ({ ...p, metadata: { ...p.metadata, centroCostoId: idOpcional(e.target.value) } }))}>
                          <option value="">Seleccionar del sistema...</option>
                          {availableCostCenters.map((cc) => (
                            <option key={cc._id} value={cc.data?.id}>
                              {cc.name || cc.data?.nombre}
                            </option>
                          ))}
                        </select>
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
                        Responsable del Proyecto
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
                                      <div className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">{area.name}</div>
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
                                <p className="text-[10px] text-gray-500 uppercase font-medium">Selecciona el área para integrarla</p>
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
                    </div>

                    {/* Estado - al final */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4 col-span-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Estado</label>
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((p) => ({
                              ...p,
                              status: p.status === 'active' ? 'on_hold' : 'active',
                            }))
                          }
                          className={`px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors ${formData.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400'}`}
                        >
                          <svg data-prefix="fas" data-icon={formData.status === 'active' ? 'toggle-on' : 'toggle-off'} className="svg-inline--fa mr-1 h-4 w-4" role="img" viewBox="0 0 576 512" aria-hidden="true">
                            <path fill="currentColor" d={formData.status === 'active' ? 'M192 64C86 64 0 150 0 256S86 448 192 448l192 0c106 0 192-86 192-192S490 64 384 64L192 64zm192 96a96 96 0 1 1 0 192 96 96 0 1 1 0-192z' : 'M384 64l-192 0C86 64 0 150 0 256s86 192 192 192l192 0c106 0 192-86 192-192S490 64 384 64M192 352a96 96 0 1 1 0-192 96 96 0 1 1 0 192z'}></path>
                          </svg>
                          {formData.status === 'active' ? 'Activo' : 'En Espera'}
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              ),
            }
          : undefined
      }
    >
      {/* Projects Grid */}
      {/* Projects Content: Table or Grid */}
      {loading ? (
        <LoadingSpinner message="Cargando proyectos..." />
      ) : effectiveViewMode === 'table' ? (
        <div className="mt-6 overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800/50 shadow-sm">
          <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-gray-900/30 border-b border-gray-100 dark:border-gray-800">
                <th className="py-4 px-6 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Proyecto</th>
                <th className="py-4 px-6 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Sede</th>
                {/* Pegado a Sede: los dos contestan «dónde se imputa esto», y separarlos obliga a
                    cruzar la fila entera para leer un solo concepto. */}
                <th className="py-4 px-6 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Centro de Costo</th>
                <th className="py-4 px-6 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Responsable</th>
                <th className="py-4 px-6 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Estado</th>
                <th className="py-4 px-6 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Áreas y Turnos</th>
                <th className="py-4 px-6 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Fechas</th>
                <th className="py-4 px-6 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {visibleProjects.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No se encontraron proyectos
                  </td>
                </tr>
              ) : (
                visibleProjects.map((p) => (
                  <tr key={p._id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/20 transition-colors group">
                    <td className="py-4 px-6 font-medium text-gray-900 dark:text-gray-100 cursor-pointer" onClick={() => navigate(`/projects/${p._id}`)}>
                      {p.name}
                    </td>
                    <td className="py-4 px-6 text-gray-600 dark:text-gray-400">{(p.metadataResolutions?.sede?.name || p.metadataResolutions?.sede?.data?.nombre) ?? '—'}</td>
                    <td className="py-4 px-6">
                      {/*
                        MISMO BADGE VIOLETA QUE LA FICHA DEL PROYECTO, a propósito: es el mismo dato y
                        tiene que reconocerse igual desde el listado y desde adentro.

                        El fallback a «ID: n» no es decorativo: un proyecto puede tener un
                        `centroCostoId` que ya no resuelve contra el catálogo —porque lo borraron o
                        cambió de id—, y mostrar «—» ahí diría que no tiene centro de costo cuando lo
                        que pasa es que apunta a uno que no está. Son dos problemas distintos.
                      */}
                      {(() => {
                        const cc = nombreCentroCosto(p, availableCostCenters);
                        return cc ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-bold bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border border-purple-100 dark:border-purple-800/50">{cc}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        );
                      })()}
                    </td>
                    <td className="py-4 px-6 text-gray-600 dark:text-gray-400">
                      {p.metadataResolutions?.responsable ? (
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-[9px] font-bold">{(p.metadataResolutions.responsable.firstName || 'U').charAt(0).toUpperCase()}</div>
                          <span>{p.metadataResolutions.responsable.firstName}</span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${p.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : p.status === 'on_hold' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : p.status === 'completed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>{p.status === 'active' ? 'Activo' : p.status === 'on_hold' ? 'En Espera' : p.status === 'completed' ? 'Completado' : 'Archivado'}</span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-wrap gap-2 max-w-[250px]">
                        {(p.areasConfig || []).map((ac: any, i: number) => (
                          <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-100 dark:border-gray-700">
                            {typeof ac.areaId === 'object' ? ac.areaId.name : '...'}
                          </span>
                        ))}
                        {(!p.areasConfig || p.areasConfig.length === 0) && <span className="text-gray-400">—</span>}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-xs text-gray-500 dark:text-gray-400">
                      <div>{p.startDate ? new Date(p.startDate).toLocaleDateString() : '—'}</div>
                      <div className="text-[10px] text-gray-400">a {p.endDate ? new Date(p.endDate).toLocaleDateString() : '—'}</div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(p);
                          }}
                          className="p-1.5 text-gray-400 hover:text-gray-300 rounded transition-colors"
                          title="Editar"
                        >
                          <FontAwesomeIcon icon={faEdit} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProject(p._id);
                          }}
                          className="p-1.5 text-gray-400 hover:text-gray-300 rounded transition-colors"
                          title="Eliminar"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
          {/* Tarjetas de proyecto */}
          {visibleProjects.map((project) => {
            // Empresas del proyecto (contrato / release): resolvemos los ObjectIds a razón social.
            const contratoEmpresaNames = (project.contratoEmpresas || []).map((id) => companies.find((c) => String(c._id) === String(id))?.razonSocial).filter((n): n is string => Boolean(n));
            const releaseEmpresaNames = (project.releaseEmpresas || []).map((id) => companies.find((c) => String(c._id) === String(id))?.razonSocial).filter((n): n is string => Boolean(n));
            return (
              <Card
                key={project._id}
                onClick={() => navigate(`/projects/${project._id}`)}
                className="hover:scale-105 hover:shadow-lg transition-all duration-200"
                header={{
                  title: `Proyecto | ${project.name}`,
                  subtitle: project.description,
                  avatar: {
                    src: client?.logo,
                    fallback: (client?.name || 'C').charAt(0).toUpperCase(),
                    alt: client?.name,
                  },
                  badges: [
                    {
                      text: project.status === 'active' ? 'Activo' : project.status === 'on_hold' ? 'En Espera' : project.status === 'completed' ? 'Completado' : 'Archivado',
                      variant: project.status === 'active' ? 'green' : project.status === 'on_hold' ? 'warning' : project.status === 'completed' ? 'info' : 'default',
                    },
                    {
                      text: client?.name || 'Cliente',
                      variant: 'cyan',
                    },
                  ],
                  badgesPosition: 'top',
                }}
                footer={{
                  leftContent: (
                    <div className="space-y-1">
                      <div className="text-xs text-gray-500 dark:text-gray-500">{new Date(project.createdAt).toLocaleDateString()}</div>
                    </div>
                  ),
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
                {/* Fechas (debajo de la descripción, arriba de Sede) */}
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

                {/* Sede dentro del cuerpo de la card */}
                {project.metadataResolutions?.sede && (
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                      <FontAwesomeIcon icon={faBuilding} className="h-3 w-3 text-gray-400" />
                      Sede
                    </label>
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300 w-fit">{project.metadataResolutions.sede.name || project.metadataResolutions.sede.data?.nombre || 'Sede'}</span>
                  </div>
                )}

                {/* Centro de costo, debajo de Sede: mismo par que en la tabla y en la ficha. */}
                {(project.metadataResolutions?.centroCosto || project.metadata?.centroCostoId) && (
                  <div className="flex flex-col mt-4">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                      <FontAwesomeIcon icon={faWallet} className="h-3 w-3 text-gray-400" />
                      Centro de Costo
                    </label>
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border border-purple-100 dark:border-purple-800/50 w-fit">
                      {nombreCentroCosto(project, availableCostCenters)}
                    </span>
                  </div>
                )}

                {/* Áreas Configuradas dentro del cuerpo de la card */}
                {project.areasConfig && project.areasConfig.length > 0 && (
                  <div className="flex flex-col mt-4">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                      <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3 text-gray-400" />
                      Áreas Configuradas
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {project.areasConfig.map((ac: any, i: number) => (
                        <span key={i} className="inline-flex items-center px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                          {typeof ac.areaId === 'object' ? ac.areaId.name : '...'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Miembros */}
                <div className="flex flex-col mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex gap-1 items-center">
                    <FontAwesomeIcon icon={faUsers} className="h-3 w-3 text-gray-400" />
                    Miembros
                  </label>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{project.metadataUserCount ?? 0}</span>
                </div>

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
          {/* Nueva tarjeta de creación */}
          <Card
            variant="create"
            onClick={handleOpenCreate}
            header={{
              title: 'Nuevo Proyecto',
              subtitle: 'Crear un nuevo proyecto para este cliente',
              icon: faBriefcase,
            }}
          />
        </div>
      )}

      {/* Paginación (del backend). Nota: con filtro local, pagina sobre el resultado actual de esta página */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2 mt-8">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50">
            Anterior
          </button>
          <span className="px-4 py-2 text-gray-600 dark:text-gray-400">
            Página {page} de {totalPages}
          </span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50">
            Siguiente
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && visibleProjects.length === 0 && (
        <div className="text-center py-12">
          <FontAwesomeIcon icon={faBriefcase} className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No hay proyectos</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{startDate || endDate ? `No se encontraron proyectos ${startDate && endDate ? `desde ${new Date(startDate).toLocaleDateString()} hasta ${new Date(endDate).toLocaleDateString()}` : startDate ? `desde ${new Date(startDate).toLocaleDateString()}` : `hasta ${new Date(endDate).toLocaleDateString()}`}` : 'Crea el primer proyecto para este cliente'}</p>
          <button onClick={handleOpenCreate} className="btn-primary">
            <FontAwesomeIcon icon={faPlus} className="h-5 w-5 mr-2" />
            Nuevo Proyecto
          </button>
        </div>
      )}
      {/* Modal Informativo Responsable */}
      <InfoModal isOpen={showResponsableInfo} onClose={() => setShowResponsableInfo(false)} title="Responsable de Proyecto" subtitle="Información sobre la selección de responsables" size="sm" zIndex={100} actions={[{ label: 'Entendido', onClick: () => setShowResponsableInfo(false), variant: 'primary' }]}>
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
                <strong>Rol de Sistema:</strong> Debe tener asignado el rol "Responsable de Proyecto" o un rol con permisos de elegibilidad.
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
