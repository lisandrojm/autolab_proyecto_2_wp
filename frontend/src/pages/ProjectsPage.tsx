import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { projectsAPI, Project } from "../api/projects";
import { clientsAPI, Client } from "../api/clients";
import { shiftsAPI, Shift } from "../api/shifts";
import { areasAPI, Area } from "../api/areas";
import { useAuthStore } from "../stores/authStore";
import { useClientContextStore } from "../stores/clientContextStore";
import { PageLayout } from "../components/ui/PageLayout";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { sweetAlert } from "../utils/sweetAlert";
import { emitProjectsChanged } from "../utils/navbarEvents";
import { faBriefcase, faBuilding, faTable, faGrip, faPlus, faLayerGroup, faEdit, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { getHelp, hasHelp } from "../data/help/helpContent";

export const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const { setSelectedClient } = useClientContextStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [openInfo, setOpenInfo] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");

  const HELP_KEY = "projects";
  const helpEntry = getHelp(HELP_KEY);

  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const [isXXL, setIsXXL] = useState(window.innerWidth >= 1200);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedClientId, setSelectedClientIdLocal] = useState("");
  const [availableSedes, setAvailableSedes] = useState<any[]>([]);
  const [availableCostCenters, setAvailableCostCenters] = useState<any[]>([]);
  const [availableCoordinators, setAvailableCoordinators] = useState<any[]>([]);
  const [availableShifts, setAvailableShifts] = useState<Shift[]>([]);
  const [availableAreas, setAvailableAreas] = useState<Area[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [isAddingArea, setIsAddingArea] = useState(false);
  const [configuringAreaId, setConfiguringAreaId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    status: "active" as "active" | "completed" | "on_hold" | "archived",
    startDate: "",
    endDate: "",
    areasConfig: [] as { areaId: string; shiftIds: string[] }[],
    metadata: {
      centroCostoId: undefined as number | undefined,
      sedeId: undefined as number | undefined,
      responsableId: undefined as number | undefined,
    },
  });

  useEffect(() => {
    const handleResize = () => {
      const isNowXXL = window.innerWidth >= 1200;
      setIsXXL(isNowXXL);
      if (!isNowXXL) setViewMode("cards");
    };

    const saved = localStorage.getItem("projectsViewMode");
    if (saved === "table" || saved === "cards") {
      if (window.innerWidth >= 1200) setViewMode(saved as "table" | "cards");
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (isXXL) {
      localStorage.setItem("projectsViewMode", viewMode);
    }
  }, [viewMode, isXXL]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [projectsData, clientsData] = await Promise.all([projectsAPI.listAll({ limit: 500 }), clientsAPI.listAll()]);
      setProjects(projectsData);
      setClients(clientsData);
    } catch (error) {
      console.error("Error fetching projects data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch aux data for the create modal
  const fetchAuxData = async () => {
    try {
      const { token, tenantId } = useAuthStore.getState();
      const headers = { Authorization: `Bearer ${token}`, "X-Tenant-Id": tenantId };

      const [sedesRes, ccRes, responsablesRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/info?type=sede`, { headers }),
        fetch(`${import.meta.env.VITE_API_URL}/info?type=centro-costo`, { headers }),
        fetch(`${import.meta.env.VITE_API_URL}/users/eligible-responsables`, { headers }),
      ]);

      if (sedesRes.ok) setAvailableSedes(await sedesRes.json());
      if (ccRes.ok) setAvailableCostCenters(await ccRes.json());
      if (responsablesRes.ok) setAvailableCoordinators(await responsablesRes.json());

      // Also fetch shifts and areas
      const [shifts, areas] = await Promise.all([
        shiftsAPI.getAll(),
        areasAPI.listAll()
      ]);
      setAvailableShifts(shifts);
      setAvailableAreas(areas);

      // Pre-select Coordinador if not already in config
      const coordinadorArea = areas.find(a => a.name.toLowerCase() === "coordinador");
      if (coordinadorArea) {
        setFormData(prev => {
          const hasCoordinador = prev.areasConfig.some(ac => ac.areaId === coordinadorArea._id);
          if (hasCoordinador) return prev;
          return {
            ...prev,
            areasConfig: [
              ...prev.areasConfig,
              { areaId: coordinadorArea._id, shiftIds: shifts.map(s => s._id) }
            ]
          };
        });
      }
    } catch (err) {
      console.error("Error fetching aux data:", err);
    }
  };


  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    clients.forEach((c) => map.set(c._id, c));
    return map;
  }, [clients]);

  const filteredProjects = useMemo(() => {
    if (!searchTerm) return projects;
    const lowerSearch = searchTerm.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(lowerSearch) || (typeof p.clientId === "object" ? p.clientId.name : clientMap.get(p.clientId)?.name)?.toLowerCase().includes(lowerSearch));
  }, [projects, searchTerm, clientMap]);

  const handleProjectClick = (project: Project) => {
    const cId = typeof project.clientId === "object" ? project.clientId._id : project.clientId;
    const client = clientMap.get(cId);

    if (client) {
      setSelectedClient(client);
    }

    navigate(`/projects/${project._id}`);
  };

  const handleOpenCreate = () => {
    setSelectedClientIdLocal("");
    setSelectedAreaId("");
    setIsAddingArea(false);
    setConfiguringAreaId(null);
    setFormData({
      name: "",
      description: "",
      status: "active",
      startDate: "",
      endDate: "",
      areasConfig: [],
      metadata: {
        centroCostoId: undefined,
        sedeId: undefined,
        responsableId: undefined,
      },
    });
    setShowCreateModal(true);
    // Note: Coordinador will be added inside fetchAuxData once areas/shifts are loaded
    fetchAuxData();
  };


  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) {
      sweetAlert.error("Error", "Seleccioná un cliente para el proyecto");
      return;
    }
    if (!formData.metadata?.responsableId) {
      sweetAlert.error("Datos incompletos", "El responsable del proyecto es obligatorio");
      return;
    }
    try {
      setCreating(true);

      // Validation for Area and Shift configuration
      if (!formData.areasConfig || formData.areasConfig.length === 0) {
        sweetAlert.error("Configuración requerida", "Debes agregar al menos un área al proyecto.");
        setCreating(false);
        return;
      }

      const hasInvalidArea = formData.areasConfig.some(ac => !ac.shiftIds || ac.shiftIds.length === 0);
      if (hasInvalidArea) {
        sweetAlert.error("Configuración requerida", "Cada área configurada debe tener al menos un turno asignado.");
        setCreating(false);
        return;
      }

      await projectsAPI.createProject(selectedClientId, {
        ...formData,
      } as any);
      sweetAlert.success("Proyecto creado", "El proyecto se ha creado correctamente");
      setShowCreateModal(false);
      emitProjectsChanged("create", "", selectedClientId);
      fetchData();
    } catch (error) {
      console.error("Error creating project:", error);
      sweetAlert.error("Error", "No se pudo crear el proyecto");
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
        <button
          onClick={handleOpenCreate}
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-all duration-200 shadow-sm hover:shadow-md"
          title="Nuevo Proyecto"
        >
          <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
        </button>
      }
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry?.title || "Ayuda",
        size: helpEntry?.size as any,
        content: helpEntry?.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
          <div className="flex-1 w-full">
            <SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar por nombre o cliente..." />
          </div>
          {isXXL && (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setViewMode("cards")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "cards" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tarjetas">
                <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode("table")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "table" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tabla">
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
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {filteredProjects.map((project) => {
            const logoUrl = typeof project.clientId === "object" ? (project.clientId as any).logo : undefined;
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
                        fallback: "?",
                        alt: typeof project.clientId === "object" ? project.clientId.name : undefined,
                      }
                    : undefined,
                  iconClassName: "text-primary-600 dark:text-primary-400",
                  badges: [
                    {
                      text: project.status === "active" ? "Activo" : project.status === "on_hold" ? "En Espera" : project.status === "completed" ? "Completado" : "Archivado",
                      variant: project.status === "active" ? "green" : project.status === "on_hold" ? "warning" : project.status === "completed" ? "info" : "default",
                    },
                    {
                      text: (typeof project.clientId === "object" ? project.clientId.name : clientMap.get(project.clientId as string)?.name) || "Cliente Desconocido",
                      variant: "cyan",
                    },
                  ],
                  badgesPosition: "top",
                }}
                footer={{
                  leftContent: <div className="text-xs text-gray-500 dark:text-gray-500">Creado: {new Date(project.createdAt).toLocaleDateString()}</div>,
                }}
              >
                {project.metadataResolutions?.sede && (
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                      <FontAwesomeIcon icon={faBuilding} className="h-3 w-3 text-gray-400" />
                      Sede
                    </label>
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300 w-fit">{project.metadataResolutions.sede.name || project.metadataResolutions.sede.data?.nombre || "Sede"}</span>
                  </div>
                )}
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
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sede</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Creado</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {filteredProjects.map((project) => {
                  const clientName = (typeof project.clientId === "object" ? project.clientId.name : clientMap.get(project.clientId as string)?.name) || "Cliente Desconocido";
                  const sedeName = project.metadataResolutions?.sede?.name || project.metadataResolutions?.sede?.data?.nombre || "-";

                  const statusColors: any = {
                    active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                    on_hold: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                    completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                    archived: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
                  };
                  const statusLabel: any = {
                    active: "Activo",
                    on_hold: "En Espera",
                    completed: "Completado",
                    archived: "Archivado",
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
                            <span className="text-xs text-gray-500 truncate max-w-[200px]">{project.description || "Sin descripción"}</span>
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
                        <span className="text-sm text-gray-600 dark:text-gray-400">{sedeName}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-500">{new Date(project.createdAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-right">{/* Actions column */}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Nuevo Proyecto" subtitle="Seleccioná el cliente y completá los datos" size="lg">
        <form onSubmit={handleCreateProject}>
          <div className="space-y-6">
            {/* Client selector - first field */}
            <div>
              <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Cliente *</label>
              <select
                className="input-field py-2.5"
                required
                value={selectedClientId}
                onChange={(e) => setSelectedClientIdLocal(e.target.value)}
              >
                <option value="">Seleccionar cliente...</option>
                {clients.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre del Proyecto *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                className="input-field"
                placeholder="Ej: Campaña Verano 2024"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                rows={3}
                className="input-field resize-none"
                placeholder="Descripción del proyecto..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-800/50">
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Centro de costo *</label>
                <select
                  className="input-field py-2.5"
                  required
                  value={formData.metadata?.centroCostoId || ""}

                  onChange={(e) => setFormData(p => ({ ...p, metadata: { ...p.metadata, centroCostoId: parseInt(e.target.value) || undefined } }))}
                >
                  <option value="">Seleccionar del sistema...</option>
                  {availableCostCenters.map(cc => (
                    <option key={cc._id} value={cc.data?.id}>{cc.name || cc.data?.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Sede *</label>
                <select
                  className="input-field py-2.5"
                  required
                  value={formData.metadata?.sedeId || ""}
                  onChange={(e) => setFormData(p => ({ ...p, metadata: { ...p.metadata, sedeId: parseInt(e.target.value) || undefined } }))}
                >
                  <option value="">Seleccionar del sistema...</option>
                  {availableSedes.map(s => (
                    <option key={s._id} value={s.data?.id}>{s.name || s.data?.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-2">
              <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Responsable del Proyecto *</label>
              <select
                className="input-field py-2.5"
                required
                value={formData.metadata?.responsableId || ""}
                onChange={(e) => setFormData(p => ({ ...p, metadata: { ...p.metadata, responsableId: parseInt(e.target.value) || undefined } }))}
              >
                <option value="">Seleccionar del sistema...</option>
                {availableCoordinators.map(c => (
                  <option key={c._id} value={c.metadata?.id}>{c.firstName} {c.lastName}</option>
                ))}
              </select>
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
                <button
                  type="button"
                  onClick={() => setIsAddingArea(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 border border-blue-100 dark:border-blue-800 transition-all shadow-sm"
                >
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
                    const area = availableAreas.find(a => a._id === ac.areaId);
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
                            {(area.isSystem || area.name.toLowerCase() === "coordinador") && (
                               <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-orange-500/10 text-orange-500 border border-orange-500/50 uppercase tracking-wider">
                                 Sistema
                               </span>
                             )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${ac.shiftIds.length > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"}`}>
                                {ac.shiftIds.length} {ac.shiftIds.length === 1 ? 'Turno' : 'Turnos'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setConfiguringAreaId(ac.areaId)}
                            className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all"
                            title="Configurar Turnos"
                          >
                            <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                          </button>
                          {!(area.isSystem || area.name.toLowerCase() === "coordinador") && (

                            <button
                              type="button"
                              onClick={() => {
                                setFormData(prev => ({
                                  ...prev,
                                  areasConfig: prev.areasConfig.filter(item => item.areaId !== ac.areaId)
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
                          setFormData(prev => ({
                            ...prev,
                            areasConfig: [...prev.areasConfig, { areaId: val, shiftIds: [] }]
                          }));
                          setSelectedAreaId("");
                          setIsAddingArea(false);
                          setConfiguringAreaId(val);
                        }}
                      >
                        <option value="">Seleccionar del sistema...</option>
                        {availableAreas
                          .filter(a => !formData.areasConfig.some(ac => ac.areaId === a._id))
                          .map(a => (
                            <option key={a._id} value={a._id}>{a.name}</option>
                          ))
                        }
                      </select>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingArea(false);
                          setSelectedAreaId("");
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
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">
                          {availableAreas.find(a => a._id === configuringAreaId)?.name}
                        </h3>
                        <p className="text-[10px] text-gray-500 uppercase font-medium">Habilitar turnos para esta área</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setConfiguringAreaId(null)}
                      className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-all flex items-center justify-center"
                    >
                      <FontAwesomeIcon icon={faPlus} className="h-4 w-4 rotate-45" />
                    </button>
                  </div>
                  
                  <div className="p-4 overflow-y-auto space-y-3">
                    {availableShifts.map((shift) => {
                      const areaConfigIndex = formData.areasConfig.findIndex(ac => ac.areaId === configuringAreaId);
                      const isShiftSelected = areaConfigIndex !== -1 && formData.areasConfig[areaConfigIndex].shiftIds.includes(shift._id);
                      
                      return (
                        <div 
                          key={shift._id} 
                          onClick={() => {
                            if (areaConfigIndex === -1) return;
                            const newAreasConfig = [...formData.areasConfig];
                            const currentArea = newAreasConfig[areaConfigIndex];
                            if (isShiftSelected) {
                              currentArea.shiftIds = currentArea.shiftIds.filter(id => id !== shift._id);
                            } else {
                              currentArea.shiftIds = [...currentArea.shiftIds, shift._id];
                            }
                            setFormData(prev => ({ ...prev, areasConfig: newAreasConfig }));
                          }}
                          className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${isShiftSelected ? "bg-emerald-50/50 border-emerald-500/30 dark:bg-emerald-900/10" : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600"}`}
                        >
                          <div>
                            <div className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-tight">{shift.name}</div>
                            <div className="text-[10px] text-gray-500 font-bold uppercase mt-1 tracking-wider">{shift.startTime} — {shift.endTime}</div>
                            {shift.days && shift.days.length > 0 && (
                              <div className="flex gap-0.5 mt-1.5">
                                {['Do','Lu','Ma','Mi','Ju','Vi','Sa'].map((label, dayIdx) => (
                                  <span key={dayIdx} className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md ${
                                    shift.days.includes(dayIdx) 
                                      ? isShiftSelected
                                        ? 'bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200'
                                        : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                                      : 'text-gray-300 dark:text-gray-600'
                                  }`}>{label}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${isShiftSelected ? "bg-emerald-500" : "bg-gray-200 dark:bg-gray-700"}`}>
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xl ring-0 transition duration-200 ease-in-out ${isShiftSelected ? "translate-x-5" : "translate-x-0"}`} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-4 bg-gray-50/50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setConfiguringAreaId(null)}
                      className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
                    >
                      Listo
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Estado - al final */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4 col-span-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Estado</label>
                <button
                  type="button"
                  onClick={() =>
                    setFormData((p) => ({
                      ...p,
                      status: p.status === "active" ? "on_hold" : "active",
                    }))
                  }
                  className={`px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors ${formData.status === "active" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400"}`}
                >
                  <svg data-prefix="fas" data-icon={formData.status === "active" ? "toggle-on" : "toggle-off"} className="svg-inline--fa mr-1 h-4 w-4" role="img" viewBox="0 0 576 512" aria-hidden="true">
                    <path fill="currentColor" d={formData.status === "active" ? "M192 64C86 64 0 150 0 256S86 448 192 448l192 0c106 0 192-86 192-192S490 64 384 64L192 64zm192 96a96 96 0 1 1 0 192 96 96 0 1 1 0-192z" : "M384 64l-192 0C86 64 0 150 0 256s86 192 192 192l192 0c106 0 192-86 192-192S490 64 384 64M192 352a96 96 0 1 1 0-192 96 96 0 1 1 0 192z"}></path>
                  </svg>
                  {formData.status === "active" ? "Activo" : "En Espera"}
                </button>
              </div>
            </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="submit"
              disabled={creating}
              className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
            >
              {creating ? "Creando..." : "Crear"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="px-6 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </Modal>
    </PageLayout>
  );
};
