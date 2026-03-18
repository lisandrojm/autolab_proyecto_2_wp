import React, { useState, useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { shiftConfigsAPI, ShiftConfig } from "../api/shiftConfigs";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Card } from "../components/ui/Card";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faTrash, faPlus, faClock, faTable, faGrip, faGripVertical, faSave, faTimes } from "@fortawesome/free-solid-svg-icons";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "react-router-dom";

interface ShiftConfigFormData {
  name: string;
  description: string;
}

interface SortableRowProps {
  config: ShiftConfig;
  isReorderMode: boolean;
  index: number;
  onEdit: (config: ShiftConfig) => void;
  onDelete: (config: ShiftConfig) => void;
  onView: (config: ShiftConfig) => void;
}

const SortableRow: React.FC<SortableRowProps> = ({ config, isReorderMode, index, onEdit, onDelete, onView }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: config._id, disabled: !isReorderMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} {...(isReorderMode ? { ...attributes, ...listeners } : {})} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group cursor-pointer ${isReorderMode ? "bg-blue-50/50 dark:bg-blue-900/10 cursor-grab active:cursor-grabbing" : ""}`} onClick={() => !isReorderMode && onView(config)}>
      {isReorderMode && (
        <td className="px-6 py-4 w-16">
          <div className="text-blue-500 dark:text-blue-400 flex items-center justify-center">
            <FontAwesomeIcon icon={faGripVertical} />
          </div>
        </td>
      )}
      <td className="px-6 py-4 w-20 text-center">
        <span className="text-xs font-bold text-gray-400 bg-gray-100 dark:bg-gray-700/50 px-2 py-1 rounded-full">{index + 1}</span>
      </td>
      <td className="px-6 py-4">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{config.name}</span>
      </td>
      <td className="px-6 py-4">
        <span className="text-sm text-gray-600 dark:text-gray-400">{config.description || "—"}</span>
      </td>
      {!isReorderMode && (
        <td className="px-6 py-4 text-right">
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => onEdit(config)} className="p-1.5 text-gray-500 hover:text-blue-600 rounded transition-colors" title="Editar">
              <FontAwesomeIcon icon={faEdit} />
            </button>
            <button onClick={() => onDelete(config)} className="p-1.5 text-gray-500 hover:text-red-600 rounded transition-colors" title="Eliminar">
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
};

export const ShiftConfigsPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();

  const [shiftConfigs, setShiftConfigs] = useState<ShiftConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ShiftConfig | null>(null);
  const [formData, setFormData] = useState<ShiftConfigFormData>({
    name: "",
    description: "",
  });

  const [viewOpen, setViewOpen] = useState(false);
  const [viewConfig, setViewConfig] = useState<ShiftConfig | null>(null);

  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [tempConfigs, setTempConfigs] = useState<ShiftConfig[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    const handleResize = () => {
      const isNowLarge = window.innerWidth >= 1024;
      setIsLarge(isNowLarge);
      if (!isNowLarge) {
        setViewMode("cards");
      }
    };

    if (window.innerWidth >= 1024) {
      const saved = localStorage.getItem("shiftConfigsViewMode");
      if (saved === "table" || saved === "cards") {
        setViewMode(saved as "table" | "cards");
      }
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (isLarge) {
      localStorage.setItem("shiftConfigsViewMode", viewMode);
    }
  }, [viewMode, isLarge]);

  const canManage = hasPermission("admin_users:view");

  useEffect(() => {
    fetchShiftConfigs();
  }, []);

  const fetchShiftConfigs = async () => {
    try {
      setLoading(true);
      const response = await shiftConfigsAPI.getAll();
      setShiftConfigs(response.data);
    } catch (error) {
      console.error("Error fetching shift configs:", error);
      sweetAlert.error("Error", "No se pudieron cargar las configuraciones de turno");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingConfig(null);
    setFormData({
      name: "",
      description: "",
    });
    setShowModal(true);
  };

  const openEdit = (config: ShiftConfig) => {
    setEditingConfig(config);
    setFormData({
      name: config.name,
      description: config.description || "",
    });
    setShowModal(true);
  };

  const openView = (config: ShiftConfig) => {
    setViewConfig(config);
    setViewOpen(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingConfig(null);
  };

  const closeView = () => {
    setViewOpen(false);
    setViewConfig(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingConfig) {
        await shiftConfigsAPI.update(editingConfig._id, formData);
        sweetAlert.success("Configuración actualizada", "Los cambios se han guardado correctamente");
      } else {
        await shiftConfigsAPI.create(formData);
        sweetAlert.success("Configuración creada", "Se ha creado correctamente");
      }
      closeModal();
      fetchShiftConfigs();
    } catch (error: any) {
      const message = error.response?.data?.error || "Error al guardar la configuración";
      sweetAlert.error("Error", message);
    }
  };

  const handleDelete = async (config: ShiftConfig) => {
    const result = await sweetAlert.confirm("¿Eliminar configuración?", `¿Estás seguro de que quieres eliminar "${config.name}"?`);
    if (result.isConfirmed) {
      try {
        await shiftConfigsAPI.delete(config._id);
        sweetAlert.success("Eliminado", "Se ha eliminado correctamente");
        fetchShiftConfigs();
      } catch (error: any) {
        const message = error.response?.data?.error || "Error al eliminar";
        sweetAlert.error("Error", message);
      }
    }
  };

  const filteredConfigs = shiftConfigs.filter((t) => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch = q.length === 0 || t.name.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q);

    let matchesDate = true;
    if (startDate || endDate) {
      const createdAt = t.createdAt ? new Date(t.createdAt).getTime() : 0;
      if (startDate) {
        const start = new Date(startDate).getTime();
        matchesDate = matchesDate && createdAt >= start;
      }
      if (endDate) {
        const end = new Date(endDate).setHours(23, 59, 59, 999);
        matchesDate = matchesDate && createdAt <= end;
      }
    }

    return matchesSearch && matchesDate;
  });

  const handleStartReorder = () => {
    setViewMode("table");
    setIsReorderMode(true);
    setTempConfigs([...shiftConfigs]);
  };

  const handleCancelReorder = () => {
    setIsReorderMode(false);
    setTempConfigs([]);
  };

  const handleSaveReorder = async () => {
    try {
      const reorderData = tempConfigs.map((t, index) => ({
        id: t._id,
        sortOrder: index + 1,
      }));

      await shiftConfigsAPI.reorder(reorderData);
      sweetAlert.success("Orden guardado", "El orden se actualizó correctamente");
      setIsReorderMode(false);
      setTempConfigs([]);
      fetchShiftConfigs();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo guardar el orden");
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setTempConfigs((items) => {
        const oldIndex = items.findIndex((item) => item._id === active.id);
        const newIndex = items.findIndex((item) => item._id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  return (
    <PageLayout
      title="Configuración de Turnos"
      itemCount={filteredConfigs.length}
      subtitle="Gestiona las categorías y configuraciones de turno"
      faIcon={{ icon: faClock }}
      shouldShowInfo={false}
      headerActions={
        <div className="flex items-center gap-3">
          {isReorderMode ? (
            <>
              <button onClick={handleCancelReorder} className="px-4 py-2 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm">
                <FontAwesomeIcon icon={faTimes} />
                <span>Cancelar</span>
              </button>
              <button onClick={handleSaveReorder} className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-2 text-sm shadow-sm">
                <FontAwesomeIcon icon={faSave} />
                <span>Guardar Orden</span>
              </button>
            </>
          ) : (
            <>
              {canManage && (
                <button onClick={openCreate} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm shadow-sm">
                  <FontAwesomeIcon icon={faPlus} />
                  <span className="hidden lg:block">Nueva Configuración</span>
                </button>
              )}
              {shiftConfigs.length > 1 && (
                <button onClick={handleStartReorder} className="px-4 py-2 rounded border border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center gap-2 text-sm">
                  <FontAwesomeIcon icon={faGripVertical} />
                  <span className="hidden lg:block">Ordenar</span>
                </button>
              )}
              <button onClick={() => navigate("/shifts")} className="px-4 py-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center gap-2 text-sm">
                <FontAwesomeIcon icon={faClock} />
                <span className="hidden lg:block">Ver Turnos</span>
              </button>
            </>
          )}
        </div>
      }
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
          <div className="flex-1 w-full">
            <SearchAndFilters
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar configuraciones..."
              dateFilter={{
                startDate,
                endDate,
                onStartDateChange: setStartDate,
                onEndDateChange: setEndDate,
              }}
            />
          </div>
          {isLarge && (
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
      viewModal={{
        isOpen: viewOpen,
        onClose: closeView,
        title: viewConfig ? viewConfig.name : "Configuración",
        subtitle: viewConfig?.description,
        size: "md",
        actions: [
          ...(canManage
            ? [
                {
                  label: "Editar",
                  onClick: () => {
                    if (viewConfig) openEdit(viewConfig);
                    closeView();
                  },
                  variant: "secondary" as const,
                },
              ]
            : []),
          {
            label: "Cerrar",
            onClick: closeView,
            variant: "ghost" as const,
          },
        ],
        content: viewConfig ? (
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Descripción</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">{viewConfig.description || "—"}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Detalles</h4>
              <p className="text-xs text-gray-500">Creado el: {viewConfig.createdAt ? new Date(viewConfig.createdAt).toLocaleDateString() : "-"}</p>
            </div>
          </div>
        ) : null,
      }}
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: editingConfig ? "Editar Configuración" : "Nueva Configuración",
        subtitle: "Define nombre y descripción para este tipo de turno",
        size: "md",
        actions: [
          {
            label: editingConfig ? "Actualizar" : "Crear",
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>("#shiftconfig-form");
              form?.requestSubmit();
            },
            variant: "primary" as const,
          },
          {
            label: "Cancelar",
            onClick: closeModal,
            variant: "ghost" as const,
          },
        ],
        content: (
          <form id="shiftconfig-form" onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} className="input-field" placeholder="Ej: Mañana, Tarde, Especial" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
                <textarea value={formData.description} onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))} rows={3} className="input-field resize-none" placeholder="Descripción adicional" />
              </div>
            </div>
          </form>
        ),
      }}
    >
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando configuraciones de turno..." />
        </div>
      ) : (
        <>
          {viewMode === "cards" && !isReorderMode ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredConfigs.map((config, index) => (
                <Card
                  key={config._id}
                  onClick={() => openView(config)}
                  className="hover:scale-105 hover:shadow-lg transition-all duration-200"
                  header={{
                    title: config.name,
                    subtitle: config.description,
                    icon: faClock,
                  }}
                  footer={
                    canManage
                      ? {
                          leftContent: <span className="text-xs text-gray-500 dark:text-gray-500">{config.createdAt ? new Date(config.createdAt).toLocaleDateString() : ""}</span>,
                          actions: [
                            {
                              icon: faEdit,
                              onClick: (e) => {
                                e.stopPropagation();
                                openEdit(config);
                              },
                              title: "Editar",
                              variant: "default",
                            },
                            {
                              icon: faTrash,
                              onClick: (e) => {
                                e.stopPropagation();
                                handleDelete(config);
                              },
                              title: "Eliminar",
                              variant: "default",
                            },
                          ],
                        }
                      : undefined
                  }
                >
                  <div className="-mt-1">
                    <span className="text-xs font-bold text-gray-400 dark:text-gray-500">#{index + 1}</span>
                  </div>
                </Card>
              ))}
              {canManage && (
                <Card
                  variant="create"
                  onClick={openCreate}
                  header={{
                    title: "Nueva Configuración",
                    subtitle: "Agregar una nueva categoría de turno",
                    icon: faClock,
                  }}
                />
              )}
            </div>
          ) : (
            <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm">
              {isReorderMode && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 flex items-center gap-3">
                  <FontAwesomeIcon icon={faGripVertical} className="text-blue-500" />
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Modo Ordenar:</strong> Arrastra los elementos para cambiar su orden de visualización.
                  </p>
                </div>
              )}
              <div className="overflow-x-auto">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                        {isReorderMode && <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-16 text-center">Mover</th>}
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20 text-center">Orden</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Descripción</th>
                        {!isReorderMode && <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Acciones</th>}
                      </tr>
                    </thead>
                    <SortableContext items={(isReorderMode ? tempConfigs : filteredConfigs).map((t) => t._id)} strategy={verticalListSortingStrategy}>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                        {(isReorderMode ? tempConfigs : filteredConfigs).map((config, index) => (
                          <SortableRow key={config._id} config={config} isReorderMode={isReorderMode} index={index} onEdit={openEdit} onDelete={handleDelete} onView={openView} />
                        ))}
                      </tbody>
                    </SortableContext>
                  </table>
                </DndContext>
              </div>
            </div>
          )}
          {!loading && filteredConfigs.length === 0 && <EmptyState icon={faClock} title="No hay configuraciones" description="Comienza creando una configuración para las categorías de turno." action={canManage ? { label: "Nueva Configuración", onClick: openCreate, icon: faPlus } : undefined} />}
        </>
      )}
    </PageLayout>
  );
};
