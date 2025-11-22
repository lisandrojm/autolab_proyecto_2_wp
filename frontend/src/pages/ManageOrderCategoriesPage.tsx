import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faPlus, faEdit, faTrash, faList, faToggleOn, faToggleOff, faGripVertical, faCircleInfo, faShoppingCart } from "@fortawesome/free-solid-svg-icons";
import { orderCategoriesAPI, OrderCategory, CategoryType, DateMode, Subtype, TipoAccionFutura } from "../api/orderCategories";
import { PageLayout } from "../components/ui/PageLayout";
import { InfoModal } from "../components/ui/InfoModal";
import { sweetAlert } from "../utils/sweetAlert";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { tipoAccionFuturaLabels } from "../types/futureAction";
import { getHelp, hasHelp } from "../data/help/helpContent";

interface SortableRowProps {
  category: OrderCategory;
  index: number;
  isReorderMode: boolean;
  onEdit: (category: OrderCategory) => void;
  onDelete: (category: OrderCategory) => void;
  onToggleActive: (category: OrderCategory) => void;
}

const SortableRow: React.FC<SortableRowProps> = ({ category, index, isReorderMode, onEdit, onDelete, onToggleActive }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category._id, disabled: !isReorderMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} {...(isReorderMode ? { ...attributes, ...listeners } : {})} className={`border-b border-gray-100 dark:border-gray-700 ${isReorderMode ? "bg-blue-50 dark:bg-blue-900/20 cursor-grab active:cursor-grabbing" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"}`}>
      <td className="py-3 px-4 text-center">
        <div className={`flex items-center justify-center ${isReorderMode ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-600"}`}>
          <FontAwesomeIcon icon={faGripVertical} className="h-5 w-5" />
        </div>
      </td>
      <td className="py-3 px-4 text-center">
        <span className="text-sm font-medium">{index + 1}</span>
      </td>
      <td className="py-3 px-4">
        <div className="font-medium text-gray-900 dark:text-gray-100">{category.name}</div>
      </td>
      <td className="py-3 px-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">{category.description || "-"}</div>
      </td>
      <td className="py-3 px-4 text-center">
        <button onClick={() => onToggleActive(category)} disabled={isReorderMode} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${category.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"} ${isReorderMode ? "opacity-50 cursor-not-allowed" : ""}`}>
          <FontAwesomeIcon icon={category.isActive ? faToggleOn : faToggleOff} className="mr-1" />
          {category.isActive ? "Activa" : "Inactiva"}
        </button>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => onEdit(category)} disabled={isReorderMode} className={`p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors ${isReorderMode ? "opacity-50 cursor-not-allowed" : ""}`} title="Editar">
            <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
          </button>
          <button onClick={() => onDelete(category)} disabled={isReorderMode} className={`p-1.5 rounded-lg bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 transition-colors ${isReorderMode ? "opacity-50 cursor-not-allowed" : ""}`} title="Eliminar">
            <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
};

const HELP_KEY = "orderCategories";

export const ManageOrderCategoriesPage: React.FC = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<OrderCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<OrderCategory | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    isActive: boolean;
    categoryType: CategoryType;
    dateMode: DateMode;
    requiresAction: boolean;
    actionText: string;
    futureActionType: TipoAccionFutura | "";
    subtipos: Subtype[];
    plazoDias?: number;
    fechaLimite?: string;
    documentoRequerido?: string;
  }>({
    name: "",
    description: "",
    isActive: true,
    categoryType: "fecha",
    dateMode: "single",
    requiresAction: false,
    actionText: "",
    futureActionType: "sinVencimiento",
    subtipos: [],
    plazoDias: undefined,
    fechaLimite: undefined,
    documentoRequerido: undefined,
  });
  const [submitting, setSubmitting] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [tempCategories, setTempCategories] = useState<OrderCategory[]>([]);

  const [showMainInfo, setShowMainInfo] = useState(false);
  const [showCategoryTypeInfo, setShowCategoryTypeInfo] = useState(false);
  const [showDateModeInfo, setShowDateModeInfo] = useState(false);
  const [showSubcategoriesInfo, setShowSubcategoriesInfo] = useState(false);
  const [showActionTypeInfo, setShowActionTypeInfo] = useState(false);
  const [showActionTextInfo, setShowActionTextInfo] = useState(false);

  const helpEntry = getHelp(HELP_KEY);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const loadCategories = async () => {
    try {
      setLoading(true);
      const data = await orderCategoriesAPI.getAll();
      setCategories(data);
    } catch (error) {
      console.error("Error loading categories:", error);
      sweetAlert.error("Error", "No se pudieron cargar los tipos de pedidos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const openCreateModal = () => {
    setEditingCategory(null);
    setFormData({
      name: "",
      description: "",
      isActive: true,
      categoryType: "fecha",
      dateMode: "single",
      requiresAction: false,
      actionText: "",
      futureActionType: "sinVencimiento",
      subtipos: [],
      plazoDias: undefined,
      fechaLimite: undefined,
      documentoRequerido: undefined,
    });
    setShowModal(true);
  };

  const openEditModal = (category: OrderCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || "",
      isActive: category.isActive,
      categoryType: category.categoryType || "fecha",
      dateMode: category.dateMode || "single",
      requiresAction: category.requiresAction || false,
      actionText: category.actionText || "",
      futureActionType: category.futureActionType || "sinVencimiento",
      subtipos: category.config?.subtipos || [],
      plazoDias: category.plazoDias,
      fechaLimite: category.fechaLimite,
      documentoRequerido: category.documentoRequerido,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (formData.requiresAction && !formData.actionText.trim()) {
        sweetAlert.error("Error", "Debes especificar el texto de la acción requerida");
        setSubmitting(false);
        return;
      }

      if (formData.requiresAction && !formData.futureActionType) {
        sweetAlert.error("Error", "Debes seleccionar el tipo de acción futura");
        setSubmitting(false);
        return;
      }

      if (formData.requiresAction && formData.futureActionType) {
        if (formData.futureActionType === "plazoDias" || formData.futureActionType === "vencimientoSistema") {
          if (!formData.plazoDias || formData.plazoDias < 1 || formData.plazoDias > 365) {
            sweetAlert.error("Error", "El plazo en días debe estar entre 1 y 365");
            setSubmitting(false);
            return;
          }
        }

        if (formData.futureActionType === "fechaEspecifica") {
          if (!formData.fechaLimite) {
            sweetAlert.error("Error", "Debes especificar una fecha límite");
            setSubmitting(false);
            return;
          }
          const selectedDate = new Date(formData.fechaLimite);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (selectedDate < today) {
            sweetAlert.error("Error", "La fecha límite no puede ser una fecha pasada");
            setSubmitting(false);
            return;
          }
        }

        if (formData.futureActionType === "presentacionDocumento") {
          if (!formData.documentoRequerido || !formData.documentoRequerido.trim()) {
            sweetAlert.error("Error", "Debes especificar el documento requerido");
            setSubmitting(false);
            return;
          }
        }
      }

      const payload: any = {
        name: formData.name,
        description: formData.description,
        isActive: formData.isActive,
        categoryType: formData.categoryType,
        dateMode: formData.categoryType === "fecha" ? formData.dateMode : undefined,
        requiresAction: formData.requiresAction,
        actionText: formData.requiresAction ? formData.actionText : undefined,
        futureActionType: formData.requiresAction && formData.futureActionType ? formData.futureActionType : undefined,
        config: formData.subtipos.length > 0 ? { subtipos: formData.subtipos } : undefined,
      };

      if (formData.requiresAction && formData.futureActionType) {
        if (formData.futureActionType === "plazoDias" || formData.futureActionType === "vencimientoSistema") {
          payload.plazoDias = formData.plazoDias;
        } else {
          payload.plazoDias = undefined;
        }

        if (formData.futureActionType === "fechaEspecifica" || (formData.futureActionType === "presentacionDocumento" && formData.fechaLimite)) {
          payload.fechaLimite = formData.fechaLimite;
        } else {
          payload.fechaLimite = undefined;
        }

        if (formData.futureActionType === "presentacionDocumento") {
          payload.documentoRequerido = formData.documentoRequerido;
        } else {
          payload.documentoRequerido = undefined;
        }
      } else {
        payload.plazoDias = undefined;
        payload.fechaLimite = undefined;
        payload.documentoRequerido = undefined;
      }

      if (editingCategory) {
        await orderCategoriesAPI.update(editingCategory._id, payload);
        sweetAlert.success("Categoría actualizada", "La categoría se actualizó correctamente");
      } else {
        await orderCategoriesAPI.create(payload);
        sweetAlert.success("Categoría creada", "La categoría se creó correctamente");
      }
      setShowModal(false);
      loadCategories();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo guardar la categoría");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (category: OrderCategory) => {
    const result = await sweetAlert.confirm("¿Eliminar categoría?", `¿Estás seguro de eliminar la categoría "${category.name}"?`);
    if (!result.isConfirmed) return;

    try {
      await orderCategoriesAPI.delete(category._id);
      sweetAlert.success("Categoría eliminada", "La categoría se eliminó correctamente");
      loadCategories();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo eliminar la categoría");
    }
  };

  const handleToggleActive = async (category: OrderCategory) => {
    try {
      await orderCategoriesAPI.update(category._id, { isActive: !category.isActive });
      loadCategories();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo actualizar el estado");
    }
  };

  const handleStartReorder = () => {
    setIsReorderMode(true);
    setTempCategories([...categories]);
  };

  const handleCancelReorder = () => {
    setIsReorderMode(false);
    setTempCategories([]);
  };

  const handleSaveReorder = async () => {
    const reorderData = tempCategories.map((cat, index) => ({
      id: cat._id,
      sortOrder: index + 1,
    }));

    try {
      await orderCategoriesAPI.reorder(reorderData);
      sweetAlert.success("Orden guardado", "El orden de los tipos de pedidos se actualizó correctamente");
      setIsReorderMode(false);
      setTempCategories([]);
      loadCategories();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo guardar el orden");
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setTempCategories((items) => {
        const oldIndex = items.findIndex((item) => item._id === active.id);
        const newIndex = items.findIndex((item) => item._id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleFutureActionTypeChange = (newType: TipoAccionFutura | "") => {
    setFormData({
      ...formData,
      futureActionType: newType,
      plazoDias: undefined,
      fechaLimite: undefined,
      documentoRequerido: undefined,
    });
  };

  const renderFutureActionConditionalFields = () => {
    if (!formData.futureActionType) return null;

    switch (formData.futureActionType) {
      case "plazoDias":
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Plazo en Días *</label>
            <input type="number" min="1" max="365" value={formData.plazoDias || ""} onChange={(e) => setFormData({ ...formData, plazoDias: parseInt(e.target.value) || undefined })} required className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Ej: 10" />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">El sistema calculará automáticamente la fecha límite</p>
          </div>
        );

      case "fechaEspecifica":
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha Límite *</label>
            <input type="date" value={formData.fechaLimite || ""} onChange={(e) => setFormData({ ...formData, fechaLimite: e.target.value })} required min={new Date().toISOString().split("T")[0]} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
          </div>
        );

      case "presentacionDocumento":
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Documento Requerido *</label>
              <input type="text" value={formData.documentoRequerido || ""} onChange={(e) => setFormData({ ...formData, documentoRequerido: e.target.value })} required className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Ej: DNI escaneado, Certificado médico..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha Límite (Opcional)</label>
              <input type="date" value={formData.fechaLimite || ""} onChange={(e) => setFormData({ ...formData, fechaLimite: e.target.value })} min={new Date().toISOString().split("T")[0]} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        );

      case "vencimientoSistema":
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Plazo Predefinido (Días) *</label>
            <input type="number" min="1" max="365" value={formData.plazoDias || 7} onChange={(e) => setFormData({ ...formData, plazoDias: parseInt(e.target.value) || 7 })} required className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">El sistema define automáticamente este plazo según reglas internas</p>
          </div>
        );

      case "vencimientoInterno":
        return (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">Un área interna debe evaluar y asignar una fecha de vencimiento. El pedido quedará en estado "En Revisión" hasta que se cargue la fecha límite.</p>
          </div>
        );

      case "sinVencimiento":
        return (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">No tiene fecha límite, pero debe ser gestionada y marcada como cumplida manualmente.</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <PageLayout
      title="Tipos de Pedidos"
      subtitle="Administra los tipos de pedidos que se muestran en el formulario de pedidos"
      faIcon={{ icon: faList }}
      onBack={() => navigate("/hr/orders")}
      shouldShowInfo={hasHelp(HELP_KEY)}
      infoModal={{
        isOpen: showMainInfo,
        onOpen: () => setShowMainInfo(true),
        onClose: () => setShowMainInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      headerActions={
        <div className="flex items-center gap-3">
          {isReorderMode ? (
            <>
              <button onClick={handleCancelReorder} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2">
                <span>Cancelar</span>
              </button>
              <button onClick={handleSaveReorder} className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-2">
                <span>Guardar Orden</span>
              </button>
            </>
          ) : (
            <>
              <button onClick={openCreateModal} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
                <FontAwesomeIcon icon={faPlus} />
                <span className="hidden lg:block">Nuevo Tipo de Pedido</span>
              </button>
              <button onClick={() => navigate("/orders")} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
                <FontAwesomeIcon icon={faShoppingCart} className="h-3 w-3 lg:h-4 lg:w-4" />
                <span className="hidden lg:block">Pedidos</span>
              </button>
              <button onClick={handleStartReorder} disabled={categories.length < 2} className="px-4 py-2 rounded-lg border border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                <FontAwesomeIcon icon={faGripVertical} />
                <span className="hidden lg:block">Ordenar</span>
              </button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        <div>
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <FontAwesomeIcon icon={faSpinner} spin className="text-4xl text-blue-600" />
            </div>
          ) : (
            <>
              {isReorderMode && (
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-blue-900 dark:text-blue-100 text-sm">
                    <FontAwesomeIcon icon={faGripVertical} className="mr-2" />
                    <strong>Modo de reordenamiento activo:</strong> Arrastra las filas para cambiar el orden. Haz clic en "Guardar Orden" para confirmar los cambios o "Cancelar" para descartarlos.
                  </p>
                </div>
              )}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 w-24">Ordenar</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 w-16">Orden</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Nombre</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Descripción</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Estado</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 w-48">Acciones</th>
                      </tr>
                    </thead>
                    <SortableContext items={(isReorderMode ? tempCategories : categories).map((c) => c._id)} strategy={verticalListSortingStrategy}>
                      <tbody>
                        {(isReorderMode ? tempCategories : categories).map((category, index) => (
                          <SortableRow key={category._id} category={category} index={index} isReorderMode={isReorderMode} onEdit={openEditModal} onDelete={handleDelete} onToggleActive={handleToggleActive} />
                        ))}
                      </tbody>
                    </SortableContext>
                  </table>
                </div>
              </DndContext>

              {categories.length === 0 && (
                <div className="text-center py-12">
                  <FontAwesomeIcon icon={faList} className="h-16 w-16 text-gray-400 mb-4" />
                  <p className="text-gray-600 dark:text-gray-400 mb-4">No hay los tipos de pedido registradas</p>
                  <button onClick={openCreateModal} className="btn-primary">
                    Crear Primer Tipo de Pedido
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{editingCategory ? "Editar Tipo de Pedido" : "Nuevo Tipo de Pedido"}</h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Nombre del tipo de pedido" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción (opcional)</label>
                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Describe el tipo de pedido..." />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de Dato *</label>
                  <button type="button" onClick={() => setShowCategoryTypeInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors" title="Ver información">
                    <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                  </button>
                </div>
                <select required value={formData.categoryType} onChange={(e) => setFormData({ ...formData, categoryType: e.target.value as CategoryType })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                  <option value="fecha">Fecha</option>
                  <option value="dinero">Dinero</option>
                  <option value="objeto">Objeto</option>
                  <option value="otros">Otros</option>
                </select>
              </div>

              {formData.categoryType === "fecha" && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Modo de Fecha *</label>
                    <button type="button" onClick={() => setShowDateModeInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors" title="Ver información">
                      <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                    </button>
                  </div>
                  <select required value={formData.dateMode} onChange={(e) => setFormData({ ...formData, dateMode: e.target.value as DateMode })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                    <option value="single">Fecha única</option>
                    <option value="range">Rango de fechas (Desde - Hasta)</option>
                  </select>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Opciones del Pedido (opcional)</label>
                    <button type="button" onClick={() => setShowSubcategoriesInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors" title="Ver información">
                      <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newId = `sub_${Date.now()}`;
                      setFormData({
                        ...formData,
                        subtipos: [...formData.subtipos, { id: newId, label: "" }],
                      });
                    }}
                    className="text-sm px-2 py-1 bg-blue-100 dark:bg-blue-500 text-blue-700 dark:text-white rounded hover:bg-blue-200"
                  >
                    + Agregar Opciones
                  </button>
                </div>

                {formData.subtipos.length > 0 && (
                  <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg p-2">
                    {formData.subtipos.map((subtipo, index) => (
                      <div key={subtipo.id} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Nombre de subcategoría"
                          value={subtipo.label}
                          onChange={(e) => {
                            const newSubtipos = [...formData.subtipos];
                            newSubtipos[index].label = e.target.value;
                            setFormData({ ...formData, subtipos: newSubtipos });
                          }}
                          className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm text-gray-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({
                              ...formData,
                              subtipos: formData.subtipos.filter((_, i) => i !== index),
                            });
                          }}
                          className="text-red-600 hover:text-red-800 text-sm px-2"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    id="requiresAction"
                    checked={formData.requiresAction}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        requiresAction: e.target.checked,
                        futureActionType: e.target.checked ? formData.futureActionType || "sinVencimiento" : "",
                        actionText: e.target.checked ? formData.actionText : "",
                        plazoDias: e.target.checked ? formData.plazoDias : undefined,
                        fechaLimite: e.target.checked ? formData.fechaLimite : undefined,
                        documentoRequerido: e.target.checked ? formData.documentoRequerido : undefined,
                      })
                    }
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="requiresAction" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Requiere acción futura del usuario
                  </label>
                </div>

                {formData.requiresAction && (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de Acción Futura *</label>
                        <button type="button" onClick={() => setShowActionTypeInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors" title="Ver información">
                          <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                        </button>
                      </div>
                      <select required={formData.requiresAction} value={formData.futureActionType} onChange={(e) => handleFutureActionTypeChange(e.target.value as TipoAccionFutura)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                        <option value="sinVencimiento">{tipoAccionFuturaLabels.sinVencimiento}</option>
                        <option value="plazoDias">{tipoAccionFuturaLabels.plazoDias}</option>
                        <option value="fechaEspecifica">{tipoAccionFuturaLabels.fechaEspecifica}</option>
                        <option value="presentacionDocumento">{tipoAccionFuturaLabels.presentacionDocumento}</option>
                        <option value="vencimientoSistema">{tipoAccionFuturaLabels.vencimientoSistema}</option>
                        <option value="vencimientoInterno">{tipoAccionFuturaLabels.vencimientoInterno}</option>
                      </select>
                    </div>

                    {renderFutureActionConditionalFields()}

                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Texto de la acción *</label>
                        <button type="button" onClick={() => setShowActionTextInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors" title="Ver información">
                          <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                        </button>
                      </div>
                      <input type="text" required={formData.requiresAction} value={formData.actionText} onChange={(e) => setFormData({ ...formData, actionText: e.target.value })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Ej: Adjunto comprobantes de gastos" />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="isActive" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" />
                <label htmlFor="isActive" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Activa (visible en el formulario)
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {submitting ? "Guardando..." : editingCategory ? "Actualizar" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <InfoModal isOpen={showCategoryTypeInfo} onClose={() => setShowCategoryTypeInfo(false)} title="Tipo de Dato" size="sm">
        <div className="text-gray-700 dark:text-gray-300">
          <p>Define qué tipo de input se mostrará en el formulario móvil cuando el usuario seleccione este tipo de pedido.</p>
        </div>
      </InfoModal>

      <InfoModal isOpen={showSubcategoriesInfo} onClose={() => setShowSubcategoriesInfo(false)} title="Opciones del Pedido" size="sm">
        <div className="text-gray-700 dark:text-gray-300">
          <p>
            Estas opciones aparecerán luego como un <strong>select obligatorio</strong> cuando el usuario elija este tipo de pedido en el formulario móvil.
          </p>
        </div>
      </InfoModal>

      <InfoModal isOpen={showActionTypeInfo} onClose={() => setShowActionTypeInfo(false)} title="Tipos de Acción Futura" size="md">
        <div className="text-gray-700 dark:text-gray-300 space-y-3">
          <p className="font-medium mb-3">Cada tipo de acción futura tiene características específicas:</p>
          <div className="space-y-2">
            <div>
              <strong className="text-blue-600 dark:text-blue-400">Plazo en Días:</strong>
              <p className="text-sm mt-1">Genera un vencimiento automático basado en días desde la creación del pedido.</p>
            </div>
            <div>
              <strong className="text-blue-600 dark:text-blue-400">Fecha Específica:</strong>
              <p className="text-sm mt-1">Asigna una fecha fija como límite para completar la acción.</p>
            </div>
            <div>
              <strong className="text-blue-600 dark:text-blue-400">Presentación de Documento:</strong>
              <p className="text-sm mt-1">Requiere que el usuario suba un documento específico.</p>
            </div>
            <div>
              <strong className="text-blue-600 dark:text-blue-400">Vencimiento por Sistema:</strong>
              <p className="text-sm mt-1">La fecha de vencimiento viene definida por un sistema externo o reglas predefinidas.</p>
            </div>
            <div>
              <strong className="text-blue-600 dark:text-blue-400">Vencimiento Interno:</strong>
              <p className="text-sm mt-1">La empresa fija la fecha de vencimiento manualmente después de revisar el pedido.</p>
            </div>
            <div>
              <strong className="text-blue-600 dark:text-blue-400">Sin Vencimiento:</strong>
              <p className="text-sm mt-1">No requiere fecha límite, pero debe ser completada y marcada manualmente.</p>
            </div>
          </div>
        </div>
      </InfoModal>

      <InfoModal isOpen={showActionTextInfo} onClose={() => setShowActionTextInfo(false)} title="Texto de la Acción" size="sm">
        <div className="text-gray-700 dark:text-gray-300">
          <p>Este texto aparecerá junto a un checkbox que el usuario debe marcar para confirmar que completará la acción requerida.</p>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Ejemplo: "Me comprometo a adjuntar los comprobantes de gastos"</p>
        </div>
      </InfoModal>

      <InfoModal isOpen={showDateModeInfo} onClose={() => setShowDateModeInfo(false)} title="Modo de Fecha" size="sm">
        <div className="text-gray-700 dark:text-gray-300 space-y-3">
          <p>Define cómo el usuario ingresará la fecha en el formulario de pedidos:</p>
          <div>
            <strong className="text-blue-600 dark:text-blue-400">Fecha única:</strong>
            <p className="text-sm mt-1">El usuario selecciona una sola fecha mediante un calendario.</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Ejemplo: Fecha de nacimiento, fecha de evento</p>
          </div>
          <div>
            <strong className="text-blue-600 dark:text-blue-400">Rango de fechas (Desde - Hasta):</strong>
            <p className="text-sm mt-1">El usuario selecciona dos fechas: una fecha de inicio y una de fin.</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Ejemplo: Período de vacaciones, duración de un proyecto</p>
          </div>
        </div>
      </InfoModal>
    </PageLayout>
  );
};
