import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan, faCheck } from "@fortawesome/free-solid-svg-icons";
import type { AvailableContract } from "../../../api/vacationConfig";

/**
 * A QUÉ TIPOS DE CONTRATO INVITA LA CAMPAÑA DE GOCE (16/11/2026): un tilde por tipo del catálogo
 * (`/vacation-config/contracts-available`, el mismo de «Visibilidad por tipo de Contrato»). Sin ninguno
 * tildado = todos los habilitados. Los que esa pantalla deja sin vacaciones se ven, pero no se pueden
 * tildar: no se invitan nunca. Lo usan el borrador de la campaña y su configuración por defecto.
 *
 * `personas`: cuánta gente con días hay hoy en cada tipo (la vista previa del borrador); sin eso no se muestra.
 */
export const SelectorTiposContrato: React.FC<{
  tipos: AvailableContract[];
  deshabilitados: number[];
  seleccion: number[];
  onChange: (seleccion: number[]) => void;
  personas?: Record<number, number>;
  disabled?: boolean;
}> = ({ tipos, deshabilitados, seleccion, onChange, personas, disabled }) => {
  const alternar = (id: number) => onChange(seleccion.includes(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id].sort((a, b) => a - b));
  const chip = "px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-2 transition-colors disabled:cursor-not-allowed";
  const todos = seleccion.length === 0;
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={disabled} onClick={() => onChange([])} aria-pressed={todos} className={`${chip} ${todos ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"}`}>
        {todos && <FontAwesomeIcon icon={faCheck} />}
        Todos los habilitados
      </button>
      {tipos.map((t) => {
        const fuera = deshabilitados.includes(t.id);
        const tildado = !fuera && seleccion.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            disabled={disabled || fuera}
            onClick={() => alternar(t.id)}
            aria-pressed={tildado}
            title={fuera ? "Este tipo de contrato no tiene vacaciones (Configuración › Vacaciones › Visibilidad por tipo de Contrato): no se invita." : undefined}
            className={`${chip} ${fuera ? "border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 line-through opacity-70" : tildado ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"}`}
          >
            {fuera ? <FontAwesomeIcon icon={faBan} /> : tildado ? <FontAwesomeIcon icon={faCheck} /> : null}
            {t.name || `Tipo ${t.id}`}
            {personas && !fuera && <span className="font-normal text-gray-400">{personas[t.id] || 0}</span>}
          </button>
        );
      })}
    </div>
  );
};
