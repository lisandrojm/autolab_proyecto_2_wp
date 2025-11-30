import { faCheck, faClock, faTimes, faUpload, faFile, faExclamationTriangle, faCheckCircle, faTruck, faBan, faTimesCircle, faPenToSquare, faPaperPlane } from "@fortawesome/free-solid-svg-icons";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export type StatusType = "pendiente" | "preaprobado" | "aprobado" | "rechazado" | "entregado" | "cancelado" | "doc_pendiente" | "doc_subido" | "doc_vencido" | "firma_pendiente" | "firma_enviado_a_firmar" | "firma_firmado";

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
    bgClass: "bg-yellow-50 dark:bg-yellow-900/20",
    textClass: "text-yellow-600 dark:text-yellow-400",
  },
  preaprobado: {
    icon: faCheck,
    prefix: null,
    label: "Preaprobado",
    bgClass: "bg-cyan-50 dark:bg-cyan-900/20",
    textClass: "text-cyan-600 dark:text-cyan-400",
  },
  aprobado: {
    icon: faCheckCircle,
    prefix: null,
    label: "Aprobado",
    bgClass: "bg-blue-50 dark:bg-blue-900/20",
    textClass: "text-blue-600 dark:text-blue-400",
  },
  rechazado: {
    icon: faTimesCircle,
    prefix: null,
    label: "Rechazado",
    bgClass: "bg-red-50 dark:bg-red-900/20",
    textClass: "text-red-600 dark:text-red-400",
  },
  entregado: {
    icon: faTruck,
    prefix: null,
    label: "Entregado",
    bgClass: "bg-green-50 dark:bg-green-900/20",
    textClass: "text-green-600 dark:text-green-400",
  },
  cancelado: {
    icon: faBan,
    prefix: null,
    label: "Cancelado",
    bgClass: "bg-gray-50 dark:bg-orange-600/20",
    textClass: "text-orange-600 dark:text-orange-400",
  },
  doc_pendiente: {
    icon: faFile,
    prefix: "Doc.",
    label: "Pendiente",
    bgClass: "bg-yellow-50 dark:bg-yellow-900/20",
    textClass: "text-yellow-600 dark:text-yellow-400",
    borderClass: "",
  },
  doc_subido: {
    icon: faUpload,
    prefix: "Doc.",
    label: "Subido",
    bgClass: "bg-blue-50 dark:bg-blue-900/20",
    textClass: "text-blue-600 dark:text-blue-400",
  },
  doc_vencido: {
    icon: faExclamationTriangle,
    prefix: "Doc.",
    label: "Vencido",
    bgClass: "bg-red-50 dark:bg-red-900/20",
    textClass: "text-red-600 dark:text-red-400",
  },
  firma_pendiente: {
    icon: faPenToSquare,
    prefix: "Firma",
    label: "Pendiente",
    bgClass: "bg-yellow-50 dark:bg-yellow-900/20",
    textClass: "text-yellow-600 dark:text-yellow-400",
  },
  firma_enviado_a_firmar: {
    icon: faPaperPlane,
    prefix: "Firma",
    label: "Enviada",
    bgClass: "bg-emerald-50 dark:bg-emerald-900/20",
    textClass: "text-emerald-600 dark:text-emerald-400",
  },
  firma_firmado: {
    icon: faCheck,
    prefix: "Firma",
    label: "Firmado",
    bgClass: "bg-blue-50 dark:bg-blue-900/20",
    textClass: "text-blue-600 dark:text-blue-400",
  },
};
