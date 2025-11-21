import { X, ShoppingCart, Info, Tag, List, CheckSquare, Calendar, User, Image as ImageIcon, Clock, CheckCircle, XCircle, Truck, Ban, DollarSign } from "lucide-react";
import { useEffect, useRef } from "react";
import { OrderData } from "../../../../api/personnel";

interface OrderDetailModalProps {
  order: OrderData | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function OrderDetailModal({ order, isOpen, onClose }: OrderDetailModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!order || !isOpen) return null;

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "pending":
        return {
          label: "Pendiente",
          icon: Clock,
          bgClass: "bg-amber-50 dark:bg-amber-900/20",
          borderClass: "border-amber-200 dark:border-amber-800",
          textClass: "text-amber-800 dark:text-amber-300",
          iconClass: "text-amber-600 dark:text-amber-400",
          dotClass: "bg-amber-500",
        };
      case "approved":
        return {
          label: "Aprobado",
          icon: CheckCircle,
          bgClass: "bg-blue-50 dark:bg-blue-900/20",
          borderClass: "border-blue-200 dark:border-blue-800",
          textClass: "text-blue-800 dark:text-blue-300",
          iconClass: "text-blue-600 dark:text-blue-400",
          dotClass: "bg-blue-500",
        };
      case "rejected":
        return {
          label: "Rechazado",
          icon: XCircle,
          bgClass: "bg-red-50 dark:bg-red-900/20",
          borderClass: "border-red-200 dark:border-red-800",
          textClass: "text-red-800 dark:text-red-300",
          iconClass: "text-red-600 dark:text-red-400",
          dotClass: "bg-red-500",
        };
      case "delivered":
        return {
          label: "Entregado",
          icon: Truck,
          bgClass: "bg-green-50 dark:bg-green-900/20",
          borderClass: "border-green-200 dark:border-green-800",
          textClass: "text-green-800 dark:text-green-300",
          iconClass: "text-green-600 dark:text-green-400",
          dotClass: "bg-green-500",
        };
      case "cancelled":
        return {
          label: "Cancelado",
          icon: Ban,
          bgClass: "bg-slate-50 dark:bg-slate-900/20",
          borderClass: "border-slate-200 dark:border-slate-700",
          textClass: "text-slate-800 dark:text-slate-300",
          iconClass: "text-slate-600 dark:text-slate-400",
          dotClass: "bg-slate-500",
        };
      default:
        return {
          label: status,
          icon: Clock,
          bgClass: "bg-slate-50 dark:bg-slate-900/20",
          borderClass: "border-slate-200 dark:border-slate-700",
          textClass: "text-slate-800 dark:text-slate-300",
          iconClass: "text-slate-600 dark:text-slate-400",
          dotClass: "bg-slate-500",
        };
    }
  };

  const statuses = ["pending", "approved", "rejected", "delivered", "cancelled"];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const formatDateRange = (dynamicValue: any) => {
    if (dynamicValue?.fechaDesde && dynamicValue?.fechaHasta) {
      return `${formatDate(dynamicValue.fechaDesde)} - ${formatDate(dynamicValue.fechaHasta)}`;
    }
    return "-";
  };

  const getUserName = () => {
    if (typeof order.userId === "object" && order.userId) {
      return `${order.userId.firstName} ${order.userId.lastName}`;
    }
    return "Usuario";
  };

  const currentStatusConfig = getStatusConfig(order.status);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-50 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={modalRef}
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[95vw] max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-300 ${
          isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Detalles del Pedido"
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Detalles del Pedido</h2>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900">
            <div className="grid grid-cols-1 lg:grid-cols-[1.6fr,1fr] gap-0 h-full">
              <div className="px-6 py-6 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-5">Información del Pedido</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center mt-0.5">
                      <ShoppingCart className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-1.5">Estado</p>
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${currentStatusConfig.bgClass} ${currentStatusConfig.borderClass} ${currentStatusConfig.textClass} border`}>
                        <currentStatusConfig.icon className="w-3.5 h-3.5" />
                        {currentStatusConfig.label}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center mt-0.5">
                      <ShoppingCart className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Título</p>
                      <p className="text-base font-semibold text-slate-900 dark:text-white break-words">{order.title}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center mt-0.5">
                      <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Descripción</p>
                      <p className="text-base text-slate-700 dark:text-slate-300 break-words leading-relaxed">{order.description}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center mt-0.5">
                      <Tag className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Categoría</p>
                      <p className="text-base text-slate-900 dark:text-white font-medium">{order.category || "Sin categoría"}</p>
                    </div>
                  </div>

                  {order.subcategoryLabel && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center mt-0.5">
                        <List className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Tipo de Dato</p>
                        <p className="text-base text-slate-900 dark:text-white">{order.subcategoryLabel}</p>
                      </div>
                    </div>
                  )}

                  {order.dynamicValue && !order.dynamicValue?.fechaDesde && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center mt-0.5">
                        <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Opción Seleccionada</p>
                        <p className="text-base text-slate-900 dark:text-white">
                          {typeof order.dynamicValue === "object" && order.dynamicValue !== null
                            ? JSON.stringify(order.dynamicValue)
                            : order.dynamicValue}
                        </p>
                      </div>
                    </div>
                  )}

                  {order.dynamicValue?.fechaDesde && order.dynamicValue?.fechaHasta && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center mt-0.5">
                        <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Rango de Fechas</p>
                        <p className="text-base text-slate-900 dark:text-white">{formatDateRange(order.dynamicValue)}</p>
                      </div>
                    </div>
                  )}

                  {order.amount && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center mt-0.5">
                        <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Monto</p>
                        <p className="text-lg font-bold text-blue-600 dark:text-blue-400">${order.amount.toFixed(2)}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center mt-0.5">
                      <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Solicitante</p>
                      <p className="text-base font-medium text-slate-900 dark:text-white">{getUserName()}</p>
                    </div>
                  </div>

                  {order.photoUrl && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center mt-0.5">
                        <ImageIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Imagen</p>
                        <div className="inline-block">
                          <img
                            src={`${import.meta.env.VITE_API_URL}${order.photoUrl}`}
                            alt="Order"
                            className="max-w-xs w-full h-auto rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center mt-0.5">
                      <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Fecha de Solicitud</p>
                      <p className="text-base text-slate-900 dark:text-white">
                        {new Date(order.requestedAt).toLocaleString("es-ES", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>

                  {order.approvedAt && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center mt-0.5">
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Fecha de Aprobación</p>
                        <p className="text-base text-slate-900 dark:text-white">
                          {new Date(order.approvedAt).toLocaleString("es-ES", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {order.approvedBy && typeof order.approvedBy === "object" && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            Por: {order.approvedBy.firstName} {order.approvedBy.lastName}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {order.deliveredAt && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center mt-0.5">
                        <Truck className="w-5 h-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Fecha de Entrega</p>
                        <p className="text-base text-slate-900 dark:text-white">
                          {new Date(order.deliveredAt).toLocaleString("es-ES", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-6 py-6 bg-slate-50 dark:bg-slate-800/50">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-5">Control de Estado</h3>
                <div className="space-y-2.5">
                  {statuses.map((status) => {
                    const config = getStatusConfig(status);
                    const isActive = order.status === status;
                    const Icon = config.icon;

                    return (
                      <button
                        key={status}
                        disabled
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all cursor-default ${
                          isActive
                            ? `${config.bgClass} ${config.borderClass} ${config.textClass} shadow-sm`
                            : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${isActive ? config.borderClass : "border-slate-300 dark:border-slate-600"}`}>
                          {isActive && <div className={`w-2.5 h-2.5 rounded-full ${config.dotClass}`} />}
                        </div>
                        <Icon className="w-5 h-5" />
                        <span className="font-semibold text-sm">{config.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
