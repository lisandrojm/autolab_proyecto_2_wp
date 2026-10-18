import type { EstadoItem, EstadoPlan } from "../../../api/planVacaciones";

/** Los colores de cada estado, iguales en la grilla, la línea de tiempo y la lista. */
export const CLASE_ESTADO_ITEM: Record<EstadoItem, string> = {
  propuesto: "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600",
  enviado: "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700",
  aprobado: "bg-green-50 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700",
  rechazado: "bg-red-50 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
  cancelado: "bg-gray-50 text-gray-400 border-gray-200 line-through dark:bg-gray-900 dark:text-gray-500 dark:border-gray-700",
};

export const CLASE_ESTADO_PLAN: Record<EstadoPlan, string> = {
  borrador: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200",
  enviado: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  parcial: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  cerrado: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  cancelado: "bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-500",
};

export const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
/** «Dic 2026» para "2026-12". */
export const mesCorto = (mes: string) => `${MESES_CORTOS[Number(mes.slice(5, 7)) - 1] || mes} ${mes.slice(0, 4)}`;
