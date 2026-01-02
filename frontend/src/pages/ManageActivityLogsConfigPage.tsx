import React, { useState, useEffect } from "react";
import { PageLayout } from "../components/ui/PageLayout";
import { ProjectHeaderSelector } from "../components/activity_logs_config/ProjectHeaderSelector";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faBars, faCog, faPlus, faGripLines, faGripVertical, faTrash, faToggleOn, faToggleOff, faInfoCircle, faPenToSquare } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";
import { ReportSchedule } from "../types/activityTypes";
import { sweetAlert } from "../utils/sweetAlert";
import { activityLogTypesAPI } from "../api/activityLogTypes";
import { Modal } from "../components/ui/Modal";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  id: string; // Map from _id
  order: number;
  type: string; // Map from name
  requiresReplacement: boolean;
  status: "Activa" | "Inactiva"; // Map from isActive
}

interface SortableRowProps {
  item: ActivityType;
  index: number;
  isReorderMode: boolean;
  onEdit: (item: ActivityType) => void;
  onDelete: (id: string) => void;
  onToggleActive: (item: ActivityType) => void;
  onToggleReplacement: (item: ActivityType) => void;
  onStartReorder: () => void;
}

const SortableRow: React.FC<SortableRowProps> = ({ item, index, isReorderMode, onEdit, onDelete, onToggleActive, onToggleReplacement, onStartReorder }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !isReorderMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} {...(isReorderMode ? { ...attributes, ...listeners } : {})} className={`border-b border-gray-100 dark:border-gray-700 ${isReorderMode ? "bg-blue-50 dark:bg-blue-900/20 cursor-grab active:cursor-grabbing" : "hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group"}`}>
      <td className="py-4 px-6 text-center">
        <button
          onClick={(e) => {
            if (!isReorderMode) {
              e.preventDefault();
              onStartReorder();
            }
          }}
          className={`flex items-center justify-center w-full h-full border-none bg-transparent ${isReorderMode ? "text-blue-600 dark:text-blue-400 cursor-grab active:cursor-grabbing" : "text-gray-400 dark:text-gray-600 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"}`}
          title={isReorderMode ? "Arrastrar para ordenar" : "Activar reordenamiento"}
        >
          <FontAwesomeIcon icon={faGripVertical} />
        </button>
      </td>
      <td className="py-4 px-6 text-center font-medium text-gray-900 dark:text-white">{index + 1}</td>
      <td className="py-4 px-6 font-medium text-gray-900 dark:text-gray-100">{item.type}</td>
      <td className="py-4 px-6 text-center">
        <button onClick={() => onToggleReplacement(item)} disabled={isReorderMode} className={`mx-auto px-3 py-1 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${item.requiresReplacement ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"} ${isReorderMode ? "opacity-50 cursor-not-allowed" : ""}`}>
          <FontAwesomeIcon icon={item.requiresReplacement ? faToggleOn : faToggleOff} />
          {item.requiresReplacement ? "Habilitado" : "Deshabilitado"}
        </button>
      </td>
      <td className="py-4 px-6 text-center">
        <button onClick={() => onToggleActive(item)} disabled={isReorderMode} className={`mx-auto px-3 py-1 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${item.status === "Activa" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"} ${isReorderMode ? "opacity-50 cursor-not-allowed" : ""}`}>
          <FontAwesomeIcon icon={item.status === "Activa" ? faToggleOn : faToggleOff} />
          {item.status}
        </button>
      </td>
      <td className="py-4 px-6 text-right">
        <div className={`flex items-center justify-end gap-3 ${isReorderMode ? "opacity-30" : ""}`}>
          <button onClick={() => !isReorderMode && onEdit(item)} disabled={isReorderMode} className={`text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${isReorderMode ? "cursor-not-allowed" : ""}`} title="Editar">
            <FontAwesomeIcon icon={faPenToSquare} />
          </button>
          <button onClick={() => !isReorderMode && onDelete(item.id)} disabled={isReorderMode} className={`text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors ${isReorderMode ? "cursor-not-allowed" : ""}`} title="Eliminar">
            <FontAwesomeIcon icon={faTrash} />
          </button>
        </div>
      </td>
    </tr>
  );
};

export const ManageActivityLogsConfigPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"global" | "types">("global");
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [type, setType] = useState<ReportSchedule["type"]>("daily");
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Default workdays
  const [openInfo, setOpenInfo] = useState(false);

  // ABM State
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [isAbmModalOpen, setIsAbmModalOpen] = useState(false);
  const [currentType, setCurrentType] = useState<Partial<ActivityType>>({});

  useEffect(() => {
    fetchTypes();
  }, []);

  const fetchTypes = async () => {
    try {
      const data = await activityLogTypesAPI.getAll();
      const mapped: ActivityType[] = data.map((d: any) => ({
        id: d._id,
        order: d.order,
        type: d.name,
        requiresReplacement: d.requiresReplacement,
        status: d.isActive ? "Activa" : "Inactiva",
      }));
      setActivityTypes(mapped);
    } catch (error) {
      console.error("Error fetching types:", error);
      sweetAlert.error("Error", "No se pudieron cargar los tipos de novedades");
    }
  };

  // Types Info Modal State
  const [openTypesInfo, setOpenTypesInfo] = useState(false);

  // Reorder State
  const [isReorderMode, setIsReorderMode] = useState(false);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  const typesInfoContent = (
    <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
      <p>
        Los <strong className="text-gray-900 dark:text-white">Tipos de Novedades</strong> son las diferentes razones por las cuales un empleado puede reportar una incidencia en su asistencia o jornada laboral.
      </p>
      <ul className="list-disc pl-5 space-y-2">
        <li>
          <strong className="text-gray-900 dark:text-white">Nombre:</strong> Identificador claro de la novedad (ej: Enfermedad, Llegada Tarde).
        </li>
        <li>
          <strong className="text-gray-900 dark:text-white">Reemplazo Opcional:</strong> Si se activa, permite al usuario especificar quién cubrirá sus funciones durante la ausencia.
        </li>
        <li>
          <strong className="text-gray-900 dark:text-white">Visibilidad:</strong> Permite ocultar tipos de novedades que ya no se utilizan sin eliminarlos del historial.
        </li>
      </ul>
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
    setCurrentType({ order: maxOrder + 1, status: "Activa", requiresReplacement: false, type: "" });
    setIsAbmModalOpen(true);
  };

  const openEditModal = (item: ActivityType) => {
    setCurrentType({ ...item });
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
        order: currentType.order,
      };

      if (currentType.id) {
        // Update
        await activityLogTypesAPI.update(currentType.id, payload);
        sweetAlert.success("Actualizado", "El tipo de novedad ha sido actualizado.");
      } else {
        // Create
        await activityLogTypesAPI.create(payload);
        sweetAlert.success("Creado", "El tipo de novedad ha sido creado.");
      }
      fetchTypes(); // Reload
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
        console.error("Error deleting type:", error);
        sweetAlert.error("Error", "No se pudo eliminar el tipo");
      }
    }
  };

  const handleToggleActive = async (item: ActivityType) => {
    try {
      const newStatus = item.status === "Activa" ? "Inactiva" : "Activa";
      // Optimistic update
      setActivityTypes((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: newStatus } : p)));

      await activityLogTypesAPI.update(item.id, { status: newStatus });
    } catch (error) {
      console.error("Error toggling active:", error);
      fetchTypes(); // Revert on error
    }
  };

  const handleToggleReplacement = async (item: ActivityType) => {
    try {
      const newVal = !item.requiresReplacement;
      // Optimistic update
      setActivityTypes((prev) => prev.map((p) => (p.id === item.id ? { ...p, requiresReplacement: newVal } : p)));

      await activityLogTypesAPI.update(item.id, { requiresReplacement: newVal });
    } catch (error) {
      console.error("Error toggling replacement:", error);
      fetchTypes();
    }
  };

  // Reorder Handlers
  const handleStartReorder = () => {
    setIsReorderMode(true);
  };

  const handleCancelReorder = () => {
    setIsReorderMode(false);
  };

  const handleSaveReorder = async () => {
    // Update the 'order' property for each item based on current index
    const reorderedDetails = activityTypes.map((item, index) => ({
      ...item,
      order: index + 1,
    }));
    setActivityTypes(reorderedDetails); // Optimistic

    try {
      await activityLogTypesAPI.reorder(reorderedDetails.map((d) => ({ id: d.id, order: d.order })));
      setIsReorderMode(false);
      sweetAlert.success("Orden Guardado", "El nuevo orden ha sido guardado.");
      fetchTypes(); // Ensure sync
    } catch (error) {
      console.error("Error reordering:", error);
      sweetAlert.error("Error", "No se pudo guardar el orden");
      fetchTypes(); // Revert
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
            <span>Tipos de Novedades</span>
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
              <div className="flex items-center gap-4 w-full">
                {isReorderMode ? (
                  <>
                    <button onClick={handleCancelReorder} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm">
                      <span>Cancelar</span>
                    </button>
                    <button onClick={handleSaveReorder} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
                      <FontAwesomeIcon icon={faCheck} />
                      <span>Guardar Orden</span>
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-semibold text-gray-900 dark:text-white">Tipos de Novedades</span>
                      <button onClick={() => setOpenTypesInfo(true)} className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Más información">
                        <FontAwesomeIcon icon={faInfoCircle} />
                      </button>
                    </div>
                    <button onClick={openCreateModal} className="bg-blue-600 hover:bg-blue-700 text-white w-8 h-8 rounded-lg flex items-center justify-center transition-colors shadow-sm" title="Agregar Nuevo Tipo">
                      <FontAwesomeIcon icon={faPlus} className="text-sm" />
                    </button>
                    <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>
                    <button onClick={handleStartReorder} disabled={activityTypes.length < 2} className="flex items-center gap-2 px-4 py-2 bg-transparent border border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400 rounded-lg text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      <FontAwesomeIcon icon={faGripLines} />
                      <span>Ordenar</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {isReorderMode && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100 text-sm border-b border-blue-100 dark:border-blue-800/30">
                <FontAwesomeIcon icon={faGripVertical} className="mr-2" />
                <strong>Modo de reordenamiento activo:</strong> Arrastra las filas para cambiar el orden.
              </div>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-gray-900 text-gray-400 font-medium">
                    <tr>
                      <th className="py-4 px-6 w-16 text-center">Ordenar</th>
                      <th className="py-4 px-6 w-16 text-center">Orden</th>
                      <th className="py-4 px-6">Tipo</th>
                      <th className="py-4 px-6 text-center">Reemplazo Opcional</th>
                      <th className="py-4 px-6 text-center">Estado</th>
                      <th className="py-4 px-6 text-right w-32"></th>
                    </tr>
                  </thead>
                  <SortableContext items={activityTypes.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {activityTypes.map((item, index) => (
                        <SortableRow key={item.id} item={item} index={index} isReorderMode={isReorderMode} onEdit={openEditModal} onDelete={handleDeleteType} onToggleActive={handleToggleActive} onToggleReplacement={handleToggleReplacement} onStartReorder={handleStartReorder} />
                      ))}
                    </tbody>
                  </SortableContext>
                </table>
              </div>
            </DndContext>
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
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del Tipo</label>
                  <input type="text" value={currentType.type || ""} onChange={(e) => setCurrentType({ ...currentType, type: e.target.value })} className="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm focus:ring-blue-500 focus:border-blue-500 p-2.5 border" placeholder="Ej. Llegada Tarde" />
                </div>

                <div className="flex flex-col gap-3 py-2 w-fit">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Reemplazo Opcional</label>
                  <button type="button" onClick={() => setCurrentType({ ...currentType, requiresReplacement: !currentType.requiresReplacement })} className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors flex items-center gap-2 ${currentType.requiresReplacement ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"}`}>
                    <FontAwesomeIcon icon={currentType.requiresReplacement ? faToggleOn : faToggleOff} />
                    {currentType.requiresReplacement ? "Habilitado" : "Deshabilitado"}
                  </button>
                </div>

                <div className="flex flex-col gap-3 py-2 w-fit">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Estado</label>
                  <button type="button" onClick={() => setCurrentType({ ...currentType, status: currentType.status === "Activa" ? "Inactiva" : "Activa" })} className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors flex items-center gap-2 ${currentType.status === "Activa" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"}`}>
                    <FontAwesomeIcon icon={currentType.status === "Activa" ? faToggleOn : faToggleOff} />
                    {currentType.status === "Activa" ? "Activa" : "Inactiva"}
                  </button>
                </div>
              </div>
            </Modal>

            {/* Types Info Modal */}
            <Modal
              isOpen={openTypesInfo}
              onClose={() => setOpenTypesInfo(false)}
              title="Información de Tipos de Novedades"
              size="md"
              footer={
                <button onClick={() => setOpenTypesInfo(false)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  Entendido
                </button>
              }
            >
              {typesInfoContent}
            </Modal>
          </div>
        )}
      </div>
    </PageLayout>
  );
};
