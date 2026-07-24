import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";

interface CompanyOption {
  _id: string;
  razonSocial: string;
}

interface CompanyMultiSelectProps {
  companies: CompanyOption[];
  /** IDs seleccionados */
  value: string[];
  onChange: (ids: string[]) => void;
  emptyLabel?: string;
}

/**
 * Multi-select con checkboxes SIEMPRE visibles (no dropdown) para elegir varias empresas
 * (Empresa del Contrato / del Release). El proyecto puede quedar vinculado a más de una empresa
 * y luego se elige cuál usar al descargar el documento.
 */
export const CompanyMultiSelect: React.FC<CompanyMultiSelectProps> = ({ companies, value, onChange, emptyLabel = "No hay empresas creadas." }) => {
  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 max-h-52 overflow-auto divide-y divide-gray-100 dark:divide-gray-700/60">
      {companies.length === 0 ? (
        <p className="px-3 py-2.5 text-sm text-gray-500">{emptyLabel}</p>
      ) : (
        companies.map((c) => {
          const checked = value.includes(c._id);
          return (
            <button
              type="button"
              key={c._id}
              onClick={() => toggle(c._id)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
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
  );
};

export default CompanyMultiSelect;
