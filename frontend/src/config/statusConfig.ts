import {
  faCheck,
  faClock,
  faTimes,
  faUpload,
  faFile,
  faExclamationTriangle,
  faCheckCircle,
  faTruck,
  faBan,
  faTimesCircle,
  faPenToSquare
} from "@fortawesome/free-solid-svg-icons";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export type StatusType =
  | "pendiente"
  | "preaprobado"
  | "aprobado"
  | "rechazado"
  | "entregado"
  | "cancelado"
  | "doc_pendiente"
  | "doc_subido"
  | "doc_vencido"
  | "firma_pendiente"
  | "firma_firmado";

export interface StatusConfig {
  icon: IconDefinition;
  prefix: string | null;
  label: string;
  bgClass: string;
  textClass: string;
  borderClass?: string;
}

export const STATUS_CONFIG: Record<StatusType, StatusConfig> = {
  pendiente: {
    icon: faClock,
    prefix: null,
    label: "Pendiente",
    bgClass: "bg-yellow-600 dark:bg-yellow-500",
    textClass: "text-black dark:text-white",
  },
  preaprobado: {
    icon: faCheck,
    prefix: null,
    label: "Preaprobado",
    bgClass: "bg-cyan-600 dark:bg-cyan-500",
    textClass: "text-white",
  },
  aprobado: {
    icon: faCheckCircle,
    prefix: null,
    label: "Aprobado",
    bgClass: "bg-blue-600 dark:bg-blue-500",
    textClass: "text-white",
  },
  rechazado: {
    icon: faTimesCircle,
    prefix: null,
    label: "Rechazado",
    bgClass: "bg-red-600 dark:bg-red-500",
    textClass: "text-white",
  },
  entregado: {
    icon: faTruck,
    prefix: null,
    label: "Entregado",
    bgClass: "bg-green-600 dark:bg-green-500",
    textClass: "text-white",
  },
  cancelado: {
    icon: faBan,
    prefix: null,
    label: "Cancelado",
    bgClass: "bg-gray-600 dark:bg-gray-500",
    textClass: "text-white",
  },
  doc_pendiente: {
    icon: faFile,
    prefix: "Doc.",
    label: "Pendiente",
    bgClass: "bg-orange-800 dark:bg-orange-700",
    textClass: "text-white",
    borderClass: "",
  },
  doc_subido: {
    icon: faUpload,
    prefix: "Doc.",
    label: "Subido",
    bgClass: "bg-blue-500 dark:bg-blue-600",
    textClass: "text-white",
    borderClass: "border border-blue-400 dark:border-blue-400",
  },
  doc_vencido: {
    icon: faExclamationTriangle,
    prefix: "Doc.",
    label: "Vencido",
    bgClass: "bg-red-500 dark:bg-red-600",
    textClass: "text-white",
    borderClass: "border border-red-500 dark:border-red-400",
  },
  firma_pendiente: {
    icon: faPenToSquare,
    prefix: "Firma",
    label: "Pendiente",
    bgClass: "bg-yellow-700 dark:bg-yellow-600",
    textClass: "text-white",
  },
  firma_firmado: {
    icon: faCheck,
    prefix: "Firma",
    label: "Firmado",
    bgClass: "bg-green-600 dark:bg-green-500",
    textClass: "text-white",
  },
};
