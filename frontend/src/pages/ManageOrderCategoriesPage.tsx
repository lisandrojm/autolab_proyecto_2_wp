import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faPlus, faEdit, faTrash, faList, faToggleOn, faToggleOff, faGripVertical } from "@fortawesome/free-solid-svg-icons";
import { orderCategoriesAPI, OrderCategory } from "../api/orderCategories";
import { PageLayout } from "../components/ui/PageLayout";
import { sweetAlert } from "../utils/sweetAlert";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

export const ManageOrderCategoriesPage: React.FC = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<OrderCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<OrderCategory | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    isActive: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [tempCategories, setTempCategories] = useState<OrderCategory[]>([]);

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
      sweetAlert.error("Error", "No se pudieron cargar las categorías");
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
    });
    setShowModal(true);
  };

  const openEditModal = (category: OrderCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || "",
      isActive: category.isActive,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (editingCategory) {
        await orderCategoriesAPI.update(editingCategory._id, formData);
        sweetAlert.success("Categoría actualizada", "La categoría se actualizó correctamente");
      } else {
        await orderCategoriesAPI.create(formData);
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
      sweetAlert.success("Orden guardado", "El orden de las categorías se actualizó correctamente");
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
      title="Categorías de Pedidos"
      subtitle="Administra las categorías que se muestran en el formulario de pedidos"
      faIcon={{ icon: faList }}
      onBack={() => navigate("/hr/orders")}
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
              <button onClick={openCreateModal} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2">
                <FontAwesomeIcon icon={faPlus} />
                <span>Nueva Categoría</span>
              </button>
              <button onClick={handleStartReorder} disabled={categories.length < 2} className="px-4 py-2 rounded-lg border border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                <FontAwesomeIcon icon={faGripVertical} />
                <span>Ordenar</span>
              </button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
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
                  <p className="text-gray-600 dark:text-gray-400 mb-4">No hay categorías registradas</p>
                  <button onClick={openCreateModal} className="btn-primary">
                    Crear Primera Categoría
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
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{editingCategory ? "Editar Categoría" : "Nueva Categoría"}</h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Nombre de la categoría" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción (opcional)</label>
                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Describe la categoría..." />
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="isActive" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" />
                <label htmlFor="isActive" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Categoría activa (visible en el formulario)
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
    </PageLayout>
  );
};
