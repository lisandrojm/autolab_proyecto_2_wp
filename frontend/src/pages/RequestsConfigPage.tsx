import React, { useState, useEffect } from "react";
import { PageLayout } from "../components/ui/PageLayout";
import { ProjectHeaderSelector } from "../components/activity_logs_config/ProjectHeaderSelector";
import { SortableActivityTypeRow, RequestConfig as RequestConfigType } from "../components/activity_logs_config/SortableActivityTypeRow";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faCog, faPlus, faGripVertical, faInfoCircle, faGlobe, faUsers, faToggleOn, faToggleOff, faCircleInfo, faSpinner, faBriefcase, faMobileAlt, faUserPlus, faStar, faClipboardList, faCalendarAlt, faFileInvoiceDollar, faSave } from "@fortawesome/free-solid-svg-icons";
import { overtimeUtils, OvertimeSettings } from "../utils/overtimeUtils";
import { useNavigate, useLocation } from "react-router-dom";
import { ReportSchedule } from "../types/activityTypes";
import { sweetAlert } from "../utils/sweetAlert";
import { activityLogTypesAPI } from "../api/requestConfig";

import { projectsAPI, Project } from "../api/projects";
import { Modal } from "../components/ui/Modal";
import { InfoModal } from "../components/ui/InfoModal";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";

const DAYS_OF_WEEK = [
  { id: 0, label: "Domingo", short: "D" },
  { id: 1, label: "Lunes", short: "L" },
  { id: 2, label: "Martes", short: "M" },
  { id: 3, label: "Miércoles", short: "X" },
  { id: 4, label: "Jueves", short: "J" },
  { id: 5, label: "Viernes", short: "V" },
  { id: 6, label: "Sábado", short: "S" },
];

export const RequestsConfigPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<"general" | "types" | "project" | "reports" | "glossary">("general");

  useEffect(() => {
    if (location.state && (location.state as any).activeTab) {
      setActiveTab((location.state as any).activeTab);
    }
  }, [location.state]);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [glossary, setGlossary] = useState<OvertimeSettings>(overtimeUtils.getGlossary());
  const [savingGlossary, setSavingGlossary] = useState(false);

  // Config State (Removed Global)
  // const [config, setConfig] = useState<ActivityLogConfig | null>(null);
  // const [loadingConfig, setLoadingConfig] = useState(false);

  // Schedule Config State
  const [type, setType] = useState<ReportSchedule["type"]>("daily");
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [savingFrequency, setSavingFrequency] = useState(false);

  // ABM State
  const [activityTypes, setActivityTypes] = useState<RequestConfigType[]>([]);
  const [isAbmModalOpen, setIsAbmModalOpen] = useState(false);
  const [currentType, setCurrentType] = useState<Partial<RequestConfigType>>({});
  const [openTypesInfo, setOpenTypesInfo] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);

  // Project Novelties Modal State
  const [isProjectNovedadesModalOpen, setIsProjectNovedadesModalOpen] = useState(false);
  const [modalSelectedProject, setModalSelectedProject] = useState<any>(null);
  const [showProjectNovedadesInfo, setShowProjectNovedadesInfo] = useState(false);

  // DnD Sensors
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    fetchTypes();
    loadProjects();
  }, []);

  const fetchTypes = async () => {
    try {
      const data = await activityLogTypesAPI.getAll();
      const mapped: RequestConfigType[] = data.map((d: any) => ({
        id: d._id,
        order: d.order,
        type: d.name,
        requiresReplacement: d.requiresReplacement,
        status: d.isActive ? "Activa" : "Inactiva",
        visibility: d.visibility || "all",
        allowedProjectIds: d.allowedProjectIds || [],
      }));
      setActivityTypes(mapped);
    } catch (error) {
      console.error("Error fetching types:", error);
      sweetAlert.error("Error", "No se pudieron cargar los tipos de novedades");
    }
  };

  const loadProjects = async () => {
    try {
      const projs = await projectsAPI.listAll();
      setAllProjects(projs);
    } catch (e) {
      console.error("Error loading projects", e);
    }
  };

  useEffect(() => {
    if (selectedProject) {
      const currentConfig = selectedProject.activityLogConfig?.schedule;
      if (currentConfig) {
        setType(currentConfig.type);
        setSelectedDays(currentConfig.days);
      } else {
        setType("daily");
        setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
      }
    }
  }, [selectedProject?._id, selectedProject?.activityLogConfig]);

  const handleTypeChange = (newType: ReportSchedule["type"]) => {
    setType(newType);
    if (newType === "daily") setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    else if (newType === "workdays") setSelectedDays([1, 2, 3, 4, 5]);
  };

  const toggleDay = (dayId: number) => {
    if (type !== "custom") return;
    setSelectedDays((prev) => (prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId]));
  };

  const handleSave = async () => {
    if (!selectedProject) return;
    setSavingFrequency(true);
    try {
      const newConfig = {
        useGlobalConfig: false,
        ...selectedProject.activityLogConfig,
        schedule: {
          type,
          days: selectedDays,
        },
      };

      await projectsAPI.updateProject(selectedProject._id, { activityLogConfig: newConfig });

      setSelectedProject((prev: any) => (prev ? { ...prev, activityLogConfig: newConfig } : prev));
      setAllProjects((prev) => prev.map((p) => (p._id === selectedProject._id ? { ...p, activityLogConfig: newConfig } : p)));

      sweetAlert.success("Configuración Guardada", `Se ha actualizado la frecuencia para ${selectedProject.name}`);
    } catch (error) {
      console.error("Error saving frequency:", error);
      sweetAlert.error("Error", "No se pudo guardar la configuración");
    } finally {
      setSavingFrequency(false);
    }
  };

  const handleSelectProject = (projectFromSelector: any) => {
    if (!projectFromSelector) {
      setSelectedProject(null);
      return;
    }
    // We use allProjects as the source of truth to avoid stale configurations
    // from ProjectHeaderSelector's internal state.
    const upToDateProject = allProjects.find((p) => p._id === projectFromSelector._id) || projectFromSelector;
    setSelectedProject(upToDateProject);
  };

  const handleBack = () => navigate("/requests");

  // ABM Handlers
  const openCreateModal = () => {
    const maxOrder = activityTypes.reduce((max, item) => Math.max(max, item.order), 0);
    setCurrentType({ order: maxOrder + 1, status: "Activa", requiresReplacement: false, type: "", visibility: "all", allowedProjectIds: [] });
    setIsAbmModalOpen(true);
  };

  const openEditModal = (item: RequestConfigType) => {
    setCurrentType({ ...item, allowedProjectIds: item.allowedProjectIds || [] });
    setIsAbmModalOpen(true);
  };

  const handleSaveType = async () => {
    if (!currentType.type?.trim()) {
      sweetAlert.error("Error", "El nombre del tipo es requerido");
      return;
    }
    try {
      const payload = {
        name: currentType.type,
        requiresReplacement: currentType.requiresReplacement,
        isActive: currentType.status === "Activa",
        status: currentType.status,
        order: currentType.order,
        visibility: currentType.visibility,
        allowedProjectIds: currentType.allowedProjectIds,
      };

      if (currentType.id) {
        await activityLogTypesAPI.update(currentType.id, payload);
        sweetAlert.success("Actualizado", "El tipo de novedad ha sido actualizado.");
      } else {
        await activityLogTypesAPI.create(payload);
        sweetAlert.success("Creado", "El tipo de novedad ha sido creado.");
      }
      fetchTypes();
      setIsAbmModalOpen(false);
    } catch (error) {
      console.error("Error saving type:", error);
      sweetAlert.error("Error", "No se pudo guardar el tipo");
    }
  };

  const handleDeleteType = async (id: string) => {
    const result = await sweetAlert.confirm("¿Estás seguro?", "Esta acción eliminará el tipo de novedad permanentemente.");
    if (result.isConfirmed) {
      try {
        await activityLogTypesAPI.delete(id);
        fetchTypes();
        sweetAlert.success("Eliminado", "El tipo de novedad ha sido eliminado.");
      } catch (error) {
        sweetAlert.error("Error", "No se pudo eliminar el tipo");
      }
    }
  };

  const handleToggleActive = async (item: RequestConfigType) => {
    try {
      const newStatus = item.status === "Activa" ? "Inactiva" : "Activa";
      setActivityTypes((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: newStatus } : p)));
      await activityLogTypesAPI.update(item.id, { isActive: newStatus === "Activa", status: newStatus });
    } catch (error) {
      fetchTypes();
    }
  };

  const handleToggleReplacement = async (item: RequestConfigType) => {
    try {
      const newVal = !item.requiresReplacement;
      setActivityTypes((prev) => prev.map((p) => (p.id === item.id ? { ...p, requiresReplacement: newVal } : p)));
      await activityLogTypesAPI.update(item.id, { requiresReplacement: newVal });
    } catch (error) {
      fetchTypes();
    }
  };

  const handleToggleProjectForType = async (item: RequestConfigType) => {
    if (!modalSelectedProject) return;
    if (item.visibility === "all") {
      sweetAlert.info("Tipo Global", "Los tipos globales están habilitados en todos los proyectos automáticamente.");
      return;
    }
    try {
      const currentIds = item.allowedProjectIds || [];
      const isIncluded = currentIds.includes(modalSelectedProject._id);
      const newIds = isIncluded ? currentIds.filter((id) => id !== modalSelectedProject._id) : [...currentIds, modalSelectedProject._id];

      setActivityTypes((prev) => prev.map((p) => (p.id === item.id ? { ...p, allowedProjectIds: newIds } : p)));
      await activityLogTypesAPI.update(item.id, { allowedProjectIds: newIds });
    } catch (error) {
      fetchTypes();
      sweetAlert.error("Error", "No se pudo actualizar la disponibilidad");
    }
  };

  // Reorder Handlers
  const handleStartReorder = () => setIsReorderMode(true);
  const handleCancelReorder = () => setIsReorderMode(false);
  const handleSaveReorder = async () => {
    const reorderedDetails = activityTypes.map((item, index) => ({ ...item, order: index + 1 }));
    setActivityTypes(reorderedDetails);
    try {
      await activityLogTypesAPI.reorder(reorderedDetails.map((d) => ({ id: d.id, order: d.order })));
      setIsReorderMode(false);
      sweetAlert.success("Orden Guardado", "El nuevo orden ha sido guardado.");
      fetchTypes();
    } catch (error) {
      sweetAlert.error("Error", "No se pudo guardar el orden");
      fetchTypes();
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setActivityTypes((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSaveGlossary = () => {
    setSavingGlossary(true);
    setTimeout(() => {
      overtimeUtils.saveGlossary(glossary);
      setSavingGlossary(false);
      sweetAlert.success("Glosario Guardado", "La configuración de horas extras se ha actualizado correctamente.");
    }, 500);
  };

  const tabClass = (isActive: boolean) => `px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${isActive ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`;

  return (
    <PageLayout
      title="Novedades | Configuración"
      faIcon={{ icon: faCog }}
      onBack={handleBack}
      shouldShowInfo={false}
      searchAndFilters={
        <div className="mx-auto">
          {/* Tabs Header */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 sticky top-[140px] z-20 bg-white dark:bg-gray-900">
            <button className={tabClass(activeTab === "general")} onClick={() => setActiveTab("general")}>
              General
            </button>
            <button className={tabClass(activeTab === "types")} onClick={() => setActiveTab("types")}>
              Tipos de ausencias
            </button>
            <button className={tabClass(activeTab === "project")} onClick={() => setActiveTab("project")}>
              Frecuencia
            </button>
            <button className={tabClass(activeTab === "reports")} onClick={() => setActiveTab("reports")}>
              Reportes de Novedades
            </button>
            <button className={tabClass(activeTab === "glossary")} onClick={() => setActiveTab("glossary")}>
              Glosario de Extras
            </button>
          </div>

          {/* Tab Content */}
          <div className="animate-in fade-in duration-300">
            {/* ===================== GENERAL SETTINGS TAB ===================== */}
            {activeTab === "general" && (
              <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div className="space-y-8">
                  {/* Intro Section (Explanation) */}
                  <div>
                    <div className="flex items-start gap-4">
                      <div className="mt-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FontAwesomeIcon icon={faMobileAlt} size="lg" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Configuración Aplicación Mobile</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-3">Define cómo cada proyecto reporta sus novedades.</p>
                        <ul className="text-sm text-gray-500 dark:text-gray-400 space-y-2 mb-0">
                          <li className="flex items-start gap-2">
                            <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded uppercase mt-0.5">Activado</span>
                            <div>
                              <strong className="text-gray-700 dark:text-gray-300">Reporte Rápido (Acortador):</strong>
                              <span className="block text-xs mt-0.5">La App pregunta "¿Hubo novedades?". Si respondes "NO", el reporte se cierra automáticamente. Ideal para proyectos con pocas incidencias.</span>
                            </div>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="bg-gray-200 text-gray-600 text-xs font-bold px-2 py-0.5 rounded uppercase mt-0.5">Desactivado</span>
                            <div>
                              <strong className="text-gray-700 dark:text-gray-300">Wizard Detallado (Uno por uno):</strong>
                              <span className="block text-xs mt-0.5">Obliga a confirmar la asistencia de cada colaborador individualmente. Ideal para control estricto de asistencia.</span>
                            </div>
                          </li>
                        </ul>
                        {/* Personal Adicional Explanation */}
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <div className="flex items-start gap-3">
                            <div className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0">
                              <FontAwesomeIcon icon={faUserPlus} />
                            </div>
                            <div>
                              <h4 className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Personal Adicional</h4>
                              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-1">
                                Cuando está <strong className="text-green-600 dark:text-green-400">activado</strong>, al finalizar el wizard de novedades se mostrará una pantalla adicional donde el coordinador puede incluir colaboradores que <em>no están asignados</em> al proyecto. Útil para registrar personal prestado de otros equipos o reemplazos temporales.
                              </p>
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                Si está <strong>desactivado</strong>, solo se podrá reportar sobre el personal asignado al proyecto.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Projects List Section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <FontAwesomeIcon icon={faBriefcase} />
                        Listado de Proyectos
                      </h4>
                      <span className="text-xs text-gray-400">Total: {allProjects.length}</span>
                    </div>

                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                      {allProjects.map((project) => {
                        // Logic: usage of config on project level.
                        // Default to TRUE (Fast Entry) if no specific config is set (since we removed global fallback from UI)
                        const conf = project.activityLogConfig;
                        // If useGlobalConfig is true (legacy) or undefined, we assume Default behavior (Fast Entry = True)
                        // Unless we want to force explicit choice? Let's assume Default is Fast Entry.

                        let isActive = true; // Default
                        if (conf && conf.useGlobalConfig === false && conf.enableFastEntry !== undefined) {
                          isActive = conf.enableFastEntry;
                        } else if (conf && conf.useGlobalConfig === true) {
                          // Fallback to what allows the UI to show 'Active' by default for migration
                          isActive = true;
                        }

                        // Additional Staff Config
                        const allowsAdditionalStaff = conf?.allowsAdditionalStaff ?? false;

                        const handleToggle = async () => {
                          try {
                            const newState = !isActive;
                            const newConfig = {
                              ...conf,
                              useGlobalConfig: false,
                              enableFastEntry: newState,
                              allowsAdditionalStaff: conf?.allowsAdditionalStaff ?? false,
                            };

                            // Optimistic UI
                            setAllProjects((prev) => prev.map((p) => (p._id === project._id ? { ...p, activityLogConfig: newConfig } : p)));

                            await projectsAPI.updateProject(project._id, { activityLogConfig: newConfig });
                            // sweetAlert.toast? No, too intrusive.
                          } catch (e) {
                            sweetAlert.error("Error", "No se pudo actualizar el proyecto.");
                            loadProjects(); // Revert
                          }
                        };

                        const handleToggleAdditionalStaff = async () => {
                          try {
                            const newState = !allowsAdditionalStaff;
                            const newConfig = {
                              ...conf,
                              useGlobalConfig: false,
                              enableFastEntry: conf?.enableFastEntry ?? true,
                              allowsAdditionalStaff: newState,
                            };

                            // Optimistic UI
                            setAllProjects((prev) => prev.map((p) => (p._id === project._id ? { ...p, activityLogConfig: newConfig } : p)));

                            await projectsAPI.updateProject(project._id, { activityLogConfig: newConfig });
                          } catch (e) {
                            sweetAlert.error("Error", "No se pudo actualizar el proyecto.");
                            loadProjects(); // Revert
                          }
                        };

                        return (
                          <div key={project._id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded flex items-center justify-center font-bold text-sm ${isActive ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"}`}>{project.name.charAt(0)}</div>
                                <span className="font-semibold text-gray-900 dark:text-white">{project.name}</span>
                              </div>
                            </div>

                            {/* Configuration Options Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-13 ml-10">
                              {/* Fast Entry Toggle */}
                              <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Reporte Rápido</span>
                                  <span className="text-[10px] text-gray-400">{isActive ? "Pregunta si hubo novedades" : "Uno por uno"}</span>
                                </div>
                                <button onClick={handleToggle} className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isActive ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`} title={isActive ? "Desactivar Reporte Rápido" : "Activar Reporte Rápido"}>
                                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isActive ? "translate-x-5" : "translate-x-0"}`} />
                                </button>
                              </div>

                              {/* Additional Staff Toggle */}
                              <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Otros Presentes</span>
                                  <span className="text-[10px] text-gray-400">{allowsAdditionalStaff ? "Permite agregar personal externo" : "Solo personal asignado"}</span>
                                </div>
                                <button onClick={handleToggleAdditionalStaff} className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${allowsAdditionalStaff ? "bg-green-600" : "bg-gray-300 dark:bg-gray-600"}`} title={allowsAdditionalStaff ? "Desactivar Personal Adicional" : "Activar Personal Adicional"}>
                                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${allowsAdditionalStaff ? "translate-x-5" : "translate-x-0"}`} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ===================== TIPOS DE NOVEDADES TAB ===================== */}
            {activeTab === "types" && (
              <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center bg-gray-50/50 dark:bg-gray-800/50">
                  <div className="flex items-center gap-4 me-4">
                    <span className="text-lg font-semibold text-gray-900 dark:text-white">Gestión de Tipos de Ausencias</span>
                    <button onClick={() => setOpenTypesInfo(true)} className="text-gray-400 hover:text-blue-600">
                      <FontAwesomeIcon icon={faInfoCircle} />
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={openCreateModal} disabled={isReorderMode} className="bg-blue-600 hover:bg-blue-700 text-white w-8 h-8 rounded flex items-center justify-center">
                      <FontAwesomeIcon icon={faPlus} />
                    </button>
                    {/* Button to open Project Novelties Modal */}
                    <button
                      onClick={() => {
                        setModalSelectedProject(null);
                        setIsProjectNovedadesModalOpen(true);
                      }}
                      className="px-3 py-1.5 border border-gray-300 text-gray-300 dark:border-gray-300 dark:text-gray-300 rounded text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-900/20 transition-colors"
                    >
                      <FontAwesomeIcon icon={faBriefcase} />
                      Configurar por Proyecto
                    </button>

                    {isReorderMode ? (
                      <>
                        <button onClick={handleCancelReorder} className="px-3 py-1.5 border rounded text-sm">
                          Cancelar
                        </button>
                        <button onClick={handleSaveReorder} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">
                          Guardar Orden
                        </button>
                      </>
                    ) : (
                      <button onClick={handleStartReorder} disabled={activityTypes.length < 2} className="px-3 py-1.5 border border-blue-600 text-blue-600 rounded text-sm flex items-center gap-2">
                        <FontAwesomeIcon icon={faGripVertical} /> Ordenar
                      </button>
                    )}
                  </div>
                </div>

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs uppercase bg-gray-900 text-gray-400 font-medium">
                        <tr>
                          <th className="py-4 px-6 w-16 text-center">Ordenar</th>
                          <th className="py-4 px-6 w-16 text-center">Orden</th>
                          <th className="py-4 px-6">Tipo de ausencia</th>
                          <th className="py-4 px-6 text-center">Visibilidad</th>
                          <th className="py-4 px-6 text-center">Reemplazo Opcional</th>
                          <th className="py-4 px-6 text-center">Estado</th>
                          <th className="py-4 px-6 text-right w-32"></th>
                        </tr>
                      </thead>
                      <SortableContext items={activityTypes.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {activityTypes.map((item, index) => (
                            <SortableActivityTypeRow key={item.id} item={item} index={index} isReorderMode={isReorderMode} allProjects={allProjects} onEdit={openEditModal} onDelete={handleDeleteType} onToggleActive={handleToggleActive} onToggleReplacement={handleToggleReplacement} onStartReorder={handleStartReorder} />
                          ))}
                        </tbody>
                      </SortableContext>
                    </table>
                  </div>
                </DndContext>

                {activityTypes.length === 0 && (
                  <div className="text-center py-12">
                    <FontAwesomeIcon icon={faCog} className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">No hay tipos de novedades configurados</p>
                    <button onClick={openCreateModal} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded text-sm">
                      Crear primer tipo
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ===================== FRECUENCIA POR PROYECTO TAB ===================== */}
            {activeTab === "project" && (
              <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Seleccionar Proyecto</h3>
                  <ProjectHeaderSelector onSelectProject={handleSelectProject} selectedProjectId={selectedProject?._id} />
                </div>

                {!selectedProject && (
                  <div className="text-center py-12">
                    <FontAwesomeIcon icon={faCog} className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">Selecciona un proyecto para configurar su frecuencia de reporte</p>
                  </div>
                )}

                {selectedProject && (
                  <div className="space-y-6">
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-4">
                      <div className="flex gap-3">
                        <FontAwesomeIcon icon={faCircleInfo} className="text-blue-500 mt-1" />
                        <div>
                          <h4 className="font-medium text-blue-900 dark:text-blue-300">Frecuencia de Reporte</h4>
                          <p className="text-sm text-blue-800 dark:text-blue-200">
                            Define en qué días los empleados deben reportar novedades para el proyecto <strong>{selectedProject.name}</strong>.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-md font-semibold text-gray-800 dark:text-gray-200 mb-4">Tipo de Frecuencia</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <button onClick={() => handleTypeChange("daily")} className={`p-4 rounded border text-left transition-all ${type === "daily" ? "border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-600 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500" : "border-gray-200 hover:border-blue-300 dark:border-gray-700 dark:hover:border-gray-600"}`}>
                          <div className="font-medium mb-1">Todos los días</div>
                          <div className="text-sm opacity-70">Lunes a Domingo</div>
                        </button>
                        <button onClick={() => handleTypeChange("workdays")} className={`p-4 rounded border text-left transition-all ${type === "workdays" ? "border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-600 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500" : "border-gray-200 hover:border-blue-300 dark:border-gray-700 dark:hover:border-gray-600"}`}>
                          <div className="font-medium mb-1">Días Hábiles</div>
                          <div className="text-sm opacity-70">Lunes a Viernes</div>
                        </button>
                        <button onClick={() => handleTypeChange("custom")} className={`p-4 rounded border text-left transition-all ${type === "custom" ? "border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-600 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500" : "border-gray-200 hover:border-blue-300 dark:border-gray-700 dark:hover:border-gray-600"}`}>
                          <div className="font-medium mb-1">Personalizado</div>
                          <div className="text-sm opacity-70">Elegir días específicos</div>
                        </button>
                      </div>
                    </div>

                    {type === "custom" && (
                      <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Seleccionar días:</h4>
                        <div className="flex flex-wrap gap-3">
                          {DAYS_OF_WEEK.map((day) => (
                            <button key={day.id} onClick={() => toggleDay(day.id)} className={`w-10 h-10 rounded flex items-center justify-center font-semibold transition-all ${selectedDays.includes(day.id) ? "bg-blue-600 text-white shadow-md" : "bg-white text-gray-500 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600"}`} title={day.label}>
                              {day.short}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-3">Días seleccionados: {selectedDays.length > 0 ? selectedDays.map((d) => DAYS_OF_WEEK.find((day) => day.id === d)?.label).join(", ") : "Ninguno"}</p>
                      </div>
                    )}

                    {type !== "custom" && (
                      <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Días incluidos:</h4>
                        <div className="flex flex-wrap gap-3">
                          {DAYS_OF_WEEK.map((day) => (
                            <div key={day.id} className={`w-10 h-10 rounded flex items-center justify-center font-semibold ${selectedDays.includes(day.id) ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-400 dark:bg-gray-600 dark:text-gray-500"}`} title={day.label}>
                              {day.short}
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-3">Días seleccionados: {selectedDays.map((d) => DAYS_OF_WEEK.find((day) => day.id === d)?.label).join(", ")}</p>
                      </div>
                    )}

                    <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                      <button onClick={handleSave} disabled={savingFrequency} className="px-6 py-2.5 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50 transition-colors">
                        {savingFrequency ? (
                          <>
                            <FontAwesomeIcon icon={faSpinner} spin />
                            Guardando...
                          </>
                        ) : (
                          <>
                            <FontAwesomeIcon icon={faCheck} />
                            Guardar Frecuencia
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ===================== REPORTES DE NOVEDADES TAB ===================== */}
            {activeTab === "reports" && (
              <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div className="text-center py-12">
                  <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FontAwesomeIcon icon={faCalendarAlt} size="2x" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Configuración de Reportes</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">Esta sección permitirá configurar formatos y envíos automáticos de los reportes de novedades por correo electrónico (Próximamente).</p>
                </div>
              </div>
            )}

            {/* ===================== GLOSARIO DE EXTRAS TAB ===================== */}
            {activeTab === "glossary" && (
              <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-8">
                <div className="flex items-center justify-between mb-8 border-b border-gray-100 dark:border-gray-700 pb-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">Glosario de Horas Extras</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Define los porcentajes de recargo y los rangos horarios para el cálculo automático.</p>
                    </div>
                  </div>
                  <button onClick={handleSaveGlossary} disabled={savingGlossary} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center gap-2 transition-all shadow-md hover:shadow-lg disabled:opacity-50">
                    <FontAwesomeIcon icon={savingGlossary ? faSpinner : faSave} spin={savingGlossary} />
                    {savingGlossary ? "Guardando..." : "Guardar Cambios"}
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left Column: Schedules */}
                  <div className="space-y-6">
                    {/* Weekdays */}
                    <div className="bg-gray-50 dark:bg-gray-900/40 p-5 rounded-2xl border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center text-gray-500 shadow-sm border border-gray-100 dark:border-gray-700 text-xs font-black">LV</div>
                        <h4 className="font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider text-xs">Jornada Diurna (Lunes a Viernes)</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 ml-1">Inicio de Rango</label>
                          <input type="time" value={glossary.weekdayDayStart} onChange={(e) => setGlossary({ ...glossary, weekdayDayStart: e.target.value })} className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-800 text-sm font-semibold" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 ml-1">Fin de Rango</label>
                          <input type="time" value={glossary.weekdayDayEnd} onChange={(e) => setGlossary({ ...glossary, weekdayDayEnd: e.target.value })} className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-800 text-sm font-semibold" />
                        </div>
                      </div>
                      <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/10 p-3 rounded-xl border border-amber-100 dark:border-amber-900/30">
                        <div className="flex-1">
                          <span className="text-xs font-bold text-amber-800 dark:text-amber-400">Recargo Diurno</span>
                          <p className="text-[10px] text-amber-600/70">Horas trabajadas dentro de este rango.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="number" value={glossary.pct50} onChange={(e) => setGlossary({ ...glossary, pct50: Number(e.target.value) })} className="w-16 p-2 rounded-lg border border-amber-200 dark:bg-gray-800 text-center font-black text-amber-700" />
                          <span className="font-bold text-amber-600">%</span>
                        </div>
                      </div>
                    </div>

                    {/* Saturdays */}
                    <div className="bg-gray-50 dark:bg-gray-900/40 p-5 rounded-2xl border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center text-gray-500 shadow-sm border border-gray-100 dark:border-gray-700 text-xs font-black">S</div>
                        <h4 className="font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider text-xs">Jornada Diurna (Sábados)</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 ml-1">Inicio de Rango</label>
                          <input type="time" value={glossary.satDayStart} onChange={(e) => setGlossary({ ...glossary, satDayStart: e.target.value })} className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-800 text-sm font-semibold" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 ml-1">Fin de Rango</label>
                          <input type="time" value={glossary.satDayEnd} onChange={(e) => setGlossary({ ...glossary, satDayEnd: e.target.value })} className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-800 text-sm font-semibold" />
                        </div>
                      </div>
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-xl text-[10px] text-blue-600 italic">Nota: Fuera de estos rangos, las horas se calculan automáticamente con el Recargo del 100%.</div>
                    </div>
                  </div>

                  {/* Right Column: Calculations & Defaults */}
                  <div className="space-y-6">
                    {/* Calculation Base */}
                    <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-2xl border border-blue-100 dark:border-blue-900/30">
                      <div className="flex items-center gap-3 mb-4">
                        <FontAwesomeIcon icon={faFileInvoiceDollar} className="text-blue-500" />
                        <h4 className="font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wider text-xs">Base de Cálculo</h4>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Divisor de Sueldo (Mensual)</label>
                          <div className="flex items-center gap-3">
                            <input type="number" value={glossary.salaryDivisorPercentage} onChange={(e) => setGlossary({ ...glossary, salaryDivisorPercentage: Number(e.target.value) })} className="w-24 p-2.5 rounded-xl border border-blue-200 dark:bg-gray-800 font-black text-center text-blue-700" min="1" max="1000" />
                          </div>
                          <p className="text-[11px] text-blue-600/60 mt-2 italic leading-relaxed">Este valor se usa para obtener el valor hora base: (Sueldo Mensual / Divisor).</p>
                        </div>
                      </div>
                    </div>

                    {/* 100% Recargo */}
                    <div className="bg-red-50 dark:bg-red-900/10 p-6 rounded-2xl border border-red-100 dark:border-red-900/30">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black">!</div>
                        <h4 className="font-bold text-red-800 dark:text-red-300 uppercase tracking-wider text-xs">Recargo Especial (100%)</h4>
                      </div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Valor de Recargo</span>
                        <div className="flex items-center gap-2">
                          <input type="number" value={glossary.pct100} onChange={(e) => setGlossary({ ...glossary, pct100: Number(e.target.value) })} className="w-20 p-2 rounded-xl border border-red-200 dark:bg-gray-800 text-center font-black text-red-700" />
                          <span className="font-bold text-red-600">%</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-red-600/70">
                          <FontAwesomeIcon icon={faCheck} className="text-[10px]" />
                          <span className="text-[11px] font-medium">Aplicado a Domingos y Feriados</span>
                        </div>
                        <div className="flex items-center gap-2 text-red-600/70">
                          <FontAwesomeIcon icon={faCheck} className="text-[10px]" />
                          <span className="text-[11px] font-medium">Aplicado a Horarios Nocturnos (fuera de rangos LV/S)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      }
    >
      {/* ===================== MODAL: CREAR/EDITAR TIPO ===================== */}
      <Modal
        isOpen={isAbmModalOpen}
        onClose={() => setIsAbmModalOpen(false)}
        title={currentType.id ? "Editar Tipo" : "Nuevo Tipo"}
        size="md"
        footer={
          <div className="flex gap-3 w-full">
            <button onClick={() => setIsAbmModalOpen(false)} className="flex-1 px-4 py-2 border rounded">
              Cancelar
            </button>
            <button onClick={handleSaveType} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded">
              Guardar
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium mb-1">Nombre del Tipo</label>
            <input type="text" value={currentType.type || ""} onChange={(e) => setCurrentType({ ...currentType, type: e.target.value })} className="w-full border rounded p-2.5 dark:bg-gray-700 dark:border-gray-600" placeholder="Ej. Llegada Tarde" />
          </div>

          {/* Disponibilidad en Proyectos - Unified Section */}
          <div className="border rounded p-4 bg-gray-50 dark:bg-gray-800/50 dark:border-gray-700">
            <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-3">Disponibilidad en Proyectos</label>

            {/* Cards for Global / Specific */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button type="button" onClick={() => setCurrentType({ ...currentType, visibility: "all" })} className={`p-3 rounded border text-left transition-all ${currentType.visibility === "all" ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500" : "border-gray-200 dark:border-gray-600 hover:border-gray-300"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <FontAwesomeIcon icon={faGlobe} className={`${currentType.visibility === "all" ? "text-blue-600" : "text-gray-400"}`} />
                  <span className={`font-medium ${currentType.visibility === "all" ? "text-blue-700 dark:text-blue-400" : "text-gray-700 dark:text-gray-300"}`}>Global</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Disponible en todos los proyectos</p>
              </button>

              <button type="button" onClick={() => setCurrentType({ ...currentType, visibility: "specific" })} className={`p-3 rounded border text-left transition-all ${currentType.visibility === "specific" ? "border-green-500 bg-green-50 dark:bg-green-900/20 ring-2 ring-green-500" : "border-gray-200 dark:border-gray-600 hover:border-gray-300"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <FontAwesomeIcon icon={faUsers} className={`${currentType.visibility === "specific" ? "text-green-600" : "text-gray-400"}`} />
                  <span className={`font-medium ${currentType.visibility === "specific" ? "text-green-700 dark:text-green-400" : "text-gray-700 dark:text-gray-300"}`}>Específico</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Solo proyectos seleccionados</p>
              </button>
            </div>

            {/* Project List - Only shown when Specific is selected */}
            {currentType.visibility === "specific" && (
              <div className="border-t border-gray-200 dark:border-gray-600 pt-3">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Selecciona los proyectos donde estará disponible:</p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {allProjects.map((p) => {
                    const isEnabled = (currentType.allowedProjectIds || []).includes(p._id);
                    return (
                      <div key={p._id} className="flex justify-between items-center bg-white dark:bg-gray-700 p-2 rounded border border-gray-200 dark:border-gray-600">
                        <span className="text-sm text-gray-900 dark:text-white">{p.name}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const ids = currentType.allowedProjectIds || [];
                            const newIds = isEnabled ? ids.filter((id) => id !== p._id) : [...ids, p._id];
                            setCurrentType({ ...currentType, allowedProjectIds: newIds });
                          }}
                          className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${isEnabled ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300"}`}
                        >
                          <FontAwesomeIcon icon={isEnabled ? faToggleOn : faToggleOff} />
                          {isEnabled ? "Sí" : "No"}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {(currentType.allowedProjectIds?.length || 0) === 0 && <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">⚠ No hay proyectos seleccionados. Esta novedad no estará disponible.</p>}
              </div>
            )}
          </div>

          {/* Opciones Adicionales */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-900 dark:text-white">Opciones</label>

            <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <div>
                <span className="text-sm font-medium">Reemplazo Opcional</span>
                <p className="text-xs text-gray-500">Permite asignar un reemplazo al reportar</p>
              </div>
              <button type="button" onClick={() => setCurrentType({ ...currentType, requiresReplacement: !currentType.requiresReplacement })} className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-2 ${currentType.requiresReplacement ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-300"}`}>
                <FontAwesomeIcon icon={currentType.requiresReplacement ? faToggleOn : faToggleOff} />
                {currentType.requiresReplacement ? "Sí" : "No"}
              </button>
            </div>

            <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <div>
                <span className="text-sm font-medium">Estado</span>
                <p className="text-xs text-gray-500">Si está inactivo, no aparecerá al reportar</p>
              </div>
              <button type="button" onClick={() => setCurrentType({ ...currentType, status: currentType.status === "Activa" ? "Inactiva" : "Activa" })} className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-2 ${currentType.status === "Activa" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-300"}`}>
                <FontAwesomeIcon icon={currentType.status === "Activa" ? faToggleOn : faToggleOff} />
                {currentType.status === "Activa" ? "Activo" : "Inactivo"}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ===================== MODAL: NOVEDADES POR PROYECTO ===================== */}
      <Modal isOpen={isProjectNovedadesModalOpen} onClose={() => setIsProjectNovedadesModalOpen(false)} title="Configurar Novedades por Proyecto" size="lg">
        <div className="space-y-6">
          {/* Project Selector with Info Button */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Selecciona un proyecto:</label>
            </div>
            <ProjectHeaderSelector onSelectProject={setModalSelectedProject} selectedProjectId={modalSelectedProject?._id} />
          </div>

          {/* Novelties Grid */}
          {modalSelectedProject && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Novedades habilitadas para <strong className="text-gray-900 dark:text-white text-xl">"{modalSelectedProject.name}"</strong>
                </p>
                <button type="button" onClick={() => setShowProjectNovedadesInfo(true)} className="text-gray-400 hover:text-blue-600 transition-colors">
                  <FontAwesomeIcon icon={faCircleInfo} />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2">
                {activityTypes.map((item) => {
                  const isGlobal = item.visibility === "all";
                  const isIncluded = isGlobal || (item.allowedProjectIds || []).includes(modalSelectedProject._id);
                  return (
                    <div key={item.id} className={`flex items-center justify-between p-3 border rounded transition-colors ${isIncluded ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800" : "bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-700"}`}>
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900 dark:text-white">{item.type}</span>
                        {isGlobal ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 w-fit">
                            <FontAwesomeIcon icon={faGlobe} />
                            Global
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 w-fit">
                            <FontAwesomeIcon icon={faUsers} />
                            Específico
                          </span>
                        )}
                      </div>
                      <button onClick={() => handleToggleProjectForType(item)} disabled={isGlobal} className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-2 transition-all ${isIncluded ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-300 text-gray-700 hover:bg-gray-400 dark:bg-gray-600 dark:text-gray-300"} ${isGlobal ? "opacity-60 cursor-not-allowed" : ""}`}>
                        <FontAwesomeIcon icon={isIncluded ? faToggleOn : faToggleOff} />
                        {isIncluded ? "Habilitado" : "Deshabilitado"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!modalSelectedProject && (
            <div className="text-center py-8">
              <FontAwesomeIcon icon={faBriefcase} className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">Selecciona un proyecto para ver sus novedades</p>
            </div>
          )}
        </div>
      </Modal>

      {/* ===================== MODAL: INFO TIPOS ===================== */}
      <Modal
        isOpen={openTypesInfo}
        onClose={() => setOpenTypesInfo(false)}
        title="Información"
        size="md"
        footer={
          <button onClick={() => setOpenTypesInfo(false)} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">
            Entendido
          </button>
        }
      >
        <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
          <p>
            <strong>Global:</strong> El tipo de ausencia está disponible para todos los proyectos
          </p>
          <p>
            <strong>Específico:</strong> El tipo de ausencia solo estará disponible en los proyectos que selecciones manualmente.
          </p>
        </div>
      </Modal>

      {/* ===================== INFO MODAL: NOVEDADES POR PROYECTO ===================== */}
      <InfoModal isOpen={showProjectNovedadesInfo} onClose={() => setShowProjectNovedadesInfo(false)} title="Visibilidad de Novedades">
        <div className="text-sm text-gray-600 dark:text-gray-300 space-y-4">
          <div className="flex items-start gap-3">
            <FontAwesomeIcon icon={faGlobe} className="text-blue-500 mt-1" />
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">Global</p>
              <p>La novedad está habilitada en todos los proyectos automáticamente. No se puede deshabilitar por proyecto individual.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <FontAwesomeIcon icon={faUsers} className="text-gray-400 mt-1" />
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">Específico</p>
              <p>Puedes habilitar o deshabilitar la novedad en proyectos específicos. Solo estará disponible en los proyectos que selecciones.</p>
            </div>
          </div>
        </div>
      </InfoModal>
    </PageLayout>
  );
};
