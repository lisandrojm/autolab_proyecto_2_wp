import { OrderData } from "../../../../api/personnel";

export const getUserName = (user: any): string => {
  if (!user) return "Usuario desconocido";
  if (typeof user === "string") return "Usuario desconocido";
  if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
  return user.email || "Usuario desconocido";
};

export const getUserRole = (user: any): string => {
  if (!user) return "Usuario";
  if (typeof user === "string") return "Usuario";
  if (user.role) return user.role;
  return "Empleado";
};

export const getUserAvatar = (user: any): string | null => {
  if (!user || typeof user === "string") return null;
  return user.avatar || user.photoUrl || null;
};

export const formatDateShort = (dateString: string | undefined): string => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const getStatusBadge = (status: string) => {
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
  return {
    style: styles[status] || styles.pending,
    label: labels[status] || status
  };
};

export const getCategoryName = (order: OrderData): string => {
  if (!order.categoryId) return order.category || "Sin categoría";
  if (typeof order.categoryId === "string") return order.category || "Sin categoría";
  const category = order.categoryId as any;
  return category.name || order.category || "Sin categoría";
};

export const getOrderNumber = (order: OrderData): string => {
  const parts = order.orderNumber.split('-');
  const numericPart = parts.length > 1 ? parts[1] : order.orderNumber;
  return `#${numericPart}`;
};
