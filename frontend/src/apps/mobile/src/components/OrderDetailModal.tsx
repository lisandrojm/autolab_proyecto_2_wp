import { X, ShoppingCart, Info, Tag, List, CheckSquare, Calendar, User, Image as ImageIcon, Clock, CheckCircle, XCircle, Truck, Ban, Hash } from "lucide-react";
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
          activeClass: "bg-yellow-500 border-yellow-600 text-white shadow-lg shadow-yellow-500/20",
          inactiveClass: "bg-slate-700/50 border-slate-600 text-slate-400",
        };
      case "approved":
        return {
          label: "Aprobado",
          icon: CheckCircle,
          activeClass: "bg-blue-600 border-blue-700 text-white shadow-lg shadow-blue-600/20",
          inactiveClass: "bg-slate-700/50 border-slate-600 text-slate-400",
        };
      case "rejected":
        return {
          label: "Rechazado",
          icon: XCircle,
          activeClass: "bg-slate-600 border-slate-700 text-white shadow-lg shadow-slate-600/20",
          inactiveClass: "bg-slate-700/50 border-slate-600 text-slate-400",
        };
      case "delivered":
        return {
          label: "Entregado",
          icon: Truck,
          activeClass: "bg-slate-600 border-slate-700 text-white shadow-lg shadow-slate-600/20",
          inactiveClass: "bg-slate-700/50 border-slate-600 text-slate-400",
        };
      case "cancelled":
        return {
          label: "Cancelado",
          icon: Ban,
          activeClass: "bg-slate-600 border-slate-700 text-white shadow-lg shadow-slate-600/20",
          inactiveClass: "bg-slate-700/50 border-slate-600 text-slate-400",
        };
      default:
        return {
          label: status,
          icon: Clock,
          activeClass: "bg-slate-600 border-slate-700 text-white shadow-lg shadow-slate-600/20",
          inactiveClass: "bg-slate-700/50 border-slate-600 text-slate-400",
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
      <div className={`fixed inset-0 bg-black/70 z-50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`} onClick={onClose} aria-hidden="true" />

      <div ref={modalRef} className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[95vw] max-w-xl max-h-[90vh] bg-slate-800 rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-300 ${isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"}`} role="dialog" aria-modal="true" aria-label="Detalles del Pedido">
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-8 py-6 border-b border-slate-600/50">
            <h2 className="text-2xl font-bold text-white">Detalles del Pedido</h2>
            <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/50 transition-colors" aria-label="Cerrar modal">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 gap-0">
              <div className="px-8 py-6 border-r border-slate-600/50">
                <h3 className="text-xl font-bold text-white mb-6">Información del Pedido</h3>
                <div className="space-y-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30">
                      <Hash className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-400 mb-1.5">Número de Pedido</p>
                      <p className="text-lg font-mono font-bold text-emerald-400 tracking-wide">{order.orderNumber}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 border border-blue-500/30">
                      <ShoppingCart className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-400 mb-1.5">Estado</p>
                      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md font-semibold text-sm ${currentStatusConfig.activeClass}`}>
                        <currentStatusConfig.icon className="w-4 h-4" />
                        <span>{currentStatusConfig.label}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 border border-cyan-500/30">
                      <ShoppingCart className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-400 mb-1.5">Título</p>
                      <p className="text-base font-semibold text-white break-words leading-snug">{order.title}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 border border-purple-500/30">
                      <Info className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-400 mb-1.5">Descripción</p>
                      <p className="text-base text-slate-200 break-words leading-relaxed">{order.description}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 border border-teal-500/30">
                      <Tag className="w-5 h-5 text-teal-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-400 mb-1.5">Categoría</p>
                      <p className="text-base font-semibold text-white">{order.category || "Sin categoría"}</p>
                    </div>
                  </div>

                  {order.subcategoryLabel && (
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 border border-indigo-500/30">
                        <List className="w-5 h-5 text-indigo-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-400 mb-1.5">Tipo de Dato</p>
                        <p className="text-base text-white font-medium">{order.subcategoryLabel}</p>
                      </div>
                    </div>
                  )}

                  {order.dynamicValue && !order.dynamicValue?.fechaDesde && (
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-500/15 border border-green-500/30">
                        <CheckSquare className="w-5 h-5 text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-400 mb-1.5">Opción Seleccionada</p>
                        <p className="text-base text-white font-medium">{typeof order.dynamicValue === "object" && order.dynamicValue !== null ? JSON.stringify(order.dynamicValue) : order.dynamicValue}</p>
                      </div>
                    </div>
                  )}

                  {order.dynamicValue?.fechaDesde && order.dynamicValue?.fechaHasta && (
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 border border-cyan-500/30">
                        <Calendar className="w-5 h-5 text-cyan-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-400 mb-1.5">Rango de Fechas</p>
                        <p className="text-base text-white font-medium">{formatDateRange(order.dynamicValue)}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 border border-orange-500/30">
                      <User className="w-5 h-5 text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-400 mb-1.5">Solicitante</p>
                      <p className="text-base font-semibold text-white">{getUserName()}</p>
                    </div>
                  </div>

                  {order.photoUrl && (
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-500/15 border border-pink-500/30">
                        <ImageIcon className="w-5 h-5 text-pink-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-400 mb-1.5">Imagen</p>
                        <img src={`${import.meta.env.VITE_API_URL}${order.photoUrl}`} alt="Order" className="w-full max-w-sm h-auto rounded-lg border-2 border-slate-600/50 mt-2 shadow-lg" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/*               <div className="px-8 py-6 bg-[#263644]">
                <h3 className="text-xl font-bold text-white mb-6">Control de Estado</h3>
                <div className="space-y-3">
                  {statuses.map((status) => {
                    const config = getStatusConfig(status);
                    const isActive = order.status === status;
                    const Icon = config.icon;

                    return (
                      <button
                        key={status}
                        disabled
                        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 transition-all cursor-default ${
                          isActive ? config.activeClass : config.inactiveClass
                        }`}
                      >
                        <div className={`flex h-9 w-9 items-center justify-center rounded-full ${isActive ? "bg-white/25" : "bg-slate-600/30"}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="text-base font-bold">{config.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div> */}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
