import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faSearch, faCheck, faTimes, faTruck, faFilter, faList, faImage, faEye, faUser, faCalendar, faTag, faDollarSign, faInfoCircle, faCheckCircle, faTimesCircle, faBan, faShoppingCart, faListCheck, faClock, faTable, faGrip, faFileArrowUp, faCamera, faUpload, faFileAlt, faTriangleExclamation, faChevronLeft, faChevronRight, faCircleInfo, faFileSignature, faPenToSquare, faPaperPlane } from "@fortawesome/free-solid-svg-icons";
import { hrManagementAPI, Order } from "../api/hrManagement";
import { OrderCategory, CategoryType } from "../api/orderCategories";
import { PageLayout } from "../components/ui/PageLayout";
import { sweetAlert } from "../utils/sweetAlert";
import { ImageModal } from "../components/ui/ImageModal";
import { Modal } from "../components/ui/Modal";
import { Card } from "../components/ui/Card";
import { getDocumentBadgeStyle } from "../utils/documentBadgeHelper";

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
  const [stats, setStats] = useState<any>({ pending: 0, pre_approved: 0, approved: 0, rejected: 0, delivered: 0, cancelled: 0 });
  const [docStats, setDocStats] = useState({ total: 0, normal: 0, urgent: 0, overdue: 0, uploaded: 0 });

  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [isXXL, setIsXXL] = useState(window.innerWidth >= 1200);

  const helpEntry = getHelp(HELP_KEY);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const isNowXXL = window.innerWidth >= 1200;
        setIsXXL(isNowXXL);

        if (!isNowXXL) {
          setViewMode("cards");
        } else {
          const saved = localStorage.getItem("orderViewMode");
          if (saved && (saved === "table" || saved === "cards")) {
            setViewMode(saved as "table" | "cards");
          } else {
            setViewMode("table");
          }
        }
      }, 150);
    };

    const isInitialXXL = window.innerWidth >= 1200;
    setIsXXL(isInitialXXL);

    if (isInitialXXL) {
      const saved = localStorage.getItem("orderViewMode");
      if (saved && (saved === "table" || saved === "cards")) {
        setViewMode(saved as "table" | "cards");
      } else {
        setViewMode("table");
      }
    } else {
      setViewMode("cards");
    }

    window.addEventListener("resize", handleResize);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (isXXL) {
      localStorage.setItem("orderViewMode", viewMode);
    }
  }, [viewMode, isXXL]);

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
        { pending: 0, pre_approved: 0, approved: 0, rejected: 0, delivered: 0, cancelled: 0 }
      );
      setStats(newStats);

      const docCounts = { total: 0, normal: 0, urgent: 0, overdue: 0, uploaded: 0 };

      data.orders.forEach((order) => {
        const futureAction = typeof order.futureActionId === "object" ? order.futureActionId : null;
        const badgeStyle = getDocumentBadgeStyle(futureAction);

        if (badgeStyle) {
          docCounts.total++;

          if (badgeStyle.label === "Doc. Vencido") {
            docCounts.overdue++;
          } else if (badgeStyle.label === "Doc. por Vencer") {
            docCounts.urgent++;
          } else if (badgeStyle.label === "Doc. Subido") {
            docCounts.uploaded++;
          } else {
            docCounts.normal++;
          }
        }
      });

      setDocStats(docCounts);
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

  const handlePreApprove = async () => {
    if (!selectedOrder) return;

    const result = await sweetAlert.confirm("¿Pre-Aprobar este pedido?", "El pedido pasará a estado Pre-Aprobado. El usuario no será notificado.", "Sí, Pre-Aprobar", "Cancelar");
    if (!result.isConfirmed) return;

    try {
      setUpdatingStatus(true);
      const updated = await hrManagementAPI.orders.preApprove(selectedOrder._id);
      sweetAlert.success("Pre-Aprobado", "El pedido ha sido pre-aprobado correctamente");
      setSelectedOrder(updated);
      loadOrders();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo pre-aprobar el pedido");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedOrder) return;

    const result = await sweetAlert.confirm("¿Aprobar este pedido?", "El pedido será aprobado y el usuario recibirá una notificación de 'Documento enviado para firma'.", "Sí, Aprobar", "Cancelar");
    if (!result.isConfirmed) return;

    try {
      setUpdatingStatus(true);
      const updated = await hrManagementAPI.orders.approve(selectedOrder._id);
      sweetAlert.success("Aprobado", "El pedido ha sido aprobado y el usuario ha sido notificado");
      setSelectedOrder(updated);
      loadOrders();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo aprobar el pedido");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleReject = async () => {
    if (!selectedOrder) return;

    const result = await sweetAlert.confirm("¿Rechazar este pedido?", "El pedido será rechazado y el usuario será notificado.", "Sí, Rechazar", "Cancelar");
    if (!result.isConfirmed) return;

    try {
      setUpdatingStatus(true);
      const updated = await hrManagementAPI.orders.reject(selectedOrder._id);
      sweetAlert.success("Rechazado", "El pedido ha sido rechazado");
      setSelectedOrder(updated);
      loadOrders();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo rechazar el pedido");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDeliver = async () => {
    if (!selectedOrder) return;

    const result = await sweetAlert.confirm("¿Marcar como Entregado?", "El pedido será marcado como entregado.", "Sí, Marcar como Entregado", "Cancelar");
    if (!result.isConfirmed) return;

    try {
      setUpdatingStatus(true);
      const updated = await hrManagementAPI.orders.deliver(selectedOrder._id);
      sweetAlert.success("Entregado", "El pedido ha sido marcado como entregado");
      setSelectedOrder(updated);
      loadOrders();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo marcar como entregado");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const filteredOrders = orders.filter((order) => {
    const categoryName = typeof order.categoryId === "object" && order.categoryId?.name ? order.categoryId.name : order.category;
    const subcategoryText = order.subcategories?.join(", ") || "";
    const orderDisplayName = `${categoryName} ${subcategoryText}`.toLowerCase();

    const matchesSearch = !searchTerm || orderDisplayName.includes(searchTerm.toLowerCase()) || order.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || order.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const currentOrderIndex = selectedOrder ? filteredOrders.findIndex((o) => o._id === selectedOrder._id) : -1;
  const hasPreviousOrder = currentOrderIndex > 0;
  const hasNextOrder = currentOrderIndex >= 0 && currentOrderIndex < filteredOrders.length - 1;

  const handlePreviousOrder = () => {
    if (hasPreviousOrder) {
      setSelectedOrder(filteredOrders[currentOrderIndex - 1]);
    }
  };

  const handleNextOrder = () => {
    if (hasNextOrder) {
      setSelectedOrder(filteredOrders[currentOrderIndex + 1]);
    }
  };

  const handleSendSignature = async () => {
    if (!selectedOrder) return;

    const result = await sweetAlert.confirm(
      "¿Enviar para Firma?",
      "El documento será enviado al usuario para su firma.",
      "Sí, Enviar",
      "Cancelar"
    );
    if (!result.isConfirmed) return;

    try {
      setUpdatingStatus(true);
      const updated = await hrManagementAPI.orders.sendSignature(selectedOrder._id);
      sweetAlert.success("Enviado", "El documento ha sido enviado para firma");
      setSelectedOrder(updated);
      loadOrders();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo enviar para firma");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleMarkSigned = async () => {
    if (!selectedOrder) return;

    const result = await sweetAlert.confirm(
      "¿Marcar como Firmado?",
      "El documento será marcado como firmado por el usuario.",
      "Sí, Marcar como Firmado",
      "Cancelar"
    );
    if (!result.isConfirmed) return;

    try {
      setUpdatingStatus(true);
      const updated = await hrManagementAPI.orders.markSigned(selectedOrder._id);
      sweetAlert.success("Firmado", "El documento ha sido marcado como firmado");
      setSelectedOrder(updated);
      loadOrders();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo marcar como firmado");
    } finally {
      setUpdatingStatus(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showDetailModal && selectedOrder) {
        if (e.key === "ArrowLeft" && hasPreviousOrder) {
          e.preventDefault();
          handlePreviousOrder();
        } else if (e.key === "ArrowRight" && hasNextOrder) {
          e.preventDefault();
          handleNextOrder();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showDetailModal, selectedOrder, hasPreviousOrder, hasNextOrder]);

  const getUserName = (user: any) => {
    if (!user) return "Usuario desconocido";
    if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
    return user.email || "Usuario desconocido";
  };

  const getUserPosition = (user: any): string => {
    if (!user) return "Sin puesto asignado";
    if (typeof user === "string") return "Sin puesto asignado";
    if (user.positionId && typeof user.positionId === "object" && user.positionId.name) {
      return user.positionId.name;
    }
    return "Sin puesto asignado";
  };

  const renderSignatureStatus = (order: Order) => {
    if (!order.requiresSignature) {
      return <span className="text-xs text-gray-500 dark:text-gray-400">-</span>;
    }

    const signatureStatus = order.signatureStatus || "not_required";

    switch (signatureStatus) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <FontAwesomeIcon icon={faClock} className="w-3 h-3" />
            Pendiente
          </span>
        );
      case "sent":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            <FontAwesomeIcon icon={faPaperPlane} className="w-3 h-3" />
            Enviada
          </span>
        );
      case "signed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <FontAwesomeIcon icon={faCheck} className="w-3 h-3" />
            Firmada
          </span>
        );
      default:
        return <span className="text-xs text-gray-500 dark:text-gray-400">No requerida</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
      pre_approved: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
      approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
      delivered: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      cancelled: "bg-orange-100 text-orange-800 dark:bg-gray-900/30 dark:text-gray-400",
    };
    const labels: Record<string, string> = {
      pending: "Pendiente",
      pre_approved: "Pre-Aprobado",
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

    if (!order.subcategories || order.subcategories.length === 0 || !category.config.subtipos) return "Sin opciones";

    const labels = order.subcategories.map((subId) => {
      const selectedSubtype = category.config.subtipos?.find((st) => st.id === subId);
      return selectedSubtype ? selectedSubtype.label : subId;
    });

    return labels.join(", ");
  };

  const getSubcategoriesArray = (order: Order): string[] => {
    if (!order.categoryId || typeof order.categoryId === "string") return [];

    const category = order.categoryId as OrderCategory;

    if (!order.subcategories || order.subcategories.length === 0 || !category.config.subtipos) return [];

    const labels = order.subcategories
      .map((subId) => {
        const selectedSubtype = category.config.subtipos?.find((st) => st.id === subId);
        return selectedSubtype ? selectedSubtype.label : null;
      })
      .filter((label): label is string => Boolean(label));

    return labels;
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

  const getOrderNumber = (order: Order): string => {
    const parts = order.orderNumber.split("-");
    const numericPart = parts.length > 1 ? parts[1] : order.orderNumber;
    return `#${numericPart}`;
  };

  const getUserRole = (user: any): string => {
    if (!user) return "Usuario";
    if (typeof user === "string") return "Usuario";
    if (user.role) return user.role;
    return "Empleado";
  };

  const getUserAvatar = (user: any): string | null => {
    if (!user || typeof user === "string") return null;
    return user.avatar || user.photoUrl || null;
  };

  const formatDateShort = (dateString: string | undefined): string => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getStatusIcon = (status: string) => {
    const icons: Record<string, any> = {
      pending: faClock,
      approved: faCheckCircle,
      rejected: faTimesCircle,
      delivered: faTruck,
      cancelled: faBan,
    };
    return icons[status] || faInfoCircle;
  };

  const mapStatusToCardVariant = (status: string): "default" | "success" | "warning" | "blue" | "info" | "green" => {
    const variants: Record<string, "default" | "success" | "warning" | "blue" | "info" | "green"> = {
      pending: "warning",
      approved: "blue",
      rejected: "default",
      delivered: "green",
      cancelled: "default",
    };
    return variants[status] || "default";
  };

  const getCardBadges = (order: Order) => {
    const statusBadge = getStatusBadge(order.status);
    const futureAction = typeof order.futureActionId === "object" ? order.futureActionId : null;
    const docBadgeStyle = getDocumentBadgeStyle(futureAction);

    const badges = [
      {
        text: getOrderNumber(order),
        className: "text-xs bg-gray-50 dark:bg-gray-600/20 text-gray-600 dark:text-gray-400 px-2 py-1 rounded",
      },
      {
        text: statusBadge.label,
        className: statusBadge.style,
        icon: getStatusIcon(order.status),
      },
    ];

    if (docBadgeStyle) {
      badges.push({
        text: docBadgeStyle.label,
        className: `${docBadgeStyle.bgClass} ${docBadgeStyle.textClass} ${docBadgeStyle.borderClass}`,
        icon: faFileArrowUp,
      });
    }

    return badges;
  };

  const getAvatarFallback = (user: any): string => {
    const name = getUserName(user);
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const renderCardsView = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredOrders.map((order) => {
          const avatarUrl = getUserAvatar(order.userId);
          return (
            <Card
              key={order._id}
              header={{
                title: getUserName(order.userId),
                subtitle: getUserPosition(order.userId),
                avatar: {
                  src: avatarUrl ? `${import.meta.env.VITE_API_URL}${avatarUrl}` : undefined,
                  fallback: getAvatarFallback(order.userId),
                  alt: getUserName(order.userId),
                },
                badges: getCardBadges(order),
              }}
              footer={{
                leftContent: (
                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <FontAwesomeIcon icon={faCalendar} className="h-3 w-3" />
                    <span>{formatDateShort(order.requestedAt)}</span>
                  </div>
                ),
              }}
              onClick={() => {
                setSelectedOrder(order);
                setShowDetailModal(true);
              }}
            >
              <div className="flex py-2 items-center justify-between flex-wrap">
                <div className="flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/50 dark:text-gray-300">{getCategoryName(order)}</span>
                  {getSubcategoriesArray(order).map((subcategory, index) => (
                    <span key={index} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/20 dark:text-gray-400">
                      {subcategory}
                    </span>
                  ))}
                </div>
                {/*                 <div className="space-y-3 text-sm">
                  {order.amount && (
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-green-600 dark:text-green-400">${order.amount.toFixed(2)}</span>
                    </div>
                  )}
                </div> */}
              </div>
            </Card>
          );
        })}
      </div>
    );
  };

  const renderModalFooter = () => {
    if (updatingStatus) {
      return (
        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
          <FontAwesomeIcon icon={faSpinner} spin />
          <span className="text-sm">Actualizando...</span>
        </div>
      );
    }

    if (!selectedOrder) return null;

    if (selectedOrder.status === "pending") {
      return (
        <>
          <button onClick={handleReject} disabled={updatingStatus} className="px-6 py-2.5 rounded-lg bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-500/20 dark:hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Rechazar
          </button>
          <button onClick={handlePreApprove} disabled={updatingStatus} className="px-6 py-2.5 rounded-lg bg-cyan-500 text-white font-semibold text-sm hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Pre-Aprobar
          </button>
        </>
      );
    }

    if (selectedOrder.status === "pre_approved") {
      return (
        <>
          <button onClick={handleReject} disabled={updatingStatus} className="px-6 py-2.5 rounded-lg bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-500/20 dark:hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Rechazar
          </button>
          <button onClick={handleApprove} disabled={updatingStatus} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Aprobar
          </button>
        </>
      );
    }

    if (selectedOrder.status === "approved") {
      return (
        <>
          <button onClick={handleReject} disabled={updatingStatus} className="px-6 py-2.5 rounded-lg bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-500/20 dark:hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Rechazar
          </button>

          {selectedOrder.requiresSignature && (
            <>
              {selectedOrder.signatureStatus === "pending" && (
                <button onClick={handleSendSignature} disabled={updatingStatus} className="px-6 py-2.5 rounded-lg bg-purple-500 text-white font-semibold text-sm hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                  <FontAwesomeIcon icon={faPaperPlane} />
                  Enviar para Firma
                </button>
              )}
              {selectedOrder.signatureStatus === "sent" && (
                <button onClick={handleMarkSigned} disabled={updatingStatus} className="px-6 py-2.5 rounded-lg bg-green-500 text-white font-semibold text-sm hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                  <FontAwesomeIcon icon={faPenToSquare} />
                  Marcar como Firmado
                </button>
              )}
            </>
          )}

          <button onClick={handleDeliver} disabled={updatingStatus} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            <FontAwesomeIcon icon={faTruck} />
            Marcar como Entregado
          </button>
        </>
      );
    }

    return null;
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
        <div className="hidden lg:flex items-center gap-2">
          <button onClick={() => navigate("/hr/order-categories")} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faList} />
            <span className="hidden lg:block">ABM Pedidos</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-4">
          {[
            { label: "Pendientes", value: stats.pending, icon: faClock, color: "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400" },
            { label: "Pre-Aprobados", value: stats.pre_approved, icon: faListCheck, color: "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400" },
            { label: "Aprobados", value: stats.approved, icon: faCheckCircle, color: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" },
            { label: "Rechazados", value: stats.rejected, icon: faTimesCircle, color: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400" },
            { label: "Entregados", value: stats.delivered, icon: faTruck, color: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" },
            { label: "Cancelados", value: stats.cancelled, icon: faBan, color: "bg-gray-50 dark:bg-gray-600/20 text-gray-600 dark:text-gray-400" },
            { label: "Documentos", value: docStats.total, icon: faFileAlt, color: "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400" },
          ].map((stat, index) => (
            <div key={index} className={`rounded-xl shadow-sm p-4 py-2 flex items-center gap-3 ${stat.color} ${stat.label === "Documentos" ? "cursor-pointer hover:ring-orange-300 dark:hover:ring-orange-600 transition-all" : ""} ${stat.label === "Documentos" && docStats.overdue > 0 ? "ring-red-500 dark:ring-red-400" : ""}`} onClick={() => stat.label === "Documentos" && setShowDocModal(true)} title={stat.label === "Documentos" && docStats.total > 0 ? "Haz clic para ver el detalle de documentos" : undefined}>
              <FontAwesomeIcon icon={stat.icon} className="lg:h-5 w-5 opacity-80" />
              <div className="flex gap-2 items-center">
                <span className="text-sm font-medium opacity-80 hidden lg:block">{stat.label}</span>
                <span className="lg:text-lg font-bold">{stat.value}</span>
              </div>
              {stat.label === "Documentos" && docStats.overdue > 0 && (
                <span className="text-red-500" title="Hay documentos vencidos">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4" />
                </span>
              )}
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
                <option value="pre_approved">Pre-Aprobados</option>
                <option value="approved">Aprobados</option>
                <option value="rejected">Rechazados</option>
                <option value="delivered">Entregados</option>
                <option value="cancelled">Cancelados</option>
              </select>
            </div>
            {isXXL && (
              <div className="flex items-center gap-2 ">
                <button onClick={() => setViewMode("cards")} className={`px-4 py-1.5 rounded-md transition-all ${viewMode === "cards" ? "bg-blue-500 text-white shadow-sm" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 border dark:border-gray-700"}`} title="Vista de tarjetas" aria-label="Vista de tarjetas">
                  <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
                </button>
                <button onClick={() => setViewMode("table")} className={`px-4 py-1.5 rounded-md transition-all ${viewMode === "table" ? "bg-blue-500 text-white shadow-sm" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 border dark:border-gray-700"}`} title="Vista de tabla" aria-label="Vista de tabla">
                  <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <FontAwesomeIcon icon={faSpinner} spin className="text-4xl text-blue-600" />
            </div>
          ) : (
            <>
              {viewMode === "cards" ? (
                renderCardsView()
              ) : (
                <div className="overflow-x-auto rounded border dark:border-slate-800">
                  <table className="w-full dark:bg-slate-800/80 table-auto">
                    <thead>
                      <tr>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">N° Pedido</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Tipo</th>
                        {/*                         <th className="w-[250px] text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Título</th> */}
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Solicitante</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Cargo</th>
                        {/*                       <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Tipo</th> */}
                        {/*                       <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Opción</th> */}
                        {/*                       <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 text-nowrap">Acción Futura</th> */}
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Estado</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Documento</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Firma</th>

                        {/* Imagen movida aquí */}
                        {/*                       <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Imagen</th> */}

                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Fecha</th>
                        {/*                       <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Acciones</th> */}
                      </tr>
                    </thead>

                    <tbody>
                      {filteredOrders.map((order) => {
                        const badge = getStatusBadge(order.status);
                        return (
                          <tr
                            key={order._id}
                            className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                            onClick={() => {
                              setSelectedOrder(order);
                              setShowDetailModal(true);
                            }}
                          >
                            {/* --- N° PEDIDO --- */}
                            <td className="py-3 px-4">
                              <span className="bg-gray-50 dark:bg-gray-600/20 text-xs text-gray-600 dark:text-gray-400 px-2 rounded">{getOrderNumber(order)}</span>
                            </td>
                            {/* --- Tipo --- */}
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="flex flex-nowrap items-center gap-x-1.5">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/50 dark:text-gray-300">{getCategoryName(order)}</span>

                                {getSubcategoriesArray(order).map((subcategory, index) => (
                                  <span key={index} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mediumbg-gray-50 text-gray-600 dark:bg-gray-600/20 dark:text-gray-400">
                                    {subcategory}
                                  </span>
                                ))}
                              </div>
                            </td>

                            {/*                             <td className="py-3 px-4">
                              <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{order.title}</div>
                              <div className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">{order.description}</div>
                              {order.amount && <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-1">Monto: ${order.amount.toFixed(2)}</div>}
                            </td> */}

                            {/* --- SOLICITANTE --- */}
                            <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{getUserName(order.userId)}</td>
                            {/* --- Cargo --- */}
                            <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{getUserPosition(order.userId)}</td>

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
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.style}`}>
                                <FontAwesomeIcon icon={getStatusIcon(order.status)} className="h-3 w-3" />
                                {badge.label}
                              </span>
                            </td>

                            {/* --- DOCUMENTO --- */}
                            <td className="py-3 px-4">
                              {(() => {
                                const futureAction = typeof order.futureActionId === "object" ? order.futureActionId : null;
                                const badgeStyle = getDocumentBadgeStyle(futureAction);

                                if (!badgeStyle) {
                                  return <span className="text-gray-400 dark:text-gray-600 text-sm">-</span>;
                                }

                                return (
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeStyle.bgClass} ${badgeStyle.textClass} ${badgeStyle.borderClass}`}>
                                    <FontAwesomeIcon icon={faFileArrowUp} className="h-3 w-3" />
                                    {badgeStyle.label}
                                  </span>
                                );
                              })()}
                            </td>

                            {/* --- FIRMA --- */}
                            <td className="py-3 px-4 text-center">
                              {renderSignatureStatus(order)}
                            </td>

                            {/* 🔥 IMAGEN — movida antes de FECHA + guion cuando no hay */}
                            {/*                           <td className="py-3 px-4 h-10 w-10">
                            <div className="flex justify-center items-center p-3">{order.photoUrl ? <img src={`${import.meta.env.VITE_API_URL}${order.photoUrl}`} alt={order.title} className="w-auto h-auto object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setViewingImage(`${import.meta.env.VITE_API_URL}${order.photoUrl}`)} /> : <span className="text-gray-400 dark:text-gray-600 text-sm">-</span>}</div>
                          </td> */}

                            {/* --- FECHA --- */}
                            <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{new Date(order.requestedAt).toLocaleDateString()}</td>

                            {/* --- ACCIONES --- */}
                            {/*                           <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedOrder(order);
                                  setShowDetailModal(true);
                                }}
                                className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
                                title="Ver detalles"
                              >
                                <FontAwesomeIcon icon={faEye} className="h-4 w-4" />
                              </button>
                            </div>
                          </td> */}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

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

      <Modal
        isOpen={showDetailModal && !!selectedOrder}
        onClose={() => setShowDetailModal(false)}
        title="Detalles del Pedido"
        size="md"
        footer={renderModalFooter()}
        customHeader={
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 sticky top-0 py-3 z-50">
            <div className="flex items-center gap-3">
              {/*               <button onClick={handlePreviousOrder} disabled={!hasPreviousOrder} className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors" title="Pedido anterior (←)">
                <FontAwesomeIcon icon={faChevronLeft} className="h-4 w-4 text-gray-700 dark:text-gray-300" />
              </button> */}
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Detalles del Pedido</h2>
              {/*               <button onClick={handleNextOrder} disabled={!hasNextOrder} className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors" title="Siguiente pedido (→)">
                <FontAwesomeIcon icon={faChevronRight} className="h-4 w-4 text-gray-700 dark:text-gray-300" />
              </button> */}
              {currentOrderIndex >= 0 && (
                <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                  {currentOrderIndex + 1} de {filteredOrders.length}
                </span>
              )}
            </div>
            <button onClick={() => setShowDetailModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Cerrar modal" title="Cerrar">
              <FontAwesomeIcon icon={faTimes} className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        }
      >
        {selectedOrder && (
          <div className="space-y-6">
            {/* Perfil */}
            <div className="flex flex-wrap justify-between gap-3">
              {/* Pedido */}
              <span>
                <p className="text-sm px-2 text-gray-600 dark:bg-gray-600/20 dark:text-gray-400 rounded">Nº Pedido: {getOrderNumber(selectedOrder)}</p>
              </span>
              {/* Estado */}
              <div className="flex flex-wrap">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium py-1 px-3 rounded-full ${getStatusBadge(selectedOrder.status).style}`}>
                  <FontAwesomeIcon icon={getStatusIcon(selectedOrder.status)} className="h-3 w-3" />
                  {getStatusBadge(selectedOrder.status).label}
                </span>
                {/* Documento */}
                <span>
                  {(() => {
                    const futureAction = typeof selectedOrder.futureActionId === "object" ? selectedOrder.futureActionId : null;
                    const badgeStyle = getDocumentBadgeStyle(futureAction);

                    if (!badgeStyle) return null;

                    const isDocumentUploaded = badgeStyle.label === "Doc. Subido" && selectedOrder.documentoUrl;

                    if (isDocumentUploaded) {
                      return (
                        <button onClick={() => setViewingImage(`${import.meta.env.VITE_API_URL}${selectedOrder.documentoUrl}`)} className={`inline-flex items-center gap-1.5 text-xs font-medium py-1 px-3 rounded-full ${badgeStyle.bgClass} ${badgeStyle.textClass} ${badgeStyle.borderClass} hover:opacity-80 transition-opacity cursor-pointer`} title="Ver documento">
                          <FontAwesomeIcon icon={faFileArrowUp} className="h-3 w-3" />
                          {badgeStyle.label}
                        </button>
                      );
                    }

                    return (
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium py-1 px-3 rounded-full ${badgeStyle.bgClass} ${badgeStyle.textClass} ${badgeStyle.borderClass} ${badgeStyle.shouldAnimate ? "animate-pulse" : ""}`}>
                        <FontAwesomeIcon icon={faFileArrowUp} className="h-3 w-3" />
                        {badgeStyle.label}
                      </span>
                    );
                  })()}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div>
                {getUserAvatar(selectedOrder.userId) ? (
                  <img alt={`Foto de perfil de ${getUserName(selectedOrder.userId)}`} className="w-10 h-10 rounded-full object-cover" src={`${import.meta.env.VITE_API_URL}${getUserAvatar(selectedOrder.userId)}`} />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-blue-500 dark:bg-blue-600 flex items-center justify-center text-white font-semibold">
                    {getUserName(selectedOrder.userId)
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </div>
                )}
              </div>
              <div className="bg-slate-800">
                <p className="font-semibold text-slate-800 dark:text-slate-100">{getUserName(selectedOrder.userId)}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{getUserPosition(selectedOrder.userId)}</p>
              </div>
            </div>
            {/* Grid con Tipo de Pedido y Detalles */}
            <div className="flex flex-col gap-4">
              <div className="lg:col-span-8">
                <p className="text-sm text-slate-500 dark:text-slate-400">Tipo de pedido</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/50 dark:text-gray-300">{getCategoryName(selectedOrder)}</span>
                  {getSubcategoriesArray(selectedOrder).map((subcategory, index) => (
                    <span key={index} className="inline-flex items-center px-2 py-0.5 rounded-full text-sm font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/20 dark:text-gray-400">
                      {subcategory}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-10">
                {selectedOrder.amount && (
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Importe</p>
                    <p className="font-medium text-slate-800 dark:text-slate-100">$ {selectedOrder.amount.toFixed(2)}</p>
                  </div>
                )}
                {selectedOrder.dynamicValue?.fechaDesde && (
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Fecha de Inicio</p>
                    <p className="font-medium text-slate-800 dark:text-slate-100">{formatDateShort(selectedOrder.dynamicValue.fechaDesde)}</p>
                  </div>
                )}
                {selectedOrder.dynamicValue?.fechaHasta && (
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Fecha de Fin</p>
                    <p className="font-medium text-slate-800 dark:text-slate-100">{formatDateShort(selectedOrder.dynamicValue.fechaHasta)}</p>
                  </div>
                )}
                {selectedOrder.photoUrl && (
                  <div className="md:col-span-2">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Imagen adjunta</p>
                    <img src={`${import.meta.env.VITE_API_URL}${selectedOrder.photoUrl}`} alt={selectedOrder.title} className="max-w-xs w-full h-auto rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setViewingImage(`${import.meta.env.VITE_API_URL}${selectedOrder.photoUrl}`)} />
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-100 dark:bg-slate-700/50 p-3 py-3 rounded-lg">
              <div className="flex justify-between items-start">
                <div className="flex justify-between items-center w-full">
                  {/* <p className="font-semibold text-xl text-slate-800 dark:text-slate-100">{selectedOrder.title}</p> */}
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-500">Descripción</p>
                </div>
              </div>
              <p className="text-md text-slate-600 dark:text-slate-300 leading-relaxed">{selectedOrder.description}</p>
            </div>

            {/* Sección de Documento Pendiente */}
            {(() => {
              const futureAction = typeof selectedOrder.futureActionId === "object" ? selectedOrder.futureActionId : null;

              if (!futureAction || futureAction.tipoAccionFutura !== "documento" || futureAction.estadoAccion !== "pendiente_documento") {
                return null;
              }

              const daysRemaining = futureAction.fechaLimite ? Math.ceil((new Date(futureAction.fechaLimite).getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;

              return (
                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-500/50 p-4 rounded-lg">
                  <div className="flex items-start gap-3">
                    <FontAwesomeIcon icon={faFileArrowUp} className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-orange-800 dark:text-orange-400 mb-1">Documento Pendiente</h4>
                      {futureAction.documentoRequerido && (
                        <p className="text-sm text-orange-600 dark:text-orange-400 mb-3">
                          <strong>"{futureAction.documentoRequerido}"</strong>
                        </p>
                      )}
                      <p className="text-sm text-orange-700 dark:text-orange-300 mb-2">Este pedido requiere que el usuario presente un documento para completar la solicitud.</p>
                      {/*<p className="text-sm text-orange-700 dark:text-orange-300 mb-2">{futureAction.descripcionAccion}</p> */}
                      {daysRemaining !== null && <p className={`text-sm font-medium ${daysRemaining <= 2 ? "text-red-600 dark:text-red-400" : "text-orange-600 dark:text-orange-400"}`}>{daysRemaining > 0 ? `El usuario tiene ${daysRemaining} día${daysRemaining !== 1 ? "s" : ""} para presentar el documento` : daysRemaining === 0 ? "El plazo vence hoy" : `El plazo venció hace ${Math.abs(daysRemaining)} día${Math.abs(daysRemaining) !== 1 ? "s" : ""}`}</p>}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4 pt-6 border-t border-slate-200 dark:border-slate-700">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Fecha de Solicitud</p>
                <p className="font-medium text-slate-800 dark:text-slate-100">{formatDateShort(selectedOrder.requestedAt)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Fecha de Aprobación</p>
                <p className="font-medium text-slate-800 dark:text-slate-100">{formatDateShort(selectedOrder.approvedAt)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Fecha de Entrega</p>
                <p className="font-medium text-slate-800 dark:text-slate-100">{formatDateShort(selectedOrder.deliveredAt)}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={showDocModal} onClose={() => setShowDocModal(false)} title="Estado de Documentos">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border-2 border-red-500 dark:border-red-400">
            <div className="flex items-center gap-3">
              <FontAwesomeIcon icon={faFileArrowUp} className="h-5 w-5 text-red-600 dark:text-red-400" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">Documentos Vencidos</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Fecha límite superada</p>
              </div>
            </div>
            <span className="text-2xl font-bold text-red-600 dark:text-red-400 animate-pulse">{docStats.overdue}</span>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-3">
              <FontAwesomeIcon icon={faFileArrowUp} className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">Documentos por Vencer</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">3 días o menos restantes</p>
              </div>
            </div>
            <span className="text-2xl font-bold text-orange-600 dark:text-orange-400">{docStats.urgent}</span>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-3">
              <FontAwesomeIcon icon={faFileArrowUp} className="h-5 w-5 text-green-600 dark:text-green-400" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">Documentos Pendientes</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Más de 3 días restantes</p>
              </div>
            </div>
            <span className="text-2xl font-bold text-green-600 dark:text-green-400">{docStats.normal}</span>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-3">
              <FontAwesomeIcon icon={faCheckCircle} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">Documentos Subidos</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Pendientes de revisión</p>
              </div>
            </div>
            <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{docStats.uploaded}</span>
          </div>

          {docStats.total === 0 && (
            <div className="text-center py-6 text-gray-500 dark:text-gray-400">
              <FontAwesomeIcon icon={faCheckCircle} className="h-12 w-12 mb-2" />
              <p className="font-medium">No hay documentos pendientes</p>
            </div>
          )}
        </div>
      </Modal>
    </PageLayout>
  );
};
