import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faCheck } from "@fortawesome/free-solid-svg-icons";

interface CompanyOption {
  _id: string;
  razonSocial: string;
}

interface CompanyMultiSelectProps {
  companies: CompanyOption[];
  /** IDs seleccionados */
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

/**
 * Multi-select con checkboxes para elegir varias empresas (Empresa del Contrato / del Release).
 * Reemplaza al <select> simple: el proyecto puede quedar vinculado a más de una empresa y luego
 * se elige cuál usar al descargar el documento.
 */
export const CompanyMultiSelect: React.FC<CompanyMultiSelectProps> = ({ companies, value, onChange, placeholder = "Seleccionar empresas..." }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selectedLabels = useMemo(
    () => companies.filter((c) => value.includes(c._id)).map((c) => c.razonSocial),
    [companies, value],
  );

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input-field py-2.5 w-full flex items-center justify-between gap-2 text-left"
      >
        <span className={`truncate ${selectedLabels.length ? "" : "text-gray-400 dark:text-gray-500"}`}>
          {selectedLabels.length ? selectedLabels.join(", ") : placeholder}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {selectedLabels.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-xs font-semibold">
              {selectedLabels.length}
            </span>
          )}
          <FontAwesomeIcon icon={faChevronDown} className={`h-3 w-3 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
          {companies.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">No hay empresas.</p>
          ) : (
            companies.map((c) => {
              const checked = value.includes(c._id);
              return (
                <button
                  type="button"
                  key={c._id}
                  onClick={() => toggle(c._id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <span className={`flex items-center justify-center h-4 w-4 rounded border shrink-0 ${checked ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 dark:border-gray-600"}`}>
                    {checked && <FontAwesomeIcon icon={faCheck} className="h-2.5 w-2.5" />}
                  </span>
                  <span className="truncate">{c.razonSocial}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default CompanyMultiSelect;
