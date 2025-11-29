import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faPlus, faEdit, faTrash, faList, faToggleOn, faToggleOff, faGripVertical, faShoppingCart, faGear } from "@fortawesome/free-solid-svg-icons";
import { orderCategoriesAPI, OrderCategory, CategoryType, DateMode, Subtype, TipoAccionFutura, DeadlineMode } from "../api/orderCategories";
import { PageLayout } from "../components/ui/PageLayout";
import { Modal } from "../components/ui/Modal";
import { sweetAlert } from "../utils/sweetAlert";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { OrderCategoryForm } from "../components/orders/OrderCategoryForm";
import { tipoAccionFuturaLabels } from "../types/futureAction";

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
        {category.categoryType === "dinero" && category.montoMaximo && <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Max: ${category.montoMaximo.toLocaleString("es-ES")}</div>}
      </td>
      <td className="py-3 px-4 text-center">
        <span className={`px-2 py-1 rounded text-xs font-medium ${category.config?.subtipos?.length ? "bg-gray-100 text-gray-800 dark:bg-gray-500/30 dark:text-gray-200" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"}`}>{category.config?.subtipos?.length ? "Sí" : "No"}</span>
      </td>
      <td className="py-3 px-4 text-center">
        {category.requiresAction ? (
          <div className="flex justify-start items-center gap-1">
            <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-500/30 dark:text-blue-200">Sí</span>
            {category.futureActionType && <span className={`px-2 py-1 rounded text-xs font-medium ${category.futureActionType === "accion" ? "bg-orange-100 text-orange-800 dark:bg-orange-500/30 dark:text-orange-200" : category.futureActionType === "documento" ? "bg-teal-100 text-teal-800 dark:bg-teal-500/30 dark:text-teal-200" : category.futureActionType === "condicion" ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/30 dark:text-cyan-200" : "bg-gray-100 text-gray-800 dark:bg-gray-500/30 dark:text-gray-200"}`}>{tipoAccionFuturaLabels[category.futureActionType]}</span>}
          </div>
        ) : (
          <span className="px-2 py-1 rounded text-xs font-medium text-gray-800 dark:text-gray-400 flex">No requiere</span>
        )}
      </td>
      <td className="py-3 px-4 text-center">
        <span className={`px-2 py-1 rounded text-xs font-medium ${(category.requiresSignature ?? true) ? "bg-green-100 text-green-800 dark:bg-green-500/30 dark:text-green-200" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"}`}>{(category.requiresSignature ?? true) ? "Sí" : "No"}</span>
      </td>
      {/*       <td className="py-3 px-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">{category.informacion || "-"}</div>
      </td> */}
      <td className="py-3 px-4 text-center">
        <button onClick={() => onToggleActive(category)} disabled={isReorderMode} className={`px-3 py-1 rounded text-xs font-medium transition-colors flex items-center flex-nowrap ${category.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 text-now flex flex-nowrap"} ${isReorderMode ? "opacity-50 cursor-not-allowed" : ""}`}>
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
    informacion: string;
    isActive: boolean;
    categoryType: CategoryType;
    dateMode: DateMode;
    montoMaximo?: number;
    requiresAction: boolean;
    actionText: string;
    actionDescription?: string;
    futureActionType: TipoAccionFutura | "";
    deadlineMode?: DeadlineMode;
    subtipos: Subtype[];
    plazoDias?: number;
    fechaLimite?: string;
    documentoRequerido?: string;
    requiresSignature: boolean;
  }>({
    name: "",
    informacion: "",
    isActive: true,
    categoryType: "fecha",
    dateMode: "single",
    montoMaximo: undefined,
    requiresAction: false,
    actionText: "",
    actionDescription: "",
    futureActionType: "sinVencimiento",
    deadlineMode: "none",
    subtipos: [],
    plazoDias: undefined,
    fechaLimite: undefined,
    documentoRequerido: undefined,
    requiresSignature: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [tempCategories, setTempCategories] = useState<OrderCategory[]>([]);

  const [showMainInfo, setShowMainInfo] = useState(false);

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
      informacion: "",
      isActive: true,
      categoryType: "fecha",
      dateMode: "single",
      montoMaximo: undefined,
      requiresAction: false,
      actionText: "",
      actionDescription: "",
      futureActionType: "sinVencimiento",
      deadlineMode: "none",
      subtipos: [],
      plazoDias: undefined,
      fechaLimite: undefined,
      documentoRequerido: undefined,
      requiresSignature: true,
    });
    setShowModal(true);
  };

  const openEditModal = (category: OrderCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      informacion: category.informacion || "",
      isActive: category.isActive,
      categoryType: category.categoryType || "fecha",
      dateMode: category.dateMode || "single",
      montoMaximo: category.montoMaximo,
      requiresAction: category.requiresAction || false,
      actionText: category.actionText || "",
      actionDescription: category.actionDescription || "",
      futureActionType: category.futureActionType || "sinVencimiento",
      deadlineMode: category.deadlineMode || "none",
      subtipos: category.config?.subtipos ?? [],
      plazoDias: category.plazoDias,
      fechaLimite: category.fechaLimite,
      documentoRequerido: category.documentoRequerido,
      requiresSignature: category.requiresSignature ?? true,
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

      if (formData.categoryType === "dinero" && formData.montoMaximo) {
        if (formData.montoMaximo % 50 !== 0) {
          sweetAlert.error("Error", "El monto máximo debe ser un múltiplo de 50 (Ej: 50, 100, 150, 200...)");
          setSubmitting(false);
          return;
        }
      }

      if (formData.requiresAction && formData.futureActionType) {
        if (formData.deadlineMode === "plazoDias") {
          if (!formData.plazoDias || formData.plazoDias < 1 || formData.plazoDias > 365) {
            sweetAlert.error("Error", "El plazo en días debe estar entre 1 y 365");
            setSubmitting(false);
            return;
          }
        }

        if (formData.deadlineMode === "fechaEspecifica") {
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

        if (formData.futureActionType === "documento") {
          if (!formData.documentoRequerido || !formData.documentoRequerido.trim()) {
            sweetAlert.error("Error", "Debes especificar el documento requerido");
            setSubmitting(false);
            return;
          }
        }
      }

      const validSubtipos = formData.subtipos.filter((subtipo) => subtipo.label.trim() !== "");

      const payload: any = {
        name: formData.name,
        informacion: formData.informacion,
        isActive: formData.isActive,
        categoryType: formData.categoryType,
        dateMode: formData.categoryType === "fecha" ? formData.dateMode : undefined,
        montoMaximo: formData.categoryType === "dinero" && formData.montoMaximo ? formData.montoMaximo : undefined,
        requiresAction: formData.requiresAction,
        actionText: formData.requiresAction ? formData.actionText : undefined,
        actionDescription: formData.requiresAction && (formData.futureActionType === "accion" || formData.futureActionType === "condicion") ? formData.actionDescription : undefined,
        futureActionType: formData.requiresAction && formData.futureActionType ? formData.futureActionType : undefined,
        deadlineMode: formData.requiresAction && formData.futureActionType !== "sinVencimiento" ? formData.deadlineMode : undefined,
        requiresSignature: formData.requiresSignature,
        config: validSubtipos.length > 0 ? { subtipos: validSubtipos } : undefined,
      };

      if (!formData.requiresAction) {
        payload.futureActionType = undefined;
        payload.deadlineMode = undefined;
        payload.plazoDias = undefined;
        payload.fechaLimite = undefined;
        payload.documentoRequerido = undefined;
      } else {
        // mantiene fecha o días si corresponden, SIN borrarlos por error
        // --- copiar EXACTAMENTE la lógica de plazoDias pero aplicada a fechaLimite ---
        if (formData.deadlineMode === "plazoDias") {
          payload.plazoDias = formData.plazoDias || undefined;
          payload.fechaLimite = undefined;
        }

        if (formData.deadlineMode === "fechaEspecifica") {
          // convertir correctamente la fecha al formato YYYY-MM-DD
          const raw = formData.fechaLimite;
          payload.fechaLimite = raw ? new Date(raw).toISOString().split("T")[0] : undefined;
          payload.plazoDias = undefined;
        }

        if (formData.deadlineMode === "none") {
          payload.plazoDias = undefined;
          payload.fechaLimite = undefined;
        }

        if (formData.futureActionType === "documento") {
          payload.documentoRequerido = formData.documentoRequerido;
        } else {
          payload.documentoRequerido = undefined;
        }
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

  return (
    <PageLayout
      title="Tipos de Pedidos"
      subtitle="Administra los tipos de pedidos que se muestran en el formulario de pedidos"
      faIcon={{ icon: faGear }}
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
              <button onClick={handleSaveReorder} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2">
                <span>Guardar Orden</span>
              </button>
            </>
          ) : (
            <>
              <button onClick={openCreateModal} className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
                <FontAwesomeIcon icon={faPlus} />
              </button>
              <button onClick={handleStartReorder} disabled={categories.length < 2} className="px-4 py-2 rounded-lg border border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                <FontAwesomeIcon icon={faGripVertical} />
                <span className="hidden lg:block">Ordenar</span>
              </button>
              {/*               <button onClick={() => navigate("/hr/orders")} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
                <FontAwesomeIcon icon={faShoppingCart} className="h-3 w-3 lg:h-4 lg:w-4" />
                <span className="hidden lg:block">Volver a Pedidos</span>
              </button> */}
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
                <div className="overflow-x-auto rounded border dark:border-slate-800">
                  <table className="w-full dark:bg-slate-800/80">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 w-24">Ordenar</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 w-16">Orden</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Tipo</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Opciones</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Acción Futura</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Firma</th>
                        {/*                         <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Información</th> */}
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
                  <p className="text-gray-600 dark:text-gray-400 mb-4">No hay los tipos de pedido registrados</p>
                  <button onClick={openCreateModal} className="btn-primary">
                    Crear Primer Tipo de Pedido
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingCategory ? "Editar Tipo de Pedido" : "Nuevo Tipo de Pedido"}
        size="lg"
        footer={
          <div className="flex gap-3 w-full">
            <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Cancelar
            </button>
            <button type="submit" form="order-category-form" disabled={submitting} className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? "Guardando..." : editingCategory ? "Actualizar" : "Crear"}
            </button>
          </div>
        }
      >
        <div className="p-6">
          <OrderCategoryForm formData={formData} setFormData={setFormData} onSubmit={handleSubmit} submitting={submitting} />
        </div>
      </Modal>
    </PageLayout>
  );
};
