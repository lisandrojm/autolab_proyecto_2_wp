import React, { useState, useEffect } from "react";
import { PageLayout } from "../components/ui/PageLayout";
import { ProjectHeaderSelector } from "../components/activity_logs_config/ProjectHeaderSelector";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faBars, faCog, faPlus, faGripLines, faGripVertical, faPen, faTrash } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";
import { ReportSchedule } from "../types/activityTypes";
import { sweetAlert } from "../utils/sweetAlert";
import { Modal } from "../components/ui/Modal";

const DAYS_OF_WEEK = [
  { id: 0, label: "Domingo" },
  { id: 1, label: "Lunes" },
  { id: 2, label: "Martes" },
  { id: 3, label: "Miércoles" },
  { id: 4, label: "Jueves" },
  { id: 5, label: "Viernes" },
  { id: 6, label: "Sábado" },
];

interface ActivityType {
  id: string;
  order: number;
  type: string;
  futureAction: string;
  status: "Activa" | "Inactiva";
}

export const ManageActivityLogsConfigPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"global" | "types">("global");
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [type, setType] = useState<ReportSchedule["type"]>("daily");
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Default workdays
  const [openInfo, setOpenInfo] = useState(false);

  // ABM State
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([
    { id: "1", order: 1, type: "Llegada Tarde", futureAction: "Otra Acción Futura", status: "Activa" },
    { id: "2", order: 2, type: "Ausencia Sin Aviso", futureAction: "Otra Acción Futura", status: "Activa" },
    { id: "3", order: 3, type: "Enfermedad", futureAction: "Presentación de Documento", status: "Activa" },
  ]);
  const [isAbmModalOpen, setIsAbmModalOpen] = useState(false);
  const [currentType, setCurrentType] = useState<Partial<ActivityType>>({});

  // Help integration
  const infoContent = (
    <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
      <p>
        La <strong className="text-gray-900 dark:text-white">Frecuencia de Reporte</strong> define los días de la semana en que el coordinador debe enviar el <strong className="text-gray-900 dark:text-white">Reporte Diario de Novedades</strong> para este proyecto.
      </p>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
          <div>
            <strong className="text-gray-900 dark:text-white">Todos los días:</strong> Se requiere un reporte cada día, de lunes a domingo.
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
          <div>
            <strong className="text-gray-900 dark:text-white">Días Hábiles:</strong> Se requiere un reporte solo de lunes a viernes.
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
          <div>
            <strong className="text-gray-900 dark:text-white">Personalizado:</strong> Permite seleccionar días específicos según las necesidades del proyecto.
          </div>
        </div>
      </div>
    </div>
  );

  // Simulate loading schedule when project changes
  useEffect(() => {
    if (selectedProject) {
      setType("daily");
      setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    }
  }, [selectedProject]);

  const handleTypeChange = (newType: ReportSchedule["type"]) => {
    setType(newType);
    if (newType === "daily") {
      setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    } else if (newType === "workdays") {
      setSelectedDays([1, 2, 3, 4, 5]);
    }
  };

  const toggleDay = (dayId: number) => {
    if (type !== "custom") return;
    setSelectedDays((prev) => (prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId]));
  };

  const handleSave = () => {
    console.log("Saving schedule for", selectedProject?.name, { type, days: selectedDays });
    sweetAlert.success("Configuración Guardada", `Se ha actualizado la frecuencia para ${selectedProject?.name || "el proyecto"}`);
  };

  const handleBack = () => {
    navigate("/hr/activity-logs");
  };

  // ABM Handlers
  const openCreateModal = () => {
    // Current default order is simple: existing max order + 1
    const maxOrder = activityTypes.reduce((max, item) => Math.max(max, item.order), 0);
    setCurrentType({ order: maxOrder + 1, status: "Activa", futureAction: "Ninguna", type: "" });
    setIsAbmModalOpen(true);
  };

  const openEditModal = (item: ActivityType) => {
    setCurrentType({ ...item });
    setIsAbmModalOpen(true);
  };

  const handleSaveType = () => {
    if (!currentType.type?.trim()) {
      sweetAlert.error("Error", "El nombre del tipo es requerido");
      return;
    }

    if (currentType.id) {
      // Update
      setActivityTypes((prev) => prev.map((p) => (p.id === currentType.id ? ({ ...currentType } as ActivityType) : p)));
      sweetAlert.success("Actualizado", "El tipo de novedad ha sido actualizado.");
    } else {
      // Create
      const newId = Math.random().toString(36).substr(2, 9);
      setActivityTypes((prev) => [...prev, { ...currentType, id: newId } as ActivityType]);
      sweetAlert.success("Creado", "El tipo de novedad ha sido creado.");
    }
    setIsAbmModalOpen(false);
  };

  const handleDeleteType = (id: string) => {
    sweetAlert.confirm("¿Estás seguro?", "Esta acción eliminará el tipo de novedad permanentemente.", () => {
      setActivityTypes((prev) => prev.filter((p) => p.id !== id));
      sweetAlert.success("Eliminado", "El tipo de novedad ha sido eliminado.");
    });
  };

  return (
    <PageLayout
      title="Novedades | Configuración"
      subtitle="Configura la frecuencia y tipos de novedades"
      faIcon={{ icon: faCog }}
      onBack={handleBack}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: "Configuración de Novedades",
        size: "md",
        content: infoContent,
      }}
      shouldShowInfo={true}
    >
      <div className="mx-auto space-y-6 animate-fade-in">
        {/* Tabs Navigation */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
          <button onClick={() => setActiveTab("global")} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === "global" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}>
            <FontAwesomeIcon icon={faCog} />
            Configuración Global
          </button>
          <button onClick={() => setActiveTab("types")} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === "types" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}>
            <FontAwesomeIcon icon={faBars} />
            Tipos de Novedades
          </button>
        </div>

        {/* Global Config Tab */}
        {activeTab === "global" && (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Seleccionar Proyecto</h3>
              <ProjectHeaderSelector onSelectProject={setSelectedProject} selectedProjectId={selectedProject?._id} />
            </div>

            {selectedProject && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-8">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Frecuencia de Reporte</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <button onClick={() => handleTypeChange("daily")} className={`p-4 rounded-lg border text-sm font-medium transition-all ${type === "daily" ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-2 ring-blue-600" : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700"}`}>
                      <div className="mb-1 text-lg">Todos los días</div>
                      <div className="text-sm opacity-70">Lunes a Domingo</div>
                    </button>
                    <button onClick={() => handleTypeChange("workdays")} className={`p-4 rounded-lg border text-sm font-medium transition-all ${type === "workdays" ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-2 ring-blue-600" : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700"}`}>
                      <div className="mb-1 text-lg">Días Hábiles</div>
                      <div className="text-sm opacity-70">Lunes a Viernes</div>
                    </button>
                    <button onClick={() => handleTypeChange("custom")} className={`p-4 rounded-lg border text-sm font-medium transition-all ${type === "custom" ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-2 ring-blue-600" : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700"}`}>
                      <div className="mb-1 text-lg">Personalizado</div>
                      <div className="text-sm opacity-70">Elegir días específicos</div>
                    </button>
                  </div>
                </div>

                <div className={`transition-opacity duration-300 ${type === "custom" ? "opacity-100" : "opacity-50 pointer-events-none grayscale"}`}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Días requeridos</label>
                  <div className="flex flex-wrap gap-3">
                    {DAYS_OF_WEEK.map((day) => {
                      const isSelected = selectedDays.includes(day.id);
                      return (
                        <button
                          key={day.id}
                          onClick={() => toggleDay(day.id)}
                          disabled={type !== "custom"}
                          className={`
                            w-12 h-12 rounded-full flex items-center justify-center text-base font-semibold transition-all
                            ${isSelected ? "bg-blue-600 text-white shadow-md scale-110" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}
                          `}
                          title={day.label}
                        >
                          {day.label.charAt(0)}
                        </button>
                      );
                    })}
                  </div>
                  {type !== "custom" && <p className="text-sm text-gray-500 mt-3">Selecciona "Personalizado" para editar días específicos.</p>}
                </div>

                <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-gray-700">
                  <button onClick={handleSave} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm">
                    <FontAwesomeIcon icon={faCheck} />
                    Guardar Configuración
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Activity Types (ABM) Tab */}
        {activeTab === "types" && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
              <div className="flex items-center gap-4">
                <button onClick={openCreateModal} className="bg-blue-600 hover:bg-blue-700 text-white w-10 h-10 rounded-lg flex items-center justify-center transition-colors shadow-sm" title="Agregar Nuevo Tipo">
                  <FontAwesomeIcon icon={faPlus} className="text-sm" />
                </button>
                <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>
                <button className="flex items-center gap-2 px-4 py-2 bg-transparent border border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400 rounded-lg text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                  <FontAwesomeIcon icon={faGripLines} />
                  <span>Ordenar</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-gray-900 text-gray-400 font-medium">
                  <tr>
                    <th className="py-4 px-6 w-16 text-center">Ordenar</th>
                    <th className="py-4 px-6 w-16 text-center">Orden</th>
                    <th className="py-4 px-6">Tipo</th>
                    <th className="py-4 px-6">Acción Futura</th>
                    <th className="py-4 px-6 text-center">Estado</th>
                    <th className="py-4 px-6 text-right w-32"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {activityTypes
                    .sort((a, b) => a.order - b.order)
                    .map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group">
                        <td className="py-4 px-6 text-center">
                          <FontAwesomeIcon icon={faGripVertical} className="text-gray-400 cursor-grab active:cursor-grabbing hover:text-gray-600 dark:hover:text-gray-300 transition-colors" />
                        </td>
                        <td className="py-4 px-6 text-center font-medium text-gray-900 dark:text-white">{item.order}</td>
                        <td className="py-4 px-6 font-medium text-gray-900 dark:text-gray-100">{item.type}</td>
                        <td className="py-4 px-6">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${item.futureAction === "Presentación de Documento" ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>{item.futureAction || "Ninguna"}</span>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${item.status === "Activa" ? "bg-green-500" : "bg-gray-400"}`}></div>
                            <span className={`text-xs font-medium ${item.status === "Activa" ? "text-green-600 dark:text-green-400" : "text-gray-500"}`}>{item.status}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEditModal(item)} className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Editar">
                              <FontAwesomeIcon icon={faPen} />
                            </button>
                            <button onClick={() => handleDeleteType(item.id)} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors" title="Eliminar">
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 text-xs text-center text-gray-500 dark:text-gray-400">Mostrando {activityTypes.length} tipos de novedades configurados</div>

            {/* ABM Modal */}
            <Modal
              isOpen={isAbmModalOpen}
              onClose={() => setIsAbmModalOpen(false)}
              title={currentType.id ? "Editar Tipo de Novedad" : "Nuevo Tipo de Novedad"}
              size="md"
              footer={
                <>
                  <button onClick={() => setIsAbmModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={handleSaveType} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm">
                    {currentType.id ? "Guardar Cambios" : "Crear Tipo"}
                  </button>
                </>
              }
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del Tipo</label>
                  <input type="text" value={currentType.type || ""} onChange={(e) => setCurrentType({ ...currentType, type: e.target.value })} className="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm focus:ring-blue-500 focus:border-blue-500 p-2.5 border" placeholder="Ej. Llegada Tarde" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Acción Futura</label>
                  <select value={currentType.futureAction || "Ninguna"} onChange={(e) => setCurrentType({ ...currentType, futureAction: e.target.value })} className="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm focus:ring-blue-500 focus:border-blue-500 p-2.5 border">
                    <option value="Ninguna">Ninguna</option>
                    <option value="Presentación de Documento">Presentación de Documento</option>
                    <option value="Otra Acción Futura">Otra Acción Futura</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Estado</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="status" checked={currentType.status === "Activa"} onChange={() => setCurrentType({ ...currentType, status: "Activa" })} className="text-blue-600 focus:ring-blue-500" />
                      <span className="text-sm text-gray-900 dark:text-white">Activa</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="status" checked={currentType.status === "Inactiva"} onChange={() => setCurrentType({ ...currentType, status: "Inactiva" })} className="text-blue-600 focus:ring-blue-500" />
                      <span className="text-sm text-gray-900 dark:text-white">Inactiva</span>
                    </label>
                  </div>
                </div>
              </div>
            </Modal>
          </div>
        )}
      </div>
    </PageLayout>
  );
};
