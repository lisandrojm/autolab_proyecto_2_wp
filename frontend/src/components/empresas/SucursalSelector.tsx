import React, { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faXmark, faToggleOff, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { ArcaSucursal } from "../../api/arcaSucursales";

interface Props {
  sucursales: ArcaSucursal[];
  cargando?: boolean;
  /** Ids de las sucursales asignadas a la empresa. */
  value: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Asignación de Sucursales del padrón de ARCA a una empresa.
 *
 * Acá SOLO se eligen: el código, el domicilio y las actividades se cargan en el ABM de Sucursales
 * (Configuración → ARCA → Sucursales). Son pocas por empresa, así que se listan todas con un switch
 * en vez de un buscador.
 */
export const SucursalSelector: React.FC<Props> = ({ sucursales, cargando, value, onChange }) => {
  const seleccionadas = useMemo(() => sucursales.filter((s) => value.includes(s._id)), [sucursales, value]);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  if (cargando) {
    return (
      <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-2">
        <FontAwesomeIcon icon={faSpinner} spin className="h-3.5 w-3.5" /> Cargando sucursales...
      </p>
    );
  }

  if (sucursales.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500 italic">Todavía no hay sucursales cargadas. Cargalas en Configuración → ARCA → Sucursales y después asignalas acá.</p>;
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Asignadas ({seleccionadas.length})</p>
        {seleccionadas.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">Sin sucursales asignadas. Sus contratos no van a poder entrar en el TXT de alta masiva.</p>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {seleccionadas.map((s) => (
              <span key={s._id} title={`${s.domicilio}${s.actividades.length ? ` — actividades: ${s.actividades.map((a) => a.codigo).join(", ")}` : " — sin actividades"}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-medium rounded border border-primary-200 dark:border-primary-800 max-w-full">
                <span className="font-mono opacity-70 shrink-0">{s.codigo}</span>
                <span className="truncate">{s.domicilio}</span>
                <button type="button" onClick={() => toggle(s._id)} title={`Quitar ${s.codigo}`} className="hover:bg-primary-200 dark:hover:bg-primary-800/50 rounded p-0.5 transition-colors shrink-0">
                  <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
        {sucursales
          .filter((s) => !value.includes(s._id))
          .map((s) => (
            <button key={s._id} type="button" onClick={() => toggle(s._id)} className="w-full text-left px-3 py-2 rounded-lg border flex items-start gap-3 transition-colors bg-white border-gray-200 hover:bg-gray-50 dark:bg-gray-900/40 dark:border-gray-700 dark:hover:bg-gray-800">
              <FontAwesomeIcon icon={faToggleOff} className="h-4 w-4 mt-0.5 shrink-0 text-gray-400" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 break-words">
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-2">{s.codigo}</span>
                  {s.domicilio}
                </span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  {s.actividades.length === 0 ? (
                    <span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
                      <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" /> sin actividades
                    </span>
                  ) : (
                    `${s.actividades.length} actividad(es): ${s.actividades.map((a) => a.codigo).join(", ")}`
                  )}
                </span>
              </span>
            </button>
          ))}
      </div>
    </div>
  );
};
