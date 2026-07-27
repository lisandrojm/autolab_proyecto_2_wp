import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";

interface EstadoOption {
  value: string;
  name: string;
}

interface EstadoSelectProps {
  options: EstadoOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const normalize = (s: string): string =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/**
 * Estilo (color de badge) y etiqueta por estado. La clave está normalizada (sin acentos/mayúsculas).
 * "Falta pedido de AFIP" se muestra como "Pedido de AFIP".
 */
const ESTADO_STYLES: Record<string, { label?: string; cls: string }> = {
  disponible: { cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  "envio de documentacion": { cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  "falta pedido de afip": { label: "Pedido de AFIP", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  "pedido de afip": { cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  "firma pendiente": { cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  "pedido servicios": { cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
};

const styleFor = (name: string) => ESTADO_STYLES[normalize(name)] || { cls: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" };
const labelFor = (name: string) => styleFor(name).label || name;

const Badge: React.FC<{ name: string }> = ({ name }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${styleFor(name).cls}`}>{labelFor(name)}</span>
);

/** Select de Estado que muestra cada opción como un badge de color (el <select> nativo no permite colorear opciones). */
export const EstadoSelect: React.FC<EstadoSelectProps> = ({ options, value, onChange, placeholder = "Selecciona estado..." }) => {
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

  const selected = useMemo(() => options.find((o) => String(o.value) === String(value)), [options, value]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="input-field w-full flex items-center justify-between gap-2 text-left">
        {selected ? <Badge name={selected.name} /> : <span className="text-gray-400 dark:text-gray-500">{placeholder}</span>}
        <FontAwesomeIcon icon={faChevronDown} className={`h-3 w-3 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">No hay estados.</p>
          ) : (
            options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${String(o.value) === String(value) ? "bg-gray-50 dark:bg-gray-700/40" : ""}`}
              >
                <Badge name={o.name} />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default EstadoSelect;
