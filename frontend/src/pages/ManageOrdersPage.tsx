import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faSearch, faCheck, faTimes, faTruck, faShoppingCart, faFilter, faList, faImage } from "@fortawesome/free-solid-svg-icons";
import { hrManagementAPI, Order } from "../api/hrManagement";
import { PageLayout } from "../components/ui/PageLayout";
import { sweetAlert } from "../utils/sweetAlert";
import { ImageModal } from "../components/ui/ImageModal";

// 🔥 IMPORTAR HELP
import { getHelp, hasHelp } from "../data/help/helpContent";

export const ManageOrdersPage: React.FC = () => {
  const navigate = useNavigate();

  // 🔥 DECLARAR LA CLAVE
  const HELP_KEY = "orders" as const;

  // 🔥 STATE PARA MODAL INFO
  const [openInfo, setOpenInfo] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [stats, setStats] = useState<any>({ pending: 0, approved: 0, rejected: 0, delivered: 0, cancelled: 0 });

  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const helpEntry = getHelp(HELP_KEY);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await hrManagementAPI.orders.list({ page, limit: 50 });
      setOrders(data.orders);
      setTotalPages(data.pagination.pages);

      const newStats = data.orders.reduce(
        (acc: any, order: Order) => {
          acc[order.status] = (acc[order.status] || 0) + 1;
          return acc;
        },
        { pending: 0, approved: 0, rejected: 0, delivered: 0, cancelled: 0 }
      );
      setStats(newStats);
    } catch (error) {
      console.error("Error loading orders:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [page]);

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      await hrManagementAPI.orders.update(orderId, { status: newStatus });
      sweetAlert.success("Estado actualizado", `El pedido ha sido ${newStatus === "approved" ? "aprobado" : newStatus === "rejected" ? "rechazado" : newStatus === "delivered" ? "marcado como entregado" : "actualizado"}`);
      loadOrders();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo actualizar el estado");
    }
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch = !searchTerm || order.title.toLowerCase().includes(searchTerm.toLowerCase()) || order.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || order.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getUserName = (user: any) => {
    if (!user) return "Usuario desconocido";
    if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
    return user.email || "Usuario desconocido";
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
      approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
      delivered: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
    };
    const labels: Record<string, string> = {
      pending: "Pendiente",
      approved: "Aprobado",
      rejected: "Rechazado",
      delivered: "Entregado",
      cancelled: "Cancelado",
    };
    return { style: styles[status] || styles.pending, label: labels[status] || status };
  };

  const getCategoryLabel = (category: string) => category;

  return (
    <PageLayout
      title="Gestión de Pedidos"
      subtitle="Administra todos los pedidos del personal"
      faIcon={{ icon: faShoppingCart }}
      // 🔥 INFO MODAL (IGUAL QUE UsersPage)
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      headerActions={
        <div className="flex items-center gap-2">
          <button onClick={() => navigate("/hr/order-categories")} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2">
            <FontAwesomeIcon icon={faList} />
            <span>Categorías de Pedidos</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Pendientes", value: stats.pending, color: "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400" },
            { label: "Aprobados", value: stats.approved, color: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" },
            { label: "Rechazados", value: stats.rejected, color: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400" },
            { label: "Entregados", value: stats.delivered, color: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" },
            { label: "Cancelados", value: stats.cancelled, color: "bg-gray-50 dark:bg-gray-900/20 text-gray-600 dark:text-gray-400" },
          ].map((stat, index) => (
            <div key={index} className={`rounded-xl shadow-sm p-4 flex items-center gap-3 ${stat.color}`}>
              <p className="text-sm font-medium opacity-80">{stat.label}</p>
              <p className="text-lg font-bold">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="mb-6 flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Buscar pedidos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
            </div>
            <div className="relative">
              <FontAwesomeIcon icon={faFilter} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="pl-10 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white">
                <option value="all">Todos los estados</option>
                <option value="pending">Pendientes</option>
                <option value="approved">Aprobados</option>
                <option value="rejected">Rechazados</option>
                <option value="delivered">Entregados</option>
                <option value="cancelled">Cancelados</option>
              </select>
            </div>
          </div>

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
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Imagen</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Título</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Solicitante</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Categoría</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Estado</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Fecha</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => {
                      const badge = getStatusBadge(order.status);
                      return (
                        <tr key={order._id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="py-3 px-4">
                            {order.photoUrl ? (
                              <img src={`${import.meta.env.VITE_API_URL}${order.photoUrl}`} alt={order.title} className="w-16 h-16 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setViewingImage(`${import.meta.env.VITE_API_URL}${order.photoUrl}`)} />
                            ) : (
                              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                                <FontAwesomeIcon icon={faImage} className="text-gray-400" />
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-gray-900 dark:text-gray-100">{order.title}</div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">{order.description}</div>
                            {order.amount && <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-1">Monto: ${order.amount.toFixed(2)}</div>}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{getUserName(order.userId)}</td>
                          <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{getCategoryLabel(order.category)}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.style}`}>{badge.label}</span>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{new Date(order.requestedAt).toLocaleDateString()}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-2">
                              {order.status === "pending" && (
                                <>
                                  <button onClick={() => handleUpdateStatus(order._id, "approved")} className="p-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 transition-colors" title="Aprobar">
                                    <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
                                  </button>
                                  <button onClick={() => handleUpdateStatus(order._id, "rejected")} className="p-1.5 rounded-lg bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 transition-colors" title="Rechazar">
                                    <FontAwesomeIcon icon={faTimes} className="h-4 w-4" />
                                  </button>
                                </>
                              )}
                              {order.status === "approved" && (
                                <button onClick={() => handleUpdateStatus(order._id, "delivered")} className="p-1.5 rounded-lg bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-600 dark:text-green-400 transition-colors" title="Marcar como entregado">
                                  <FontAwesomeIcon icon={faTruck} className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredOrders.length === 0 && (
                <div className="text-center py-12">
                  <FontAwesomeIcon icon={faShoppingCart} className="h-16 w-16 text-gray-400 mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">{searchTerm || statusFilter !== "all" ? "No se encontraron pedidos con los filtros aplicados" : "No hay pedidos registrados"}</p>
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-6">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    Anterior
                  </button>
                  <span className="text-gray-600 dark:text-gray-400">
                    Página {page} de {totalPages}
                  </span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    Siguiente
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {viewingImage && <ImageModal imageUrl={viewingImage} alt="Order Photo" isOpen={true} onClose={() => setViewingImage(null)} />}
    </PageLayout>
  );
};
