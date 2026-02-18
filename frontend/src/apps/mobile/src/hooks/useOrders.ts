import { useState, useEffect } from "react";
import { personnelAPI, OrderData } from "../../../../api/personnel";

export const useOrders = () => {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await personnelAPI.getOrders();
      setOrders(data);
    } catch (err: any) {
      setError(err.response?.data?.error || "Error al cargar pedidos");
      console.error("Error fetching orders:", err);
    } finally {
      setLoading(false);
    }
  };

  const createOrder = async (orderData: { description: string; category?: string; categoryId?: string; subcategories?: string[]; dynamicValue?: any; actionCompleted?: boolean; amount?: number; photo?: File | null; document?: File | null; futureActionPlazoDias?: number; futureActionFechaLimite?: string; futureActionDocumento?: string; daysRequested?: number }) => {
    try {
      setError(null);
      const newOrder = await personnelAPI.createOrder(orderData);
      setOrders([newOrder, ...orders]);
      return newOrder;
    } catch (err: any) {
      setError(err.response?.data?.error || "Error al crear pedido");
      throw err;
    }
  };

  const deleteOrder = async (id: string) => {
    try {
      setError(null);
      await personnelAPI.deleteOrder(id);
      setOrders(orders.filter((order) => order._id !== id));
    } catch (err: any) {
      setError(err.response?.data?.error || "Error al eliminar pedido");
      throw err;
    }
  };

  const updateOrderStatus = async (id: string, status: string) => {
    try {
      setError(null);
      const updatedOrder = await personnelAPI.updateOrder(id, { status: status as any });
      setOrders(orders.map((order) => (order._id === id ? updatedOrder : order)));
      return updatedOrder;
    } catch (err: any) {
      setError(err.response?.data?.error || "Error al actualizar pedido");
      throw err;
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  return {
    orders,
    loading,
    error,
    refetch: fetchOrders,
    createOrder,
    deleteOrder,
    updateOrderStatus,
  };
};
