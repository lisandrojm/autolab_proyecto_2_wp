import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGrip, faTable } from "@fortawesome/free-solid-svg-icons";

export type ViewMode = "cards" | "table";

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

/**
 * Botones de cambio de vista Cards / Tabla, con el mismo estilo que usa
 * la página de Usuarios / Feriados. Solo se debería renderizar en pantallas
 * grandes (en mobile se fuerza la vista de tarjetas).
 */
export const ViewToggle: React.FC<ViewToggleProps> = ({ value, onChange, className = "" }) => {
  const base = "px-4 py-2 rounded-md transition-all border dark:border-gray-700";
  const active = "bg-blue-500 text-white shadow-sm border-blue-500";
  const inactive = "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700";

  return (
    <div className={`flex items-center gap-2 shrink-0 ${className}`}>
      <button onClick={() => onChange("cards")} className={`${base} ${value === "cards" ? active : inactive}`} title="Vista de tarjetas" type="button">
        <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
      </button>
      <button onClick={() => onChange("table")} className={`${base} ${value === "table" ? active : inactive}`} title="Vista de tabla" type="button">
        <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
      </button>
    </div>
  );
};
