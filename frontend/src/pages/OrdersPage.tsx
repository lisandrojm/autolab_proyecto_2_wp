import React, { useEffect, useState } from "react";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Card } from "../components/ui/Card";
import { personnelAPI, OrderData } from "../api/personnel";
import { orderCategoriesAPI, OrderCategory } from "../api/orderCategories";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faShoppingCart, faPlus, faEdit, faTrash } from "@fortawesome/free-solid-svg-icons";

export const OrdersPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [categories, setCategories] = useState<OrderCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OrderData | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    amount: undefined as number | undefined,
    dynamicValue: undefined as any,
  });

  useEffect(() => {
    fetchData();
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoadingCategories(true);
      const data = await orderCategoriesAPI.getAll(true);
      setCategories(data.sort((a, b) => a.sortOrder - b.sortOrder));
      if (data.length > 0 && !formData.category) {
        setFormData((prev) => ({ ...prev, category: data[0].name }));
      }
    } catch (error) {
      console.error("Error loading categories:", error);
      sweetAlert.error("Error", "No se pudieron cargar las categorías");
    } finally {
      setLoadingCategories(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ordersData, statsData] = await Promise.allSettled([personnelAPI.getOrders(), personnelAPI.getOrderStats()]);

      if (ordersData.status === "fulfilled") setOrders(ordersData.value);
      if (statsData.status === "fulfilled") setStats(statsData.value);
    } catch (error) {
      console.error("Error fetching orders data:", error);
      sweetAlert.error("Error", "No se pudieron cargar los pedidos");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedCategory = categories.find(c => c.name === formData.category);

      if (selectedCategory?.categoryType === "fecha" && selectedCategory.dateMode === "range") {
        if (!formData.dynamicValue?.fechaDesde || !formData.dynamicValue?.fechaHasta) {
          sweetAlert.error("Error", "Debes seleccionar ambas fechas (Desde y Hasta)");
          return;
        }
        if (new Date(formData.dynamicValue.fechaDesde) > new Date(formData.dynamicValue.fechaHasta)) {
          sweetAlert.error("Error", "La fecha 'Hasta' debe ser mayor o igual a la fecha 'Desde'");
          return;
        }
      }

      if (editingOrder) {
        await personnelAPI.updateOrder(editingOrder._id, formData);
        sweetAlert.success("Pedido actualizado", "El pedido se actualizó correctamente");
      } else {
        await personnelAPI.createOrder(formData);
        sweetAlert.success("Pedido creado", "El pedido se creó correctamente");
      }
      setShowModal(false);
      setEditingOrder(null);
      setFormData({ title: "", description: "", category: categories.length > 0 ? categories[0].name : "", amount: undefined, dynamicValue: undefined });
      fetchData();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo procesar el pedido");
    }
  };

  const handleDelete = async (order: OrderData) => {
    if (order.status !== "pending") {
      sweetAlert.error("Error", "Solo se pueden eliminar pedidos pendientes");
      return;
    }
    const result = await sweetAlert.confirm("¿Eliminar pedido?", "¿Estás seguro de eliminar este pedido?");
    if (!result.isConfirmed) return;

    try {
      await personnelAPI.deleteOrder(order._id);
      sweetAlert.success("Pedido eliminado", "El pedido se eliminó correctamente");
      fetchData();
    } catch (error: any) {
      const errorMsg = error?.response?.data?.error || "No se pudo eliminar el pedido";
      sweetAlert.error("Error", errorMsg);
    }
  };

  const openEdit = (order: OrderData) => {
    if (order.status !== "pending") {
      sweetAlert.error("Error", "Solo se pueden editar pedidos pendientes");
      return;
    }
    setEditingOrder(order);
    setFormData({
      title: order.title,
      description: order.description,
      category: order.category,
      amount: order.amount,
      dynamicValue: order.dynamicValue,
    });
    setShowModal(true);
  };

  const openCreate = () => {
    setEditingOrder(null);
    setFormData({ title: "", description: "", category: categories.length > 0 ? categories[0].name : "", amount: undefined, dynamicValue: undefined });
    setShowModal(true);
  };

  if (loading) {
    return <LoadingSpinner message="Cargando pedidos..." />;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return { variant: "success" as const, text: "Aprobado" };
      case "rejected":
        return { variant: "blue" as const, text: "Rechazado" };
      case "delivered":
        return { variant: "default" as const, text: "Entregado" };
      case "cancelled":
        return { variant: "warning" as const, text: "Cancelado" };
      default:
        return { variant: "warning" as const, text: "Pendiente" };
    }
  };

  const getCategoryLabel = (category: string) => {
    return categories.find((c) => c.name === category)?.name || category;
  };

  const getUserName = (user: any) => {
    if (typeof user === "string") return "Usuario";
    return `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Usuario";
  };

  return (
    <PageLayout
      title="Pedidos"
      subtitle="Solicitudes de suministros y equipamiento"
      faIcon={{ icon: faShoppingCart }}
      headerActions={
        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-green-500 text-white uppercase">Nuevo</span>
          <button onClick={openCreate} className="btn-primary">
            <FontAwesomeIcon icon={faPlus} className="mr-2" />
            Nuevo Pedido
          </button>
        </div>
      }
      modal={{
        isOpen: showModal,
        onClose: () => {
          setShowModal(false);
          setEditingOrder(null);
        },
        title: editingOrder ? "Editar Pedido" : "Nuevo Pedido",
        subtitle: "Completa los datos de tu pedido",
        size: "md",
        actions: [
          {
            label: editingOrder ? "Actualizar" : "Crear",
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>("#order-form");
              form?.requestSubmit();
            },
            variant: "primary",
          },
          { label: "Cancelar", onClick: () => setShowModal(false), variant: "ghost" },
        ],
        content: (
          <form id="order-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Título *</label>
              <input type="text" required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="input-field" placeholder="Título del pedido" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Categoría *</label>
              {loadingCategories ? (
                <div className="input-field text-gray-500 dark:text-gray-400">Cargando categorías...</div>
              ) : categories.length > 0 ? (
                <select required value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="input-field">
                  {categories.map((cat) => (
                    <option key={cat._id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="input-field text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700">No hay categorías disponibles. Por favor, contacta al administrador.</div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Monto (opcional)</label>
              <input type="number" min="0" step="0.01" value={formData.amount || ""} onChange={(e) => setFormData({ ...formData, amount: e.target.value ? parseFloat(e.target.value) : undefined })} className="input-field" placeholder="0.00" />
            </div>
            {(() => {
              const selectedCategory = categories.find(c => c.name === formData.category);
              if (selectedCategory?.categoryType === "fecha") {
                if (selectedCategory.dateMode === "range") {
                  return (
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Rango de Fechas *</label>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Desde</label>
                          <input
                            type="date"
                            required
                            value={formData.dynamicValue?.fechaDesde || ""}
                            onChange={(e) => setFormData({ ...formData, dynamicValue: { ...formData.dynamicValue, fechaDesde: e.target.value } })}
                            className="input-field"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Hasta</label>
                          <input
                            type="date"
                            required
                            value={formData.dynamicValue?.fechaHasta || ""}
                            onChange={(e) => setFormData({ ...formData, dynamicValue: { ...formData.dynamicValue, fechaHasta: e.target.value } })}
                            className="input-field"
                          />
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha *</label>
                      <input
                        type="date"
                        required
                        value={formData.dynamicValue || ""}
                        onChange={(e) => setFormData({ ...formData, dynamicValue: e.target.value })}
                        className="input-field"
                      />
                    </div>
                  );
                }
              }
              return null;
            })()}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción *</label>
              <textarea required value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={4} className="input-field" placeholder="Describe el pedido en detalle..." />
            </div>
          </form>
        ),
      }}
    >
      <div className="space-y-6">
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">Pendientes</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.pending || 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">Aprobados</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.approved || 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">Rechazados</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.rejected || 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">Entregados</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.delivered || 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">Cancelados</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.cancelled || 0}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {orders.map((order) => {
            const badge = getStatusBadge(order.status);
            return (
              <Card
                key={order._id}
                header={{
                  title: order.title,
                  subtitle: getCategoryLabel(order.category),
                  icon: faShoppingCart,
                  badges: [{ text: badge.text, variant: badge.variant }],
                }}
                footer={{
                  leftContent: <span className="text-xs text-gray-500">{new Date(order.requestedAt).toLocaleDateString()}</span>,
                  actions:
                    order.status === "pending"
                      ? [
                          {
                            icon: faEdit,
                            onClick: () => openEdit(order),
                            title: "Editar",
                            variant: "default",
                          },
                          {
                            icon: faTrash,
                            onClick: () => handleDelete(order),
                            title: "Eliminar",
                            variant: "blue",
                          },
                        ]
                      : [],
                }}
              >
                <div className="space-y-2">
                  <p className="text-sm text-gray-600 dark:text-gray-400">{order.description}</p>
                  {order.amount && <p className="text-sm font-semibold text-gray-900 dark:text-white">Monto: ${order.amount.toFixed(2)}</p>}
                  {order.dynamicValue && (() => {
                    const category = categories.find(c => c.name === order.category);
                    if (category?.categoryType === "fecha") {
                      if (category.dateMode === "range" && order.dynamicValue.fechaDesde && order.dynamicValue.fechaHasta) {
                        return (
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            Desde: {new Date(order.dynamicValue.fechaDesde).toLocaleDateString()} - Hasta: {new Date(order.dynamicValue.fechaHasta).toLocaleDateString()}
                          </p>
                        );
                      } else if (typeof order.dynamicValue === "string") {
                        return (
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            Fecha: {new Date(order.dynamicValue).toLocaleDateString()}
                          </p>
                        );
                      }
                    }
                    return null;
                  })()}
                </div>
              </Card>
            );
          })}
        </div>

        {orders.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl">
            <FontAwesomeIcon icon={faShoppingCart} className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">No hay pedidos</p>
            <button onClick={openCreate} className="btn-primary">
              Crear Primer Pedido
            </button>
          </div>
        )}
      </div>
    </PageLayout>
  );
};
