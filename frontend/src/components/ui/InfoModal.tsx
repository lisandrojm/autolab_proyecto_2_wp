import React from "react";
import { Modal } from "./Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";

export type InfoActionVariant = "primary" | "secondary" | "blue" | "ghost";

export interface InfoModalAction {
  label: string;
  onClick: () => void;
  variant?: InfoActionVariant;
  disabled?: boolean;
  loading?: boolean;
  id?: string;
}

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  actions?: InfoModalAction[];
  children: React.ReactNode;
  zIndex?: number;
}

const baseBtn = "inline-flex items-center justify-center rounded px-4 py-2 text-sm font-medium transition";
const variants: Record<InfoActionVariant, string> = {
  primary: "btn-primary", // usás tu clase utilitaria existente
  secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600",
  blue: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 dark:bg-red-500 dark:hover:bg-red-600",
  ghost: "px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700",
};

export const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, title, subtitle, size = "md", actions, children, zIndex }) => {
  const footer =
    actions && actions.length > 0 ? (
      <div className="flex items-center justify-end space-x-3">
        {actions.slice(0, 2).map((a, idx) => (
          <button key={a.id ?? `${a.label}-${idx}`} type="button" onClick={a.onClick} disabled={a.disabled || a.loading} className={`${baseBtn} ${variants[a.variant ?? "secondary"]}`}>
            {a.loading && <FontAwesomeIcon icon={faSpinner} spin className="mr-2 h-4 w-4" />}
            {a.label}
          </button>
        ))}
      </div>
    ) : undefined;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle} size={size} footer={footer} zIndex={zIndex}>
      {children}
    </Modal>
  );
};
