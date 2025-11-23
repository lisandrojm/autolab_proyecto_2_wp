import { OrderData } from "../../../../api/personnel";
import {
  faSpinner,
  faCheckCircle,
  faTimesCircle,
  faTruck,
  faBan,
  faClock
} from "@fortawesome/free-solid-svg-icons";

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

export const getUserPosition = (user: any): string => {
  if (!user) return "Sin puesto asignado";
  if (typeof user === "string") return "Sin puesto asignado";
  if (user.positionId && typeof user.positionId === "object" && user.positionId.name) {
    return user.positionId.name;
  }
  return "Sin puesto asignado";
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

export const getSubcategoriesArray = (order: OrderData): string[] => {
  if (!order.categoryId || typeof order.categoryId === "string") return [];

  const category = order.categoryId as any;

  if (!order.subcategories || order.subcategories.length === 0 || !category.config?.subtipos) return [];

  const labels = order.subcategories.map((subId: string) => {
    const selectedSubtype = category.config.subtipos?.find((st: any) => st.id === subId);
    return selectedSubtype ? selectedSubtype.label : null;
  }).filter((label: string | null): label is string => Boolean(label));

  return labels;
};

export const getStatusIcon = (status: string) => {
  const icons: Record<string, any> = {
    pending: faClock,
    approved: faCheckCircle,
    rejected: faTimesCircle,
    delivered: faTruck,
    cancelled: faBan,
  };
  return icons[status] || faClock;
};
