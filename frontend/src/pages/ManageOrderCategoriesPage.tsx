import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faPlus, faEdit, faTrash, faList, faToggleOn, faToggleOff, faArrowUp, faArrowDown } from "@fortawesome/free-solid-svg-icons";
import { orderCategoriesAPI, OrderCategory } from "../api/orderCategories";
import { PageLayout } from "../components/ui/PageLayout";
import { sweetAlert } from "../utils/sweetAlert";

export const ManageOrderCategoriesPage: React.FC = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<OrderCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<OrderCategory | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: true,
    sortOrder: 0,
  });
  const [submitting, setSubmitting] = useState(false);

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
      name: '',
      description: '',
      isActive: true,
      sortOrder: categories.length,
    });
    setShowModal(true);
  };

  const openEditModal = (category: OrderCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      isActive: category.isActive,
      sortOrder: category.sortOrder,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (editingCategory) {
        await orderCategoriesAPI.update(editingCategory._id, formData);
        sweetAlert.success('Categoría actualizada', 'La categoría se actualizó correctamente');
      } else {
        await orderCategoriesAPI.create(formData);
        sweetAlert.success('Categoría creada', 'La categoría se creó correctamente');
      }
      setShowModal(false);
      loadCategories();
    } catch (error: any) {
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo guardar la categoría');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (category: OrderCategory) => {
    const result = await sweetAlert.confirm(
      '¿Eliminar categoría?',
      `¿Estás seguro de eliminar la categoría "${category.name}"?`
    );
    if (!result.isConfirmed) return;

    try {
      await orderCategoriesAPI.delete(category._id);
      sweetAlert.success('Categoría eliminada', 'La categoría se eliminó correctamente');
      loadCategories();
    } catch (error: any) {
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo eliminar la categoría');
    }
  };

  const handleToggleActive = async (category: OrderCategory) => {
    try {
      await orderCategoriesAPI.update(category._id, { isActive: !category.isActive });
      loadCategories();
    } catch (error: any) {
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo actualizar el estado');
    }
  };

  const handleMoveSortOrder = async (category: OrderCategory, direction: 'up' | 'down') => {
    const currentIndex = categories.findIndex(c => c._id === category._id);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= categories.length) return;

    try {
      const targetCategory = categories[targetIndex];

      await Promise.all([
        orderCategoriesAPI.update(category._id, { sortOrder: targetCategory.sortOrder }),
        orderCategoriesAPI.update(targetCategory._id, { sortOrder: category.sortOrder }),
      ]);

      loadCategories();
    } catch (error: any) {
      sweetAlert.error('Error', 'No se pudo cambiar el orden');
    }
  };

  return (
    <PageLayout
      title="Categorías de Pedidos"
      subtitle="Administra las categorías que se muestran en el formulario de pedidos"
      faIcon={{ icon: faList }}
      onBack={() => navigate('/hr/orders')}
      headerActions={
        <button
          onClick={openCreateModal}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <FontAwesomeIcon icon={faPlus} />
          <span>Nueva Categoría</span>
        </button>
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
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 w-16">Orden</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Nombre</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Descripción</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Estado</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 w-48">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((category, index) => (
                      <tr key={category._id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="py-3 px-4 text-center">
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => handleMoveSortOrder(category, 'up')}
                              disabled={index === 0}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Mover arriba"
                            >
                              <FontAwesomeIcon icon={faArrowUp} className="h-3 w-3" />
                            </button>
                            <span className="text-sm font-medium">{category.sortOrder}</span>
                            <button
                              onClick={() => handleMoveSortOrder(category, 'down')}
                              disabled={index === categories.length - 1}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Mover abajo"
                            >
                              <FontAwesomeIcon icon={faArrowDown} className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-gray-900 dark:text-gray-100">{category.name}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm text-gray-600 dark:text-gray-400">{category.description || '-'}</div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleToggleActive(category)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                              category.isActive
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                            }`}
                          >
                            <FontAwesomeIcon icon={category.isActive ? faToggleOn : faToggleOff} className="mr-1" />
                            {category.isActive ? 'Activa' : 'Inactiva'}
                          </button>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => openEditModal(category)}
                              className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
                              title="Editar"
                            >
                              <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(category)}
                              className="p-1.5 rounded-lg bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 transition-colors"
                              title="Eliminar"
                            >
                              <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {categories.length === 0 && (
                <div className="text-center py-12">
                  <FontAwesomeIcon icon={faList} className="h-16 w-16 text-gray-400 mb-4" />
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    No hay categorías registradas
                  </p>
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
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nombre *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  placeholder="Nombre de la categoría"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Descripción (opcional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe la categoría..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Orden de aparición
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) })}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Categoría activa (visible en el formulario)
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Guardando...' : editingCategory ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageLayout>
  );
};
