import { Order } from "../../../../api/management";

export const getUserName = (user: any): string => {
  if (!user) return "Usuario desconocido";
  if (typeof user === "string") return "Usuario desconocido";
  const firstName = user.firstName || "";
  const lastName = user.lastName || "";
  if (firstName || lastName) return `${firstName} ${lastName}`.trim();
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

  if (dateString.includes("T")) {
    return new Date(dateString).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  // Parse YYYY-MM-DD manually to create Local Date without timezone shift
  const datePart = dateString.toString().split("T")[0];
  const [year, month, day] = datePart.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const getCategoryName = (order: Order): string => {
  if (!order.categoryId) return order.category || "Sin categoría";
  if (typeof order.categoryId === "string") return order.category || "Sin categoría";
  const category = order.categoryId as any;
  return category.name || order.category || "Sin categoría";
};

export const getOrderNumber = (orderNumber: string | undefined | null): string => {
  if (!orderNumber) return "";
  return orderNumber;
};

export const getSubcategoriesArray = (order: Order): string[] => {
  if (!order.categoryId || typeof order.categoryId === "string") return [];

  const category = order.categoryId as any;

  if (!order.subcategories || order.subcategories.length === 0 || !category.config?.subtipos) return [];

  const labels = order.subcategories
    .map((subId: string) => {
      const selectedSubtype = category.config.subtipos?.find((st: any) => st.id === subId);
      return selectedSubtype ? selectedSubtype.label : null;
    })
    .filter((label: string | null): label is string => Boolean(label));

  return labels;
};
