import { X, ShoppingCart, Info, Tag, List, CheckSquare, Calendar, User, Image as ImageIcon, Clock, CheckCircle, XCircle, Truck, Ban } from "lucide-react";
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
          activeClass: "bg-yellow-500 border-yellow-400 text-white",
          inactiveClass: "bg-blue-900/30 border-blue-800/50 text-blue-300",
        };
      case "approved":
        return {
          label: "Aprobado",
          icon: CheckCircle,
          activeClass: "bg-blue-500 border-blue-400 text-white",
          inactiveClass: "bg-blue-900/30 border-blue-800/50 text-blue-300",
        };
      case "rejected":
        return {
          label: "Rechazado",
          icon: XCircle,
          activeClass: "bg-red-500 border-red-400 text-white",
          inactiveClass: "bg-blue-900/30 border-blue-800/50 text-blue-300",
        };
      case "delivered":
        return {
          label: "Entregado",
          icon: Truck,
          activeClass: "bg-green-500 border-green-400 text-white",
          inactiveClass: "bg-blue-900/30 border-blue-800/50 text-blue-300",
        };
      case "cancelled":
        return {
          label: "Cancelado",
          icon: Ban,
          activeClass: "bg-slate-500 border-slate-400 text-white",
          inactiveClass: "bg-blue-900/30 border-blue-800/50 text-blue-300",
        };
      default:
        return {
          label: status,
          icon: Clock,
          activeClass: "bg-slate-500 border-slate-400 text-white",
          inactiveClass: "bg-blue-900/30 border-blue-800/50 text-blue-300",
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
        className={`fixed inset-0 bg-black/60 z-50 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={modalRef}
        className={`fixed inset-4 md:inset-8 lg:inset-16 z-50 bg-slate-800 dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-300 ${
          isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Detalles del Pedido"
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-6 border-b border-slate-700">
            <h2 className="text-2xl font-bold text-white">Detalles del Pedido</h2>
            <button
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              aria-label="Cerrar modal"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-bold text-white mb-4">Información del Pedido</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/20">
                      <ShoppingCart className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-400 mb-1">Estado</p>
                      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium ${currentStatusConfig.activeClass}`}>
                        <currentStatusConfig.icon className="w-4 h-4" />
                        <span>{currentStatusConfig.label}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/20">
                      <ShoppingCart className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-400 mb-1">Título</p>
                      <p className="text-base font-semibold text-white break-words">{order.title}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-500/20">
                      <Info className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-400 mb-1">Descripción</p>
                      <p className="text-base text-white break-words">{order.description}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/20">
                      <Tag className="w-5 h-5 text-teal-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-400 mb-1">Categoría</p>
                      <p className="text-base font-semibold text-white">{order.category || "Sin categoría"}</p>
                    </div>
                  </div>

                  {order.subcategoryLabel && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20">
                        <List className="w-5 h-5 text-indigo-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-400 mb-1">Tipo de Dato</p>
                        <p className="text-base text-white">{order.subcategoryLabel}</p>
                      </div>
                    </div>
                  )}

                  {order.dynamicValue && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-500/20">
                        <CheckSquare className="w-5 h-5 text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-400 mb-1">Opción Seleccionada</p>
                        <p className="text-base text-white">
                          {typeof order.dynamicValue === "object" && order.dynamicValue !== null
                            ? order.dynamicValue.fechaDesde
                              ? "Rango de fechas"
                              : JSON.stringify(order.dynamicValue)
                            : order.dynamicValue}
                        </p>
                      </div>
                    </div>
                  )}

                  {order.dynamicValue?.fechaDesde && order.dynamicValue?.fechaHasta && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/20">
                        <Calendar className="w-5 h-5 text-cyan-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-400 mb-1">Rango de Fechas</p>
                        <p className="text-base text-white">{formatDateRange(order.dynamicValue)}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/20">
                      <User className="w-5 h-5 text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-400 mb-1">Solicitante</p>
                      <p className="text-base font-semibold text-white">{getUserName()}</p>
                    </div>
                  </div>

                  {order.photoUrl && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pink-500/20">
                        <ImageIcon className="w-5 h-5 text-pink-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-400 mb-1">Imagen</p>
                        <img
                          src={`${import.meta.env.VITE_API_URL}${order.photoUrl}`}
                          alt="Order"
                          className="w-full max-w-xs h-auto rounded-lg border border-slate-700 mt-2"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-white mb-4">Control de Estado</h3>
                <div className="space-y-3">
                  {statuses.map((status) => {
                    const config = getStatusConfig(status);
                    const isActive = order.status === status;
                    const Icon = config.icon;

                    return (
                      <button
                        key={status}
                        disabled
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all cursor-default ${
                          isActive ? config.activeClass : config.inactiveClass
                        }`}
                      >
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isActive ? "bg-white/20" : "bg-transparent"}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="text-base font-semibold">{config.label}</span>
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
