import React, { useState, useEffect } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faCalendar, faShoppingCart, faListCheck, faTable, faGrip, faFileArrowUp, faTriangleExclamation, faClock, faCheckCircle, faTimesCircle, faTruck, faBan, faTimes, faFilePdf, faDownload, faTrash, faCheck, faFileSignature, faChartSimple, faBell } from "@fortawesome/free-solid-svg-icons";
import { hrManagementAPI, Order } from "../api/management";
import { OrderConfig } from "../api/orderConfig";
import { projectsAPI } from "../api/projects";
import { companiesAPI, Company } from "../api/companies";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { PageLayout } from "../components/ui/PageLayout";
import { sweetAlert } from "../utils/sweetAlert";
import { ImageModal } from "../components/ui/ImageModal";
import { Modal } from "../components/ui/Modal";
import { CardItemGeneric } from "../components/ui/CardItemGeneric";
import { StatusBadge } from "../components/ui/StatusBadge";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { mapOrderStatusToStatusType, mapDocumentStateToStatusType, mapSignatureStateToStatusType, isOrderInFinalState } from "../utils/statusHelpers";
import { getFormattedOrderNumber } from "../utils/orderHelpers";
import { ProposedPersonalDataDetails } from "../components/orders/ProposedPersonalDataDetails";
import { isBankingProposal } from "../config/personalDataFields";

// 🔥 IMPORTAR HELP
import { getHelp, hasHelp } from "../data/help/helpContent";

export const OrdersPage: React.FC = () => {
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
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [stats, setStats] = useState<any>({ pending: 0, pre_approved: 0, approved: 0, rejected: 0, delivered: 0, cancelled: 0 });
  const [docStats, setDocStats] = useState({ total: 0, normal: 0, urgent: 0, overdue: 0, uploaded: 0 });

  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  // Empresa/membrete del PDF: sale del último contrato activo del usuario; si el contrato no tiene
  // empresa fija y el proyecto tiene varias, se pregunta cuál usar al descargar (dropdown).
  const [empresaInfo, setEmpresaInfo] = useState<{ hasContractEmpresa: boolean; contractEmpresa: { id: string; label: string } | null; projectEmpresas: { id: string; label: string }[] } | null>(null);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [regeneratingPdf, setRegeneratingPdf] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Al abrir el detalle de un pedido con PDF, resolvemos la info de empresa para la descarga.
  useEffect(() => {
    setDownloadMenuOpen(false);
    if (showDetailModal && selectedOrder?._id && selectedOrder?.pdfPreAprobacionUrl) {
      hrManagementAPI.orders
        .getEmpresaInfo(selectedOrder._id)
        .then(setEmpresaInfo)
        .catch(() => setEmpresaInfo(null));
    } else {
      setEmpresaInfo(null);
    }
  }, [showDetailModal, selectedOrder?._id, selectedOrder?.pdfPreAprobacionUrl]);

  /** Descarga el PDF con una empresa elegida: regenera y abre el nuevo PDF. */
  const handleDownloadWithEmpresa = async (empresaId: string) => {
    if (!selectedOrder) return;
    try {
      setRegeneratingPdf(true);
      const res = await hrManagementAPI.orders.regeneratePdf(selectedOrder._id, empresaId);
      setDownloadMenuOpen(false);
      if (res.pdfUrl) {
        window.open(`${import.meta.env.VITE_API_URL}${res.pdfUrl}`, "_blank");
        setSelectedOrder({ ...selectedOrder, pdfPreAprobacionUrl: res.pdfUrl } as Order);
      }
    } catch {
      /* noop */
    } finally {
      setRegeneratingPdf(false);
    }
  };

  // Proyectos + empresas para mostrar las empresas del proyecto en la tabla (badges por fila).
  const [projectsList, setProjectsList] = useState<any[]>([]);
  const [companiesList, setCompaniesList] = useState<Company[]>([]);

  const [showDocModal, setShowDocModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [isXXL, setIsXXL] = useState(window.innerWidth >= 1200);





  const helpEntry = getHelp(HELP_KEY);

  useEffect(() => {
    let timeoutId: any;

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
        { pending: 0, pre_approved: 0, approved: 0, rejected: 0, delivered: 0, cancelled: 0 },
      );
      setStats(newStats);

      const docCounts = { total: 0, normal: 0, urgent: 0, overdue: 0, uploaded: 0 };

      data.orders.forEach((order) => {
        const futureAction = order.futureActions && order.futureActions.length > 0 ? order.futureActions[0] : null;
        const docStatusType = mapDocumentStateToStatusType(futureAction);

        if (docStatusType) {
          docCounts.total++;

          if (docStatusType === "doc_vencido") {
            docCounts.overdue++;
          } else if (docStatusType === "doc_subido") {
            docCounts.uploaded++;
          } else {
            docCounts.normal++;
          }
        }
      });

      setDocStats(docCounts);
      return data.orders;
    } catch (error) {
      console.error("Error loading orders:", error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [page]);

  // Cargamos proyectos (con sus contratoEmpresas) y empresas una sola vez para poder mostrar
  // las empresas del proyecto en la tabla de pedidos.
  useEffect(() => {
    Promise.all([projectsAPI.listAll({ limit: 500 }), companiesAPI.list()])
      .then(([p, c]) => {
        setProjectsList(Array.isArray(p) ? p : (p as any).data || []);
        setCompaniesList(c);
      })
      .catch(() => {});
  }, []);

  const companyNameById = React.useMemo(() => {
    const m = new Map<string, string>();
    companiesList.forEach((c) => m.set(String(c._id), c.razonSocial));
    return m;
  }, [companiesList]);

  // projectId → razones sociales de las empresas del contrato del proyecto.
  const projectEmpresasMap = React.useMemo(() => {
    const m = new Map<string, string[]>();
    projectsList.forEach((p: any) => {
      const labels = ((p.contratoEmpresas as any[]) || []).map((id) => companyNameById.get(String(id))).filter((n): n is string => Boolean(n));
      m.set(String(p._id), labels);
    });
    return m;
  }, [projectsList, companyNameById]);

  /** Id del proyecto del solicitante del pedido (mismo criterio que el badge de Proyecto/s). */
  const getOrderProjectId = (order: Order): string => {
    const user = order.userId as any;
    if (user?.metadata?.projects?.length > 0) {
      return user.metadata.projects[0]?.projectId?._id || user.metadata.projects[0]?.projectId || "";
    }
    if (user?.projectIds?.length > 0) {
      return user.projectIds[0]?._id || user.projectIds[0] || "";
    }
    return "";
  };

  /** Badges con las empresas del proyecto del pedido (o "Sin empresa" si el proyecto no tiene). */
  const renderProjectEmpresas = (order: Order) => {
    const pid = getOrderProjectId(order);
    if (!pid) return null; // sin proyecto (ej. usuario desconocido) → no mostramos nada
    const labels = projectEmpresasMap.get(String(pid)) || [];
    if (labels.length === 0) {
      return <span className="text-[10px] text-gray-400 italic">Sin empresa</span>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {labels.map((n, i) => (
          <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50 w-fit">
            {n}
          </span>
        ))}
      </div>
    );
  };

  /*
  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      await hrManagementAPI.orders.update(orderId, { status: newStatus as any });
      await loadOrders();
      await sweetAlert.success("Estado actualizado", `El pedido ha sido ${newStatus === "approved" ? "aprobado" : newStatus === "rejected" ? "rechazado" : newStatus === "delivered" ? "marcado como entregado" : "actualizado"}`);
    } catch (error: any) {
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo actualizar el estado");
    }
  };
  */



  const handlePreApprove = async () => {
    if (!selectedOrder) return;

    try {
      setUpdatingStatus(true);
      const updatedOrder = await hrManagementAPI.orders.preApprove(selectedOrder._id);
      console.log("[PDF DEBUG FRONTEND] Updated order received:", updatedOrder);
      console.log("[PDF DEBUG FRONTEND] pdfPreAprobacionUrl:", updatedOrder.pdfPreAprobacionUrl);

      setSelectedOrder(updatedOrder);

      await loadOrders();
      setUpdatingStatus(false);

      if (updatedOrder.pdfPreAprobacionUrl) {
        await sweetAlert.success("Preaprobado", "El pedido ha sido pre-aprobado correctamente y se ha generado el PDF");
      } else {
        await sweetAlert.success("Preaprobado", "El pedido ha sido pre-aprobado correctamente");
      }
    } catch (error: any) {
      setUpdatingStatus(false);
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo pre-aprobar el pedido");
    }
  };

  const handleApprove = async () => {
    if (!selectedOrder) return;

    const requiresSignature = selectedOrder.requiresSignature || (selectedOrder.signatureStatus && selectedOrder.signatureStatus !== "not_required");
    const confirmMessage = requiresSignature ? "Al aprobarse este pedido, se enviará una notificación para informar que el documento ya se encuentra cargado en la plataforma y listo para su firma." : "El pedido será aprobado y el usuario será notificado.";

    const result = await sweetAlert.confirm("¿Aprobar esta solicitud?", confirmMessage, "Sí, Aprobar", "Cancelar");
    if (!result.isConfirmed) return;

    try {
      setUpdatingStatus(true);
      await hrManagementAPI.orders.approve(selectedOrder._id);

      const successMessage = selectedOrder.requiresSignature ? "Se le ha enviado un email con el documento para firmar." : "El pedido ha sido aprobado correctamente";

      const updatedOrders = await loadOrders();
      const refreshedOrder = updatedOrders.find((o) => o._id === selectedOrder._id);
      if (refreshedOrder) {
        setSelectedOrder(refreshedOrder);
      }
      setUpdatingStatus(false);
      await sweetAlert.success("Aprobado", successMessage);
    } catch (error: any) {
      setUpdatingStatus(false);
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo aprobar el pedido");
    }
  };

  const handleReject = async () => {
    if (!selectedOrder) return;

    const result = await sweetAlert.confirm("¿Rechazar este pedido?", "El pedido será rechazado y el usuario será notificado.", "Sí, Rechazar", "Cancelar");
    if (!result.isConfirmed) return;

    try {
      setUpdatingStatus(true);
      await hrManagementAPI.orders.reject(selectedOrder._id);
      const updatedOrders = await loadOrders();
      const refreshedOrder = updatedOrders.find((o) => o._id === selectedOrder._id);
      if (refreshedOrder) {
        setSelectedOrder(refreshedOrder);
      }
      setUpdatingStatus(false);
      await sweetAlert.success("Rechazado", "El pedido ha sido rechazado");
    } catch (error: any) {
      setUpdatingStatus(false);
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo rechazar el pedido");
    }
  };

  const handleDeliver = async () => {
    if (!selectedOrder) return;

    const result = await sweetAlert.confirm("¿Marcar como Entregado?", "El pedido será marcado como entregado.", "Sí, Marcar como Entregado", "Cancelar");
    if (!result.isConfirmed) return;

    try {
      setUpdatingStatus(true);
      await hrManagementAPI.orders.deliver(selectedOrder._id);
      const updatedOrders = await loadOrders();
      const refreshedOrder = updatedOrders.find((o) => o._id === selectedOrder._id);
      if (refreshedOrder) {
        setSelectedOrder(refreshedOrder);
      }
      setUpdatingStatus(false);
      await sweetAlert.success("Entregado", "El pedido ha sido marcado como entregado");
    } catch (error: any) {
      setUpdatingStatus(false);
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo marcar como entregado");
    }
  };

  const handleConfirmBankingChange = async () => {
    if (!selectedOrder) return;

    const result = await sweetAlert.confirm(
      "¿Confirmar cambio de datos bancarios?",
      "Confirmás que el cambio de datos bancarios de este pedido ya fue aplicado en el banco/FRAME.",
      "Sí, confirmar",
      "Cancelar",
    );
    if (!result.isConfirmed) return;

    try {
      setUpdatingStatus(true);
      await hrManagementAPI.orders.confirmBankingChange(selectedOrder._id);
      const updatedOrders = await loadOrders();
      const refreshedOrder = updatedOrders.find((o) => o._id === selectedOrder._id);
      if (refreshedOrder) {
        setSelectedOrder(refreshedOrder);
      }
      setUpdatingStatus(false);
      await sweetAlert.success("Cambio confirmado", "El cambio de datos bancarios quedó confirmado.");
    } catch (error: any) {
      setUpdatingStatus(false);
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo confirmar el cambio.");
    }
  };

  const handleCancel = async () => {
    if (!selectedOrder) return;

    const result = await sweetAlert.confirm("¿Cancelar pedido entregado?", "El pedido pasará a estado Cancelado.", "Sí, Cancelar", "No hacer nada");
    if (!result.isConfirmed) return;

    try {
      setUpdatingStatus(true);
      await hrManagementAPI.orders.update(selectedOrder._id, { status: "cancelled" });
      const updatedOrders = await loadOrders();
      const refreshedOrder = updatedOrders.find((o) => o._id === selectedOrder._id);
      if (refreshedOrder) {
        setSelectedOrder(refreshedOrder);
      }
      setUpdatingStatus(false);
      await sweetAlert.success("Cancelado", "El pedido ha sido cancelado");
    } catch (error: any) {
      setUpdatingStatus(false);
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo cancelar el pedido");
    }
  };

  const handleDelete = async (orderId: string, orderNumber: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    const result = await sweetAlert.confirm("¿Eliminar este pedido?", `El pedido ${getFormattedOrderNumber(orderNumber)} será eliminado permanentemente. Esta acción no se puede deshacer.`, "Sí, Eliminar", "Cancelar");

    if (!result.isConfirmed) return;

    try {
      await hrManagementAPI.orders.delete(orderId);
      await loadOrders();

      if (selectedOrder && selectedOrder._id === orderId) {
        setSelectedOrder(null);
        setShowDetailModal(false);
      }

      await sweetAlert.success("Eliminado", "El pedido ha sido eliminado correctamente");
    } catch (error: any) {
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo eliminar el pedido");
    }
  };

  const filteredOrders = orders.filter((order) => {
    const categoryName = typeof order.categoryId === "object" && order.categoryId?.name ? order.categoryId.name : order.category;
    const subcategoryText = order.subcategories?.join(", ") || "";
    const orderDisplayName = `${categoryName} ${subcategoryText}`.toLowerCase();

    const matchesSearch = !searchTerm || orderDisplayName.includes(searchTerm.toLowerCase()) || order.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || order.status === statusFilter;

    // Filter by project
    const user = order.userId as any;
    let orderProjectIdRaw = "";
    if (user?.metadata?.projects?.length > 0) {
      orderProjectIdRaw = user.metadata.projects[0]?.projectId?._id || user.metadata.projects[0]?.projectId || "";
    } else if (user?.projectIds?.length > 0) {
      orderProjectIdRaw = user.projectIds[0]?._id || user.projectIds[0] || "";
    }

    const matchesProject = projectFilter === "all" || orderProjectIdRaw === projectFilter;

    return matchesSearch && matchesStatus && matchesProject;
  });

  const uniqueProjects = React.useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((order) => {
      const user = order.userId as any;
      if (user?.metadata?.projects?.length > 0) {
        const pId = user.metadata.projects[0]?.projectId?._id || user.metadata.projects[0]?.projectId;
        const pName = user.metadata.projects[0]?.nombre_proyecto || user.metadata.projects[0]?.projectId?.name;
        if (pId && pName) map.set(pId, pName);
      } else if (user?.projectIds?.length > 0) {
        const pId = user.projectIds[0]?._id || user.projectIds[0];
        const pName = user.projectIds[0]?.name;
        if (pId && pName) map.set(pId, pName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [orders]);

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

    const result = await sweetAlert.confirm("¿Enviar para Firma?", "El documento será enviado al usuario para su firma.", "Sí, Enviar", "Cancelar");
    if (!result.isConfirmed) return;

    try {
      setUpdatingStatus(true);
      await hrManagementAPI.orders.sendSignature(selectedOrder._id);
      const updatedOrders = await loadOrders();
      const refreshedOrder = updatedOrders.find((o) => o._id === selectedOrder._id);
      if (refreshedOrder) {
        setSelectedOrder(refreshedOrder);
      }
      setUpdatingStatus(false);
      await sweetAlert.success("Enviado", "El documento ha sido enviado para firma");
    } catch (error: any) {
      setUpdatingStatus(false);
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo enviar para firma");
    }
  };

  const handleMarkSigned = async () => {
    if (!selectedOrder) return;

    const result = await sweetAlert.confirm("¿Confirmar firma del documento?", "Esto marcará el documento como firmado. Asegurate de haber verificado que la firma fue completada correctamente.", "Sí, confirmar firma", "Cancelar");
    if (!result.isConfirmed) return;

    try {
      setUpdatingStatus(true);
      await hrManagementAPI.orders.markSigned(selectedOrder._id);
      const updatedOrders = await loadOrders();
      const refreshedOrder = updatedOrders.find((o) => o._id === selectedOrder._id);
      if (refreshedOrder) {
        setSelectedOrder(refreshedOrder);
      }
      setUpdatingStatus(false);
      await sweetAlert.success("Firma confirmada", "El documento ha sido marcado como firmado. El usuario será notificado.");
    } catch (error: any) {
      setUpdatingStatus(false);
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo confirmar la firma");
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
    if (typeof user === "string") return "Usuario desconocido";
    const firstName = user.firstName || "";
    const lastName = user.lastName || "";
    if (firstName || lastName) return `${firstName} ${lastName}`.trim();
    return user.email || "Usuario desconocido";
  };

  const renderUserClientBadge = (user: any) => {
    if (!user || typeof user === "string") return <span className="text-xs text-gray-500">-</span>;

    if (user.metadata?.projects?.length > 0) {
      const clientName = user.metadata.projects[0]?.projectId?.clientId?.name;
      if (clientName) {
        return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300">{clientName}</span>;
      }
    }

    if (user.clientIds && user.clientIds.length > 0) {
      const clientName = user.clientIds[0]?.name;
      if (clientName) {
        return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300">{clientName}</span>;
      }
    }

    return <span className="text-xs text-gray-400">-</span>;
  };

  const renderUserRoleBadge = (user: any) => {
    if (!user || typeof user === "string") return <span className="text-xs text-gray-500">-</span>;

    if (user.metadata?.projects?.length > 0) {
      const role = user.metadata.projects[0]?.nombre_rol_frame;
      if (role) {
        return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-300">{role}</span>;
      }
    }

    return <span className="text-xs text-gray-400">-</span>;
  };

  const renderUserProjectBadge = (user: any) => {
    if (!user || typeof user === "string") return <span className="text-xs text-gray-500">-</span>;

    if (user.metadata?.projects?.length > 0) {
      const projectName = user.metadata.projects[0]?.nombre_proyecto;
      if (projectName) {
        return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-300">{projectName}</span>;
      }
    }

    if (user.projectIds && user.projectIds.length > 0) {
      const projectName = user.projectIds[0]?.name;
      if (projectName) {
        return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-300">{projectName}</span>;
      }
    }

    return <span className="text-xs text-gray-400">-</span>;
  };

  const renderSignatureStatus = (order: Order) => {
    const signatureStatusType = mapSignatureStateToStatusType(order);
    const isInFinalState = isOrderInFinalState(order.status);
    const isFinalStatus = ["delivered", "cancelled", "rejected"].includes(order.status);

    if (!signatureStatusType) {
      return <span className="text-xs text-gray-500 dark:text-gray-400">-</span>;
    }

    const isWaitingVerification = order.signatureStatus === "sent" && order.signatureNotifiedAt;

    return (
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <StatusBadge type={signatureStatusType} size="sm" overrideStyle={isInFinalState} />
        </div>
        <div className="flex gap-3">
          {isWaitingVerification && <FontAwesomeIcon icon={faClock} className={`${isFinalStatus ? "text-gray-600 dark:text-gray-400" : "text-amber-500 dark:text-amber-400"} text-sm`} title="Usuario notificó que completó la firma - Esperando verificación" />}
          {order.pdfPreAprobacionUrl && (
            <a href={`${import.meta.env.VITE_API_URL}${order.pdfPreAprobacionUrl}`} target="_blank" rel="noopener noreferrer" className={`${isFinalStatus ? "text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300" : "text-violet-600 hover:text-violet-800 dark:text-violet-600 dark:hover:text-violet-300"} transition-colors`} title="Descargar documento PDF" onClick={(e) => e.stopPropagation()}>
              <FontAwesomeIcon icon={faFilePdf} className="text-lg" />
            </a>
          )}
        </div>
      </div>
    );
  };

  /*
  const getCategoryLabel = (category: string) => category;
  */

  /*
  const getCategoryTypeName = (categoryType?: CategoryType): string => {
    const typeNames: Record<CategoryType, string> = {
      fecha: "Fecha",
      dinero: "Dinero",
      objeto: "Objeto",
      otros: "Otros",
    };
    return categoryType ? typeNames[categoryType] : "N/A";
  };
  */

  /*
  const getSubcategoryDisplay = (order: Order): string => {
    if (!order.categoryId || typeof order.categoryId === "string") return "N/A";

    const category = order.categoryId as OrderConfig;

    if (!order.subcategories || order.subcategories.length === 0 || !category.config.subtipos) return "Sin opciones";

    const labels = order.subcategories.map((subId) => {
      const selectedSubtype = category.config.subtipos?.find((st) => st.id === subId);
      return selectedSubtype ? selectedSubtype.label : subId;
    });

    return labels.join(", ");
  };
  */

  const getSubcategoriesArray = (order: Order): string[] => {
    if (!order.categoryId || typeof order.categoryId === "string") return [];

    const category = order.categoryId as OrderConfig;

    if (!order.subcategories || order.subcategories.length === 0 || !category.config.subtipos) return [];

    const labels = order.subcategories
      .map((subId) => {
        const selectedSubtype = category.config.subtipos?.find((st) => st.id === subId);
        return selectedSubtype ? selectedSubtype.label : null;
      })
      .filter((label): label is string => Boolean(label));

    return labels;
  };

  /*
  const hasRequiresAction = (order: Order): boolean => {
    if (!order.categoryId || typeof order.categoryId === "string") return false;
    const category = order.categoryId as OrderConfig;
    return category.requiresAction || false;
  };
  */

  const getCategoryName = (order: Order): string => {
    if (!order.categoryId) return order.category || "Sin categoría";
    if (typeof order.categoryId === "string") return order.category || "Sin categoría";
    const category = order.categoryId as OrderConfig;
    return category.name || order.category || "Sin categoría";
  };

  /*
  const getUserRole = (user: any): string => {
    if (!user) return "Usuario";
    if (typeof user === "string") return "Usuario";
    if (user.role) return user.role;
    return "Empleado";
  };
  */

  const getUserAvatar = (user: any): string | null => {
    if (!user || typeof user === "string") return null;
    return user.avatar || user.photoUrl || null;
  };

  const formatDateShort = (dateString: string | undefined): string => {
    if (!dateString) return "-";
    // Si contiene T, asumimos ISO string completo (con hora), pero si es solo YYYY-MM-DD
    // intentamos parsear manualmente para evitar timezone shifts si es medianoche UTC.
    if (typeof dateString === "string" && !dateString.includes("T") && /^\d{4}-\d{2}-\d{2}/.test(dateString)) {
      const datePart = dateString.toString().split("T")[0];
      const parts = datePart.split("-");
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        // Usamos Date(year, month-1, day) para constructor LOCAL
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      }
    }

    return new Date(dateString).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  /*
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
  */

  /*
  const getCardBadges = (order: Order) => {
    const badges = [
      {
        text: getFormattedOrderNumber(order.orderNumber),
        className: "text-xs bg-gray-50 dark:bg-gray-600/20 text-gray-600 dark:text-gray-400 px-2 py-1 rounded",
      },
    ];

    return badges;
  };
  */

  const getAvatarFallback = (user: any): string => {
    const name = getUserName(user);
    return name
      .split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const renderCardsView = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredOrders.map((order) => {
          const avatarUrl = getUserAvatar(order.userId);
          const futureAction = order.futureActions && order.futureActions.length > 0 ? order.futureActions[0] : null;
          const docStatusType = mapDocumentStateToStatusType(futureAction);
          const isInFinalState = isOrderInFinalState(order.status);

          const badgesTop = [
            <span key="order-number" className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/20 dark:text-gray-400">
              {getFormattedOrderNumber(order.orderNumber)}
            </span>,
            <StatusBadge key="status" type={mapOrderStatusToStatusType(order.status)} size="sm" />,
            docStatusType ? <StatusBadge key="doc-status" type={docStatusType} size="sm" overrideStyle={isInFinalState} /> : null,
            <StatusBadge key="signature" type={mapSignatureStateToStatusType(order)} size="sm" overrideStyle={isInFinalState} />,
            order.signatureStatus === "sent" && order.signatureNotifiedAt ? <FontAwesomeIcon key="clock-icon" icon={faClock} className={`${["delivered", "rejected", "cancelled"].includes(order.status) ? "text-gray-600 dark:text-gray-400" : "text-amber-500 dark:text-amber-400"} text-sm`} title="Esperando verificación de firma" /> : null,
            order.pdfPreAprobacionUrl ? <FontAwesomeIcon key="pdf-icon" icon={faFilePdf} className={`${["delivered", "rejected", "cancelled"].includes(order.status) ? "text-gray-600 dark:text-gray-400" : "text-violet-600 dark:text-violet-600"} text-sm`} title="PDF disponible" /> : null,
          ].filter(Boolean);

          const badgesBottom = [
            <span key="category" className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/50 dark:text-gray-300">
              {getCategoryName(order)}
            </span>,
            ...getSubcategoriesArray(order).map((subcategory, index) => (
              <span key={`subcategory-${index}`} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/20 dark:text-gray-400">
                {subcategory}
              </span>
            )),
          ];

          return (
            <CardItemGeneric
              key={order._id}
              title={getUserName(order.userId)}
              subtitle={
                <div className="flex flex-wrap gap-2">
                  {renderUserClientBadge(order.userId)}
                  {renderUserProjectBadge(order.userId)}
                  {renderUserRoleBadge(order.userId)}
                </div>
              }
              avatarUrl={avatarUrl}
              avatarFallback={getAvatarFallback(order.userId)}
              badgesTop={badgesTop}
              badgesBottom={badgesBottom}
              footerLeft={
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <FontAwesomeIcon icon={faCalendar} className="h-3 w-3" />
                  <span>{formatDateShort(order.requestedAt)}</span>
                </div>
              }
              footerActions={[
                {
                  icon: faTrash,
                  onClick: (e: any) => {
                    e?.stopPropagation();
                    handleDelete(order._id, order.orderNumber, e);
                  },
                  title: "Eliminar pedido",
                  variant: "default",
                },
              ]}
              onClick={() => {
                setSelectedOrder(order);
                setShowDetailModal(true);
              }}
            >
              {null}
            </CardItemGeneric>
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
          <button onClick={handleReject} disabled={updatingStatus} className="px-6 py-2.5 rounded bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-500/20 dark:hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex gap-1">
            <FontAwesomeIcon icon={faBan} className="text-lg" />
            Rechazar
          </button>
          <button onClick={handlePreApprove} disabled={updatingStatus} className="px-6 py-2.5 rounded bg-cyan-500 text-white font-semibold text-sm hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex gap-1">
            <FontAwesomeIcon icon={faCheck} className="text-lg" />
            Pre-Aprobar
          </button>
        </>
      );
    }

    if (selectedOrder.status === "pre_approved") {
      return (
        <>
          <button onClick={handleReject} disabled={updatingStatus} className="px-6 py-2.5 rounded bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-500/20 dark:hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex gap-1">
            <FontAwesomeIcon icon={faBan} className="text-lg" />
            Rechazar
          </button>
          <button onClick={handleApprove} disabled={updatingStatus} className="px-6 py-2.5 rounded bg-blue-500 text-white font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex gap-1">
            <FontAwesomeIcon icon={faCheck} className="text-lg" />
            Aprobar
          </button>
        </>
      );
    }

    if (selectedOrder.status === "approved") {
      const orderRequiresSignature = selectedOrder.requiresSignature || (selectedOrder.signatureStatus && selectedOrder.signatureStatus !== "not_required");
      return (
        <>
          <button onClick={handleReject} disabled={updatingStatus} className="px-6 py-2.5 rounded bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-500/20 dark:hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex gap-1">
            <FontAwesomeIcon icon={faBan} className="text-lg" />
            Rechazar
          </button>

          {orderRequiresSignature && (
            <>
              {selectedOrder.signatureStatus === "pending" && (
                <button onClick={handleSendSignature} disabled={updatingStatus} className="px-6 py-2.5 rounded bg-gray-500 text-white font-semibold text-sm hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                  <FontAwesomeIcon icon={faFileArrowUp} />
                  Enviar para Firma
                </button>
              )}
              {selectedOrder.signatureStatus === "sent" && (
                <button onClick={handleMarkSigned} disabled={updatingStatus} className="px-6 py-2.5 rounded bg-blue-500 text-white font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                  <FontAwesomeIcon icon={faCheckCircle} />
                  Firmado
                </button>
              )}
            </>
          )}

          {(!orderRequiresSignature || selectedOrder.signatureStatus === "signed") && (
            <button onClick={handleDeliver} disabled={updatingStatus} className="px-6 py-2.5 rounded bg-blue-500 text-white font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
              <FontAwesomeIcon icon={faTruck} />
              Marcar como Entregado
            </button>
          )}
        </>
      );
    }

    if (selectedOrder.status === "delivered") {
      return (
        <button onClick={handleCancel} disabled={updatingStatus} className="px-6 py-2.5 rounded bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-500/20 dark:hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex gap-1">
          <FontAwesomeIcon icon={faBan} className="text-lg" />
          Cancelar Pedido
        </button>
      );
    }

    return null;
  };

  return (
    <PageLayout
      title="Pedidos"
      itemCount={filteredOrders.length}
      subtitle="Administra todos los pedidos del personal"
      faIcon={{ icon: faShoppingCart }}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry?.title || "Ayuda",
        size: helpEntry?.size as any,
        content: helpEntry?.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      headerActions={
        <div className="flex items-center gap-2">
          <button onClick={() => setShowStatsModal(true)} className="p-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm" aria-label="Ver resumen de pedidos" title="Ver resumen de pedidos">
            <FontAwesomeIcon icon={faChartSimple} className="h-4 w-4" />
          </button>
        </div>
      }
      /*
        Los filtros viven en el modal de «Filtros», no sueltos en la barra: son el mismo control que en
        Usuarios, y así la fila de arriba no crece con cada filtro nuevo. Lo aplicado queda a la vista
        como badges con su X, que es lo que evita el clásico "no aparece nada" con un filtro puesto y
        olvidado.

        El sentinela sigue siendo "all" adentro de la página —lo leen `matchesStatus`, `matchesProject`
        y el texto del vacío— y se traduce a "" en el borde: `SearchAndFilters` usa el vacío como "sin
        filtro" para decidir el badge y el contador. Traducir acá es más seguro que renombrar el
        sentinela en los cinco lugares donde se compara.
      */
      searchAndFilters={
        <SearchAndFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar pedidos..."
          selectFilters={[
            {
              label: "Proyecto",
              value: projectFilter === "all" ? "" : projectFilter,
              onChange: (v) => setProjectFilter(v || "all"),
              placeholder: "Todos los Proyectos",
              options: uniqueProjects.map((p) => ({ value: p.id, label: p.name })),
            },
            {
              label: "Estado",
              value: statusFilter === "all" ? "" : statusFilter,
              onChange: (v) => setStatusFilter(v || "all"),
              placeholder: "Todos los estados",
              options: [
                { value: "pending", label: "Pendientes" },
                { value: "pre_approved", label: "Preaprobados" },
                { value: "approved", label: "Aprobados" },
                { value: "rejected", label: "Rechazados" },
                { value: "delivered", label: "Entregados" },
                { value: "cancelled", label: "Cancelados" },
              ],
            },
          ]}
          extraActions={
            isXXL ? (
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setViewMode("cards")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "cards" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tarjetas" aria-label="Vista de tarjetas">
                  <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
                </button>
                <button onClick={() => setViewMode("table")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "table" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tabla" aria-label="Vista de tabla">
                  <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
                </button>
              </div>
            ) : undefined
          }
        />
      }
    >
      <div className="space-y-6">
        <div>
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <LoadingSpinner message="Cargando pedidos..." />
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
                        <th className="text-left text-nowrap py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">N° Pedido</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 text-nowrap">Fecha Sol.</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Tipo</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Solicitante</th>
                        {/*<th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Cliente/s</th>*/}
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Proyecto/s</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Rol</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Estado</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Documento</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Firma</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300"></th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredOrders.map((order) => {
                        return (
                          <tr
                            key={order._id}
                            className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                            onClick={() => {
                              setSelectedOrder(order);
                              setShowDetailModal(true);
                            }}
                          >
                            <td className="py-3 px-4">
                              <span className="bg-gray-50 dark:bg-gray-600/20 text-xs text-nowrap text-gray-600 dark:text-gray-400 px-2 rounded">{getFormattedOrderNumber(order.orderNumber)}</span>
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400 text-nowrap">{formatDateShort(order.requestedAt)}</td>
                            <td className="py-3 px-4">
                              <div className="flex flex-col gap-2">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/50 dark:text-gray-300 text-nowrap w-fit">{getCategoryName(order)}</span>

                                {getSubcategoriesArray(order).map((subcategory, index) => (
                                  <span key={index} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mediumbg-gray-50 text-gray-600 dark:bg-gray-600/20 dark:text-gray-400 text-nowrap w-fit">
                                    {subcategory}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300 text-nowrap">{getUserName(order.userId)}</td>
                            {/* <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{renderUserClientBadge(order.userId)}</td>*/}
                            <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
                              <div className="flex flex-col gap-1">
                                {renderUserProjectBadge(order.userId)}
                                {renderProjectEmpresas(order)}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{renderUserRoleBadge(order.userId)}</td>
                            <td className="py-3 px-4">
                              <StatusBadge type={mapOrderStatusToStatusType(order.status)} size="sm" />
                            </td>
                            <td className="py-3 px-4">
                              {(() => {
                                const futureAction = order.futureActions && order.futureActions.length > 0 ? order.futureActions[0] : null;
                                const docStatusType = mapDocumentStateToStatusType(futureAction);
                                const isInFinalState = isOrderInFinalState(order.status);

                                if (!docStatusType) {
                                  return <span className="text-gray-400 dark:text-gray-600 text-sm">-</span>;
                                }

                                return <StatusBadge type={docStatusType} size="sm" overrideStyle={isInFinalState} />;
                              })()}
                            </td>
                            <td className="py-3 px-4">{renderSignatureStatus(order)}</td>
                            <td className="py-3 px-4 text-center">
                              <button onClick={(e) => handleDelete(order._id, order.orderNumber, e)} className="text-gray-400 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 transition-colors" title="Eliminar pedido" aria-label="Eliminar pedido">
                                <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                              </button>
                            </td>
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
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    Anterior
                  </button>
                  <span className="text-gray-600 dark:text-gray-400">
                    Página {page} de {totalPages}
                  </span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
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
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Detalles del Pedido</h2>
              {currentOrderIndex >= 0 && (
                <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                  {currentOrderIndex + 1} de {filteredOrders.length}
                </span>
              )}
            </div>
            <button onClick={() => setShowDetailModal(false)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Cerrar modal" title="Cerrar">
              <FontAwesomeIcon icon={faTimes} className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        }
      >
        {selectedOrder && (
          <div className="space-y-6">
            <div className="flex flex-wrap justify-between gap-3">
              <span>
                <p className="text-sm px-2 text-gray-600 dark:bg-gray-600/20 dark:text-gray-400 rounded">Nº Pedido: {getFormattedOrderNumber(selectedOrder.orderNumber)}</p>
              </span>
              <div className="flex flex-wrap gap-2">
                <StatusBadge type={mapOrderStatusToStatusType(selectedOrder.status)} size="sm" />
                {(() => {
                  const futureAction = selectedOrder.futureActions && selectedOrder.futureActions.length > 0 ? selectedOrder.futureActions[0] : null;
                  const docStatusType = mapDocumentStateToStatusType(futureAction);
                  const isInFinalState = isOrderInFinalState(selectedOrder.status);

                  if (!docStatusType) return null;

                  const documentUrl = selectedOrder.documentoUrl || futureAction?.documentoUrl || (selectedOrder.documents && selectedOrder.documents.length > 0 ? selectedOrder.documents[0].fileUrl : undefined);
                  const isDocumentUploaded = ((docStatusType as string) === "doc_subido" || (docStatusType as string) === "documento_presentado") && documentUrl;

                  if (isDocumentUploaded) {
                    return (
                      <button onClick={() => setViewingImage(`${import.meta.env.VITE_API_URL}${documentUrl}`)} className="hover:opacity-80 transition-opacity" title="Ver documento">
                        <StatusBadge type={docStatusType} size="sm" overrideStyle={isInFinalState} />
                      </button>
                    );
                  }

                  return <StatusBadge type={docStatusType} size="sm" overrideStyle={isInFinalState} />;
                })()}
                <div className="flex items-center gap-1.5">
                  <StatusBadge type={mapSignatureStateToStatusType(selectedOrder)} size="sm" overrideStyle={isOrderInFinalState(selectedOrder.status)} />
                  {selectedOrder.signatureStatus === "sent" && selectedOrder.signatureNotifiedAt && <FontAwesomeIcon icon={faClock} className={`${["delivered", "rejected", "cancelled"].includes(selectedOrder.status) ? "text-gray-600 dark:text-gray-400" : "text-amber-500 dark:text-amber-400"} text-sm`} title="Esperando verificación de firma" />}
                  {selectedOrder.pdfPreAprobacionUrl && <FontAwesomeIcon icon={faFilePdf} className={`${["delivered", "rejected", "cancelled"].includes(selectedOrder.status) ? "text-gray-600 dark:text-gray-400" : "text-violet-600 dark:text-violet-600"} text-sm`} title="PDF disponible" />}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div>
                {getUserAvatar(selectedOrder.userId) ? (
                  <img alt={`Foto de perfil de ${getUserName(selectedOrder.userId)}`} className="w-10 h-10 rounded object-cover" src={`${import.meta.env.VITE_API_URL}${getUserAvatar(selectedOrder.userId)}`} />
                ) : (
                  <div className="w-10 h-10 rounded bg-blue-500 dark:bg-blue-600 flex items-center justify-center text-white font-semibold">
                    {getUserName(selectedOrder.userId)
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </div>
                )}
              </div>
              <div className="bg-slate-800">
                <p className="font-semibold text-slate-800 dark:text-slate-100">{getUserName(selectedOrder.userId)}</p>
                <div className="text-sm text-slate-500 dark:text-slate-400">{renderUserRoleBadge(selectedOrder.userId)}</div>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Tipo de pedido</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded text-sm font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/50 dark:text-gray-300">{getCategoryName(selectedOrder)}</span>
                  {getSubcategoriesArray(selectedOrder).map((subcategory, index) => (
                    <span key={index} className="inline-flex items-center px-2 py-0.5 rounded text-sm font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/20 dark:text-gray-400">
                      {subcategory}
                    </span>
                  ))}
                </div>
              </div>
              {(selectedOrder.categoryId as any)?.categoryType === "datos_personales" && (selectedOrder as any).metadata?.proposedUserData && (
                <ProposedPersonalDataDetails proposedUserData={(selectedOrder as any).metadata.proposedUserData} />
              )}
              {isBankingProposal((selectedOrder as any).metadata?.proposedUserData) && (
                (selectedOrder as any).metadata?.bankChangeConfirmed ? (
                  <div className="flex items-start gap-3 rounded-lg border border-emerald-300 dark:border-emerald-700/60 bg-emerald-50 dark:bg-emerald-900/20 p-4">
                    <FontAwesomeIcon icon={faCheck} className="text-emerald-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Cambio de datos bancarios confirmado</p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400/90 mt-0.5">
                        El cambio fue aplicado en el banco/FRAME.
                        {(selectedOrder as any).metadata?.bankChangeConfirmedAt && (
                          <> Confirmado el {new Date((selectedOrder as any).metadata.bankChangeConfirmedAt).toLocaleDateString("es-AR")}.</>
                        )}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 p-4">
                    <FontAwesomeIcon icon={faBell} className="text-amber-500 mt-0.5 animate-pulse shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Notificación pendiente: cambio de datos bancarios</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400/90 mt-0.5">
                        Este pedido modifica datos bancarios. Aplicá el cambio en el banco/FRAME y luego confirmá la notificación.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleConfirmBankingChange}
                      disabled={updatingStatus}
                      title="Confirmar que el cambio de datos bancarios fue aplicado"
                      className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <FontAwesomeIcon icon={faCheck} />
                      Confirmar notificación
                    </button>
                  </div>
                )
              )}
              {selectedOrder.pdfPreAprobacionUrl && (() => {
                // Empresa(s) para descargar: si el contrato del solicitante tiene empresa fija, se usa SOLO esa
                // (descarga directa con ella); si no, se ofrecen todas las empresas del proyecto para elegir.
                // Réplica de la fila "Contrato | Empresa" del modal de Contratos.
                const effectiveEmpresas =
                  empresaInfo?.hasContractEmpresa && empresaInfo.contractEmpresa
                    ? [empresaInfo.contractEmpresa]
                    : empresaInfo?.projectEmpresas ?? [];
                const empresaLabel = effectiveEmpresas.map((e) => e.label).join(" | ");
                const docLabel = getCategoryName(selectedOrder);
                const multiEmpresa = effectiveEmpresas.length > 1;

                return (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Documento | Empresa</p>
                    <div className="flex items-center justify-between gap-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5">
                      <span className="text-sm text-gray-700 dark:text-gray-200 flex items-center gap-1.5 flex-wrap min-w-0" title={empresaLabel ? `${docLabel} | ${empresaLabel}` : docLabel}>
                        <FontAwesomeIcon icon={faFilePdf} className="h-4 w-4 text-violet-600 shrink-0" />
                        <span className="truncate">{docLabel}</span>
                        {effectiveEmpresas.map((emp) => (
                          <span key={emp.id} className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50 shrink-0" title={empresaInfo?.hasContractEmpresa ? "Empresa fija del contrato" : "Empresa del proyecto"}>
                            {emp.label}
                          </span>
                        ))}
                        {effectiveEmpresas.length === 0 && <span className="text-[10px] text-gray-400 italic shrink-0">Sin empresa</span>}
                      </span>
                      {multiEmpresa ? (
                        <div className="relative shrink-0">
                          <button type="button" onClick={() => setDownloadMenuOpen((o) => !o)} disabled={regeneratingPdf} title="Elegir empresa para descargar" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                            <FontAwesomeIcon icon={regeneratingPdf ? faSpinner : faDownload} spin={regeneratingPdf} className="h-4 w-4" />
                          </button>
                          {downloadMenuOpen && !regeneratingPdf && (
                            <div className="absolute right-0 z-50 mt-1 w-56 max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
                              <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Descargar con:</p>
                              {effectiveEmpresas.map((e) => (
                                <button key={e.id} type="button" onClick={() => handleDownloadWithEmpresa(e.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                  <FontAwesomeIcon icon={faDownload} className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                  <span className="truncate">{e.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <a href={`${import.meta.env.VITE_API_URL}${selectedOrder.pdfPreAprobacionUrl}`} target="_blank" rel="noopener noreferrer" title="Descargar documento" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors shrink-0">
                          <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                    <p className="text-sm text-green-600 dark:text-green-400 mt-2 flex items-center gap-2">
                      <FontAwesomeIcon icon={faCheckCircle} />
                      Su pdf fue generado.
                    </p>
                  </div>
                );
              })()}
              <div className="flex gap-10 flex-wrap">
                {selectedOrder.amount && (
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Importe</p>
                    <p className="font-medium text-slate-800 dark:text-slate-100">$ {selectedOrder.amount.toFixed(2)}</p>
                  </div>
                )}
                {(() => {
                  const isDinero = (selectedOrder.categoryId && typeof selectedOrder.categoryId === "object" && (selectedOrder.categoryId as any).categoryType === "dinero") || selectedOrder.category === "dinero";
                  if (!isDinero) return null;

                  let installments = selectedOrder.installments;
                  if (!installments && typeof selectedOrder.categoryId === "object" && selectedOrder.categoryId) {
                    const category = selectedOrder.categoryId as any;
                    if (selectedOrder.subcategories && selectedOrder.subcategories.length > 0 && category.config?.subtipos) {
                      const subId = selectedOrder.subcategories[0];
                      const subtype = category.config.subtipos.find((st: any) => st.id === subId);
                      if (subtype?.repayment?.installments) {
                        installments = subtype.repayment.installments;
                      }
                    }
                    if (!installments && category.config?.repayment?.installments) {
                      installments = category.config.repayment.installments;
                    }
                  }

                  return (
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Cuotas</p>
                      <p className="font-medium text-slate-800 dark:text-slate-100">{installments || 1}</p>
                    </div>
                  );
                })()}
                {typeof selectedOrder.dynamicValue === "string" && !/^\d{4}-\d{2}-\d{2}/.test(selectedOrder.dynamicValue) && (
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{(selectedOrder.categoryId as any)?.categoryType === "otros" ? "Detalle" : "Objeto Especificado"}</p>
                    <p className="font-medium text-slate-800 dark:text-slate-100">{selectedOrder.dynamicValue}</p>
                  </div>
                )}
                {((typeof selectedOrder.dynamicValue === "string" && /^\d{4}-\d{2}-\d{2}/.test(selectedOrder.dynamicValue)) || selectedOrder.dynamicValue?.fechaUnica || Array.isArray(selectedOrder.dynamicValue)) && (
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Fecha Solicitada</p>
                    <p className="font-medium text-slate-800 dark:text-slate-100">{Array.isArray(selectedOrder.dynamicValue) ? selectedOrder.dynamicValue.map((d: any) => formatDateShort(d)).join(", ") : typeof selectedOrder.dynamicValue === "string" ? formatDateShort(selectedOrder.dynamicValue) : formatDateShort(selectedOrder.dynamicValue.fechaUnica)}</p>
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
                    <img src={`${import.meta.env.VITE_API_URL}${selectedOrder.photoUrl}`} alt={selectedOrder.description} className="max-w-xs w-full h-auto rounded border border-slate-200 dark:border-slate-600 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setViewingImage(`${import.meta.env.VITE_API_URL}${selectedOrder.photoUrl}`)} />
                  </div>
                )}
              </div>
              
              {(() => {
                const isDinero = (selectedOrder.categoryId && typeof selectedOrder.categoryId === "object" && (selectedOrder.categoryId as any).categoryType === "dinero") || selectedOrder.category === "dinero";
                if (!isDinero) return null;

                let installments = selectedOrder.installments;
                if (!installments && typeof selectedOrder.categoryId === "object" && selectedOrder.categoryId) {
                  const category = selectedOrder.categoryId as any;
                  if (selectedOrder.subcategories && selectedOrder.subcategories.length > 0 && category.config?.subtipos) {
                    const subId = selectedOrder.subcategories[0];
                    const subtype = category.config.subtipos.find((st: any) => st.id === subId);
                    if (subtype?.repayment?.installments) {
                      installments = subtype.repayment.installments;
                    }
                  }
                  if (!installments && category.config?.repayment?.installments) {
                    installments = category.config.repayment.installments;
                  }
                }

                const numInstallments = installments || 1;
                const baseDateStr = selectedOrder.approvedAt || selectedOrder.preApprovedAt || selectedOrder.deliveredAt || selectedOrder.requestedAt;
                if (!baseDateStr) return null;

                const baseDate = new Date(baseDateStr);
                if (isNaN(baseDate.getTime())) return null;

                const dates: Date[] = [];
                const startYear = baseDate.getFullYear();
                const startMonth = baseDate.getMonth();
                for (let i = 0; i < numInstallments; i++) {
                  dates.push(new Date(startYear, startMonth + i + 1, 0));
                }

                const toISODateString = (date: Date): string => {
                  const y = date.getFullYear();
                  const m = String(date.getMonth() + 1).padStart(2, "0");
                  const d = String(date.getDate()).padStart(2, "0");
                  return `${y}-${m}-${d}`;
                };

                return (
                  <div className="w-full mt-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded p-4 text-sm text-slate-700 dark:text-slate-300">
                    <p className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Fechas estimadas de descuento de sueldo:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {dates.map((d, index) => (
                        <div key={index} className="bg-white dark:bg-slate-800/80 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 flex justify-between items-center shadow-sm">
                          <span className="text-slate-500 dark:text-slate-400 font-medium text-xs">Cuota {index + 1} de {numInstallments}</span>
                          <span className="text-slate-800 dark:text-slate-200 font-bold text-xs">{formatDateShort(toISODateString(d))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {selectedOrder.description && selectedOrder.description.trim() !== "" && (
              <div className="bg-slate-100 dark:bg-slate-700/50 p-3 py-3 rounded">
                <div className="flex justify-between items-start">
                  <div className="flex justify-between items-center w-full">
                    <p className="font-semibold text-sm text-slate-800 dark:text-slate-500">Comentario</p>
                  </div>
                </div>
                <p className="text-md text-slate-600 dark:text-slate-300 leading-relaxed">{selectedOrder.description}</p>
              </div>
            )}



            {(() => {
              const futureAction = selectedOrder.futureActions && selectedOrder.futureActions.length > 0 ? selectedOrder.futureActions[0] : null;

              if (!futureAction || futureAction.tipoAccionFutura !== "documento" || futureAction.estadoAccion !== "pendiente_documento" || selectedOrder.status === "pending") {
                return null;
              }

              const daysRemaining = futureAction.fechaLimite ? Math.ceil((new Date(futureAction.fechaLimite).getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;

              return (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-500/50 p-4 rounded">
                  <div className="flex items-start gap-3">
                    <FontAwesomeIcon icon={faFileArrowUp} className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-yellow-800 dark:text-yellow-400 mb-1">Documento Pendiente</h4>
                      {futureAction.documentoRequerido && (
                        <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-3">
                          <strong>"{futureAction.documentoRequerido}"</strong>
                        </p>
                      )}
                      <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">Este pedido requiere que el usuario presente un documento para completar la solicitud.</p>
                      {daysRemaining !== null && <p className={`text-sm font-medium ${daysRemaining <= 2 ? "text-red-600 dark:text-red-400" : "text-yellow-600 dark:text-yellow-400"}`}>{daysRemaining > 0 ? `El usuario tiene ${daysRemaining} día${daysRemaining !== 1 ? "s" : ""} para presentar el documento` : daysRemaining === 0 ? "El plazo vence hoy" : `El plazo venció hace ${Math.abs(daysRemaining)} día${Math.abs(daysRemaining) !== 1 ? "s" : ""}`}</p>}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Document Uploaded Section */}
            {(() => {
              const futureAction = selectedOrder.futureActions && selectedOrder.futureActions.length > 0 ? selectedOrder.futureActions[0] : null;
              const documentUrl = selectedOrder.documentoUrl || futureAction?.documentoUrl || (selectedOrder.documents && selectedOrder.documents.length > 0 ? selectedOrder.documents[0].fileUrl : undefined);

              if (!futureAction || futureAction.tipoAccionFutura !== "documento" || futureAction.estadoAccion !== "documento_presentado" || !documentUrl) {
                return null;
              }

              return (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-500/50 p-4 rounded">
                  <div className="flex items-start gap-3">
                    <FontAwesomeIcon icon={faCheckCircle} className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-blue-800 dark:text-blue-400 mb-1">Documento Subido</h4>
                      {futureAction.documentoRequerido && (
                        <p className="text-sm text-blue-600 dark:text-blue-400 mb-2">
                          <strong>"{futureAction.documentoRequerido}"</strong>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setViewingImage(`${import.meta.env.VITE_API_URL}${documentUrl}`)} className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium text-sm">
                      <FontAwesomeIcon icon={faFileArrowUp} />
                      Ver Documento
                    </button>
                    <a href={`${import.meta.env.VITE_API_URL}${documentUrl}`} download target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium text-sm">
                      <FontAwesomeIcon icon={faDownload} />
                    </a>
                  </div>
                </div>
              );
            })()}

            {/* Signature Notification Section */}
            {(() => {
              if (!selectedOrder) return null;
              const orderRequiresSignature = selectedOrder.requiresSignature || (selectedOrder.signatureStatus && selectedOrder.signatureStatus !== "not_required");
              if (selectedOrder.status !== "approved" || !orderRequiresSignature || selectedOrder.signatureStatus !== "sent" || selectedOrder.signatureNotifiedAt) {
                return null;
              }
              return (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded">
                  <div className="flex items-start gap-3">
                    <FontAwesomeIcon icon={faFileSignature} className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-blue-800 dark:text-blue-400 mb-1">Documento Enviado para Firma</h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">Se le ha enviado un email con el documento para firmar.</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 opacity-90">Una vez que haya completado la firma, podrá avisar que firmó. Si no llega el aviso igualmente revisar en la plataforma de Firmas si esta fue realizada.</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Signature Notification Indicator */}
            {(() => {
              const categoryInfo = typeof selectedOrder.categoryId === "object" ? selectedOrder.categoryId : null;

              // Ocultar si está entregado
              if (selectedOrder.status === "delivered") return null;

              return (
                categoryInfo?.requiresSignature &&
                selectedOrder.signatureStatus === "sent" &&
                selectedOrder.signatureNotifiedAt && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-500/50 p-4 rounded">
                    <div className="flex items-start gap-3">
                      <FontAwesomeIcon icon={faClock} className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="font-semibold text-amber-800 dark:text-amber-400 mb-1">Usuario notificó firma completada</h4>
                        <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">El usuario {getUserName(selectedOrder.userId)} indica que completó la firma del documento. Por favor verificá antes de confirmar.</p>
                        <p className="text-xs text-amber-600 dark:text-amber-400">Notificado el: {new Date(selectedOrder.signatureNotifiedAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    </div>
                  </div>
                )
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
          <div className="flex items-center justify-between p-4 rounded bg-red-50 dark:bg-red-900/20 border-2 border-red-500 dark:border-red-400">
            <div className="flex items-center gap-3">
              <FontAwesomeIcon icon={faFileArrowUp} className="h-5 w-5 text-red-600 dark:text-red-400" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">Documentos Vencidos</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Fecha límite superada</p>
              </div>
            </div>
            <span className="text-2xl font-bold text-red-600 dark:text-red-400">{docStats.overdue}</span>
          </div>

          <div className="flex items-center justify-between p-4 rounded bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center gap-3">
              <FontAwesomeIcon icon={faFileArrowUp} className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">Documentos por Vencer</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">3 días o menos restantes</p>
              </div>
            </div>
            <span className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{docStats.urgent}</span>
          </div>

          <div className="flex items-center justify-between p-4 rounded bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-3">
              <FontAwesomeIcon icon={faFileArrowUp} className="h-5 w-5 text-green-600 dark:text-green-400" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">Documentos Pendientes</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Más de 3 días restantes</p>
              </div>
            </div>
            <span className="text-2xl font-bold text-green-600 dark:text-green-400">{docStats.normal}</span>
          </div>

          <div className="flex items-center justify-between p-4 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
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

      {/* 🔥 MODAL NUEVO: RESUMEN DE ESTADOS (EL QUE ABRE EL BOTÓN DEL HEADER) */}
      <Modal isOpen={showStatsModal} onClose={() => setShowStatsModal(false)} title="Resumen de pedidos" size="md">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            {[
              { label: "Pendientes", value: stats.pending, icon: faClock, color: "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400" },
              { label: "Preaprobados", value: stats.pre_approved, icon: faListCheck, color: "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400" },
              { label: "Aprobados", value: stats.approved, icon: faCheckCircle, color: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" },
              { label: "Rechazados", value: stats.rejected, icon: faTimesCircle, color: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400" },
              { label: "Entregados", value: stats.delivered, icon: faTruck, color: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" },
              { label: "Cancelados", value: stats.cancelled, icon: faBan, color: "bg-orange-50 dark:bg-orange-600/20 text-orange-600 dark:text-orange-400" },
              { label: "Documentos", value: docStats.total, icon: faFileSignature, color: "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400" },
            ].map((stat, index) => (
              <div
                key={index}
                className={`rounded-xl shadow-sm p-4 py-2 flex items-center gap-3 ${stat.color} ${stat.label === "Documentos" ? "cursor-pointer hover:ring-yellow-300 dark:hover:ring-yellow-600 transition-all" : ""} ${stat.label === "Documentos" && docStats.overdue > 0 ? "ring-red-500 dark:ring-red-400" : ""}`}
                onClick={() => {
                  if (stat.label === "Documentos" && docStats.total > 0) {
                    setShowStatsModal(false);
                    setShowDocModal(true);
                  }
                }}
                title={stat.label === "Documentos" && docStats.total > 0 ? "Haz clic para ver el detalle de documentos" : undefined}
              >
                <FontAwesomeIcon icon={stat.icon} className="lg:h-5 w-5 opacity-80" />
                <div className="flex gap-2 items-center">
                  <span className="text-sm font-medium opacity-80">{stat.label}</span>
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
        </div>
      </Modal>
    </PageLayout>
  );
};
