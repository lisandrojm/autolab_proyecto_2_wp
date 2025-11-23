import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faSearch, faCheck, faTimes, faTruck, faFilter, faList, faImage, faEye, faUser, faCalendar, faTag, faDollarSign, faInfoCircle, faCheckCircle, faTimesCircle, faBan, faShoppingCart, faListCheck, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { hrManagementAPI, Order } from "../api/hrManagement";
import { OrderCategory, CategoryType } from "../api/orderCategories";
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
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

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

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedOrder) return;

    const statusMessages: Record<string, { title: string; text: string; success: string }> = {
      pending: {
        title: "¿Marcar como pendiente?",
        text: `¿Estás seguro de marcar "${selectedOrder.title}" como pendiente?`,
        success: "marcado como pendiente",
      },
      approved: {
        title: "¿Aprobar este pedido?",
        text: `¿Estás seguro de aprobar el pedido "${selectedOrder.title}"?`,
        success: "aprobado",
      },
      rejected: {
        title: "¿Rechazar este pedido?",
        text: `¿Estás seguro de rechazar el pedido "${selectedOrder.title}"?`,
        success: "rechazado",
      },
      delivered: {
        title: "¿Marcar como entregado?",
        text: `¿Estás seguro de marcar "${selectedOrder.title}" como entregado?`,
        success: "marcado como entregado",
      },
      cancelled: {
        title: "¿Cancelar este pedido?",
        text: `¿Estás seguro de cancelar el pedido "${selectedOrder.title}"?`,
        success: "cancelado",
      },
    };

    const message = statusMessages[newStatus];
    if (!message) return;

    const result = await sweetAlert.confirm(message.title, message.text, "Sí, continuar", "Cancelar");
    if (!result.isConfirmed) return;

    try {
      setUpdatingStatus(true);
      await hrManagementAPI.orders.update(selectedOrder._id, { status: newStatus });
      sweetAlert.success("Estado actualizado", `El pedido ha sido ${message.success}`);

      setSelectedOrder({ ...selectedOrder, status: newStatus as any });
      loadOrders();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo actualizar el estado");
    } finally {
      setUpdatingStatus(false);
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
      cancelled: "bg-orange-100 text-orange-800 dark:bg-gray-900/30 dark:text-gray-400",
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

  const getCategoryTypeName = (categoryType?: CategoryType): string => {
    const typeNames: Record<CategoryType, string> = {
      fecha: "Fecha",
      dinero: "Dinero",
      objeto: "Objeto",
      otros: "Otros",
    };
    return categoryType ? typeNames[categoryType] : "N/A";
  };

  const getSubcategoryDisplay = (order: Order): string => {
    if (!order.categoryId || typeof order.categoryId === "string") return "N/A";

    const category = order.categoryId as OrderCategory;

    if (!order.subcategoryId || !category.config?.subtipos) return "Sin opciones";

    const selectedSubtype = category.config.subtipos.find((st) => st.id === order.subcategoryId);
    return selectedSubtype ? selectedSubtype.label : order.subcategoryLabel || "Opción desconocida";
  };

  const hasRequiresAction = (order: Order): boolean => {
    if (!order.categoryId || typeof order.categoryId === "string") return false;
    const category = order.categoryId as OrderCategory;
    return category.requiresAction || false;
  };

  const getCategoryName = (order: Order): string => {
    if (!order.categoryId) return order.category || "Sin categoría";
    if (typeof order.categoryId === "string") return order.category || "Sin categoría";
    const category = order.categoryId as OrderCategory;
    return category.name || order.category || "Sin categoría";
  };

  return (
    <PageLayout
      title="Pedidos"
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
          <button onClick={() => navigate("/hr/order-categories")} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faList} />
            <span className="hidden lg:block">Tipos de Pedidos</span>
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
            <div key={index} className={`rounded-xl shadow-sm p-4 py-2 flex items-center gap-3 w- ${stat.color}`}>
              <p className="text-sm font-medium opacity-80">{stat.label}</p>
              <p className="text-lg font-bold">{stat.value}</p>
            </div>
          ))}
        </div>

        <div>
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
              <div className=" rounded border dark:border-slate-800">
                <table className="w-full dark:bg-slate-800/80 table-fixed">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="w-[250px] text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Título</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Solicitante</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Tipo</th>
                      {/*                       <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Tipo</th> */}
                      {/*                       <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Opción</th> */}
                      {/*                       <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 text-nowrap">Acción Futura</th> */}
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Estado</th>

                      {/* Imagen movida aquí */}
                      {/*                       <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Imagen</th> */}

                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Fecha</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Acciones</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredOrders.map((order) => {
                      const badge = getStatusBadge(order.status);
                      return (
                        <tr key={order._id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          {/* --- TÍTULO --- */}
                          <td className="py-3 px-4">
                            <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{order.title}</div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">{order.description}</div>
                            {order.amount && <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-1">Monto: ${order.amount.toFixed(2)}</div>}
                          </td>

                          {/* --- SOLICITANTE --- */}
                          <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{getUserName(order.userId)}</td>

                          {/* --- CATEGORÍA --- */}
                          <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{getCategoryName(order)}</td>

                          {/* --- TIPO --- */}
                          {/*                           <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{typeof order.categoryId === "object" && order.categoryId ? getCategoryTypeName(order.categoryId.categoryType) : "N/A"}</span>
                          </td> */}

                          {/* --- OPCIÓN --- */}
                          {/*                           <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{getSubcategoryDisplay(order)}</td> */}

                          {/* --- ACCIÓN FUTURA --- */}
                          {/*                           <td className="py-3 px-4 text-center">
                            {hasRequiresAction(order) ? (
                              <span className="inline-flex p-2 items-center justify-center text-blue-600 dark:text-blue-400 text-xs rounded-full bg-orange-100 dark:bg-blue-900/30" title="Requiere acción futura">
                                Requiere A.F
                              </span>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-600 text-xs">-</span>
                            )}
                          </td> */}

                          {/* --- ESTADO --- */}
                          <td className="py-3 px-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.style}`}>{badge.label}</span>
                          </td>

                          {/* 🔥 IMAGEN — movida antes de FECHA + guion cuando no hay */}
                          {/*                           <td className="py-3 px-4 h-10 w-10">
                            <div className="flex justify-center items-center p-3">{order.photoUrl ? <img src={`${import.meta.env.VITE_API_URL}${order.photoUrl}`} alt={order.title} className="w-auto h-auto object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setViewingImage(`${import.meta.env.VITE_API_URL}${order.photoUrl}`)} /> : <span className="text-gray-400 dark:text-gray-600 text-sm">-</span>}</div>
                          </td> */}

                          {/* --- FECHA --- */}
                          <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{new Date(order.requestedAt).toLocaleDateString()}</td>

                          {/* --- ACCIONES --- */}
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => {
                                  setSelectedOrder(order);
                                  setShowDetailModal(true);
                                }}
                                className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
                                title="Ver detalles"
                              >
                                <FontAwesomeIcon icon={faEye} className="h-4 w-4" />
                              </button>
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

      {showDetailModal && selectedOrder && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowDetailModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Detalles del Pedido</h2>
              <button onClick={() => setShowDetailModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <FontAwesomeIcon icon={faTimes} className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <div className="grid grid-cols-1 lg:grid-cols-[5fr_3fr] gap-6">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Información del Pedido</h3>

                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <FontAwesomeIcon icon={faShoppingCart} className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-1" />
                        <div className="flex flex-col gap-1">
                          <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Estado</p>
                          </div>
                          <div>
                            <p className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(selectedOrder.status).style}`}>{getStatusBadge(selectedOrder.status).label}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <FontAwesomeIcon icon={faShoppingCart} className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-1" />
                        <div className="flex-1">
                          <p className="text-sm text-gray-600 dark:text-gray-400">Título</p>
                          <p className="text-base font-semibold text-gray-900 dark:text-white">{selectedOrder.title}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <FontAwesomeIcon icon={faInfoCircle} className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-1" />
                        <div className="flex-1">
                          <p className="text-sm text-gray-600 dark:text-gray-400">Descripción</p>
                          <p className="text-base text-gray-900 dark:text-white">{selectedOrder.description}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <FontAwesomeIcon icon={faTag} className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-1" />
                        <div className="flex-1">
                          <p className="text-sm text-gray-600 dark:text-gray-400">Categoría</p>
                          <p className="text-base text-gray-900 dark:text-white">{getCategoryName(selectedOrder)}</p>
                        </div>
                      </div>

                      {typeof selectedOrder.categoryId === "object" && selectedOrder.categoryId && (
                        <>
                          <div className="flex items-start gap-3">
                            <FontAwesomeIcon icon={faListCheck} className="h-5 w-5 text-blue-500 dark:text-blue-400 mt-1" />
                            <div className="flex-1">
                              <p className="text-sm text-gray-600 dark:text-gray-400">Tipo de Dato</p>
                              <p className="text-base text-gray-900 dark:text-white">{getCategoryTypeName(selectedOrder.categoryId.categoryType)}</p>
                            </div>
                          </div>

                          {selectedOrder.categoryId.config?.subtipos && selectedOrder.categoryId.config.subtipos.length > 0 && (
                            <div className="flex items-start gap-3">
                              <FontAwesomeIcon icon={faList} className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-1" />
                              <div className="flex-1">
                                <p className="text-sm text-gray-600 dark:text-gray-400">Opción Seleccionada</p>
                                <p className="text-base text-gray-900 dark:text-white">{getSubcategoryDisplay(selectedOrder)}</p>
                              </div>
                            </div>
                          )}

                          {selectedOrder.categoryId.requiresAction && (
                            <div className="flex items-start gap-3">
                              <FontAwesomeIcon icon={faExclamationTriangle} className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-1" />
                              <div className="flex-1">
                                <p className="text-sm text-gray-600 dark:text-gray-400">Requiere Acción Futura</p>
                                <p className="text-base font-semibold text-blue-600 dark:text-blue-400">Sí</p>
                                {selectedOrder.categoryId.actionText && <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">"{selectedOrder.categoryId.actionText}"</p>}
                                {selectedOrder.categoryId.futureActionType && selectedOrder.categoryId.futureActionType !== "sinVencimiento" && <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Tipo: {selectedOrder.categoryId.futureActionType}</p>}
                              </div>
                            </div>
                          )}

                          {selectedOrder.categoryId.categoryType === "fecha" && selectedOrder.categoryId.dateMode === "range" && selectedOrder.dynamicValue && (
                            <div className="flex items-start gap-3">
                              <FontAwesomeIcon icon={faCalendar} className="h-5 w-5 text-teal-600 dark:text-teal-400 mt-1" />
                              <div className="flex-1">
                                <p className="text-sm text-gray-600 dark:text-gray-400">Rango de Fechas</p>
                                <p className="text-base text-gray-900 dark:text-white">
                                  {selectedOrder.dynamicValue.fechaDesde && new Date(selectedOrder.dynamicValue.fechaDesde).toLocaleDateString()}
                                  {" - "}
                                  {selectedOrder.dynamicValue.fechaHasta && new Date(selectedOrder.dynamicValue.fechaHasta).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {selectedOrder.amount && (
                        <div className="flex items-start gap-3">
                          <FontAwesomeIcon icon={faDollarSign} className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-1" />
                          <div className="flex-1">
                            <p className="text-sm text-gray-600 dark:text-gray-400">Monto</p>
                            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">${selectedOrder.amount.toFixed(2)}</p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-3">
                        <FontAwesomeIcon icon={faUser} className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-1" />
                        <div className="flex-1">
                          <p className="text-sm text-gray-600 dark:text-gray-400">Solicitante</p>
                          <p className="text-base font-medium text-gray-900 dark:text-white">{getUserName(selectedOrder.userId)}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <FontAwesomeIcon icon={faImage} className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-1" />
                        <div className="flex flex-col gap-1">
                          <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Imagen</p>
                          </div>
                          <div>
                            {selectedOrder.photoUrl && (
                              <div className="w-1/3 p-2 border border-slate-700 rounded">
                                <div className="mb-4 max-w-sm">
                                  <img src={`${import.meta.env.VITE_API_URL}${selectedOrder.photoUrl}`} alt={selectedOrder.title} className="w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setViewingImage(`${import.meta.env.VITE_API_URL}${selectedOrder.photoUrl}`)} />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <FontAwesomeIcon icon={faCalendar} className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-1" />
                        <div className="flex-1">
                          <p className="text-sm text-gray-600 dark:text-gray-400">Fecha de Solicitud</p>
                          <p className="text-base text-gray-900 dark:text-white">{new Date(selectedOrder.requestedAt).toLocaleString()}</p>
                        </div>
                      </div>

                      {selectedOrder.approvedAt && (
                        <div className="flex items-start gap-3">
                          <FontAwesomeIcon icon={faCheckCircle} className="h-5 w-5 text-green-600 dark:text-green-400 mt-1" />
                          <div className="flex-1">
                            <p className="text-sm text-gray-600 dark:text-gray-400">Fecha de Aprobación</p>
                            <p className="text-base text-gray-900 dark:text-white">{new Date(selectedOrder.approvedAt).toLocaleString()}</p>
                            {selectedOrder.approvedBy && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Por: {getUserName(selectedOrder.approvedBy)}</p>}
                          </div>
                        </div>
                      )}

                      {selectedOrder.deliveredAt && (
                        <div className="flex items-start gap-3">
                          <FontAwesomeIcon icon={faTruck} className="h-5 w-5 text-green-600 dark:text-green-400 mt-1" />
                          <div className="flex-1">
                            <p className="text-sm text-gray-600 dark:text-gray-400">Fecha de Entrega</p>
                            <p className="text-base text-gray-900 dark:text-white">{new Date(selectedOrder.deliveredAt).toLocaleString()}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Control de Estado</h3>

                    {selectedOrder.status === "approved" && (
                      <button onClick={() => handleStatusChange("delivered")} disabled={updatingStatus} className="w-full mb-4 py-3 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        <FontAwesomeIcon icon={faTruck} />
                        Marcar como Entregado
                      </button>
                    )}

                    <div className="space-y-3">
                      {[
                        { value: "pending", label: "Pendiente", icon: faSpinner, color: "yellow" },
                        { value: "approved", label: "Aprobado", icon: faCheckCircle, color: "blue" },
                        { value: "rejected", label: "Rechazado", icon: faTimesCircle, color: "red" },
                        { value: "delivered", label: "Entregado", icon: faTruck, color: "green" },
                        { value: "cancelled", label: "Cancelado", icon: faBan, color: "gray" },
                      ].map((status) => {
                        const isActive = selectedOrder.status === status.value;

                        const inactiveClasses = "bg-blue-500 dark:bg-blue-800/20 border-blue-200/20 dark:border-blue-800/20 text-blue-800/20 dark:text-blue-400/60";

                        const activeColorClasses: Record<string, { bg: string; border: string; text: string; dotBg: string }> = {
                          yellow: {
                            bg: "bg-yellow-100 dark:bg-yellow-900/30",
                            border: "border-yellow-500 dark:border-yellow-500",
                            text: "text-yellow-900 dark:text-yellow-300",
                            dotBg: "bg-yellow-500",
                          },
                          blue: {
                            bg: "bg-blue-100 dark:bg-blue-900/30",
                            border: "border-blue-500 dark:border-blue-500",
                            text: "text-blue-900 dark:text-blue-300",
                            dotBg: "bg-blue-500",
                          },
                          red: {
                            bg: "bg-red-100 dark:bg-red-900/30",
                            border: "border-red-500 dark:border-red-500",
                            text: "text-red-900 dark:text-red-300",
                            dotBg: "bg-red-500",
                          },
                          green: {
                            bg: "bg-green-100 dark:bg-green-900/30",
                            border: "border-green-500 dark:border-green-500",
                            text: "text-green-900 dark:text-green-300",
                            dotBg: "bg-green-500",
                          },
                          gray: {
                            bg: "bg-gray-100 dark:bg-gray-900/30",
                            border: "border-gray-500 dark:border-gray-500",
                            text: "text-gray-900 dark:text-gray-300",
                            dotBg: "bg-gray-500",
                          },
                        };

                        const activeColors = activeColorClasses[status.color];

                        return (
                          <button key={status.value} onClick={() => handleStatusChange(status.value)} disabled={updatingStatus} className={`w-full p-4 rounded-lg border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isActive ? `${activeColors.bg} ${activeColors.border} ${activeColors.text} shadow-md` : `${inactiveClasses} hover:shadow-md hover:scale-[1.02]`}`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isActive ? activeColors.border : "border-blue-300 dark:border-blue-600"}`}>{isActive && <div className={`w-3 h-3 rounded-full ${activeColors.dotBg}`} />}</div>
                              <FontAwesomeIcon icon={status.icon} className="h-5 w-5" />
                              <span className="font-semibold">{status.label}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {updatingStatus && (
                      <div className="mt-4 flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400">
                        <FontAwesomeIcon icon={faSpinner} spin />
                        <span className="text-sm">Actualizando estado...</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};
