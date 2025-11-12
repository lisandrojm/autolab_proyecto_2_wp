import { useState } from "react";
import { ArrowLeft, Package, CheckCircle, Clock, XCircle, Truck, AlertCircle } from "lucide-react";
import { ViewType } from "../types";
import { useOrders } from "../hooks/useOrders";

interface OrdersProps {
  onNavigate: (view: ViewType) => void;
}

export default function Orders({ onNavigate }: OrdersProps) {
  const { orders, loading, error, createOrder, deleteOrder } = useOrders();
  const [showForm, setShowForm] = useState(false);
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      await createOrder({
        title: product,
        description,
        category: "other",
      });
      setShowForm(false);
      setProduct("");
      setQuantity("1");
      setDescription("");
    } catch (err: any) {
      setSubmitError(err.response?.data?.error || "Error al crear pedido");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "delivered":
        return <Truck className="w-5 h-5 text-green-600 dark:text-green-400" />;
      case "approved":
        return <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
      case "pending":
        return <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />;
      case "rejected":
        return <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "delivered":
        return "Entregado";
      case "approved":
        return "Aprobado";
      case "pending":
        return "Pendiente";
      case "rejected":
        return "Rechazado";
      default:
        return status;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "delivered":
        return "bg-green-100 dark:bg-green-900/50";
      case "approved":
        return "bg-blue-100 dark:bg-blue-900/50";
      case "pending":
        return "bg-yellow-100 dark:bg-yellow-900/50";
      case "rejected":
        return "bg-red-100 dark:bg-red-900/50";
      default:
        return "bg-slate-100 dark:bg-slate-800";
    }
  };

  return (
    <div className="flex-1 pb-24">
      <div className="sticky top-0 z-10 bg-background-light dark:bg-background-dark p-4 pb-2">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate("home")} className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800">
            <ArrowLeft className="w-6 h-6 text-slate-900 dark:text-slate-100" />
          </button>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Mis Pedidos</h1>
        </div>
      </div>

      <div className="px-4 pt-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 mb-4 dark:border-red-800 dark:bg-red-900/20">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <button onClick={() => setShowForm(!showForm)} disabled={loading} className="w-full flex items-center justify-center gap-2 rounded-lg h-12 px-4 bg-blue-500 text-white text-sm font-medium leading-normal shadow-sm hover:bg-primary/90 focus:ring-2 focus:ring-primary/50 focus:outline-none mb-6 disabled:opacity-50 disabled:cursor-not-allowed">
          <Package className="w-5 h-5" />
          {showForm ? "Cancelar" : "Nuevo Pedido"}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm mb-6">
            {submitError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 mb-4 dark:border-red-800 dark:bg-red-900/20">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Producto o artículo</label>
                <input type="text" value={product} onChange={(e) => setProduct(e.target.value)} required className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none" placeholder="Ej: Laptop, Mouse, Material de oficina..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Cantidad</label>
                <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} required min="1" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Descripción</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={3} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none resize-none" placeholder="Especifica detalles del pedido..." />
              </div>
              <button type="submit" disabled={submitting} className="w-full flex items-center justify-center rounded-lg h-10 px-4 bg-primary text-white text-sm font-medium leading-normal shadow-sm hover:bg-primary/90 focus:ring-2 focus:ring-primary/50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? "Enviando..." : "Enviar Pedido"}
              </button>
            </div>
          </form>
        )}

        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Historial de Pedidos</h3>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm animate-pulse">
                <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            ))}
          </div>
        ) : orders.length > 0 ? (
          <div className="space-y-3">
            {orders.map((order) => (
              <div key={order._id} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{order.title}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{order.description}</p>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${getStatusBg(order.status)}`}>
                    {getStatusIcon(order.status)}
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{getStatusText(order.status)}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Solicitado el{" "}
                  {new Date(order.requestedAt).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-8 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="text-sm text-slate-500 dark:text-slate-400">No tienes pedidos registrados</p>
          </div>
        )}
      </div>
    </div>
  );
}
