import React from "react";
import { DIAS_DE_LA_SEMANA, normalizarDiasDeInicio } from "@compartido/vacaciones/campania";

/**
 * EN QUÉ DÍAS PUEDE EMPEZAR UN TRAMO (23/11/2026): «Cualquier día» o uno o más días de la semana. Lo usan la
 * configuración de la campaña de goce y «Editar» de una campaña. Los siete marcados es lo mismo que cualquier día.
 */
const ORDEN = [1, 2, 3, 4, 5, 6, 0];
const CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const chip = (activo: boolean) =>
  `px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 ${activo ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20 dark:bg-blue-900/30 dark:text-blue-300" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"}`;

export const SelectorDiasDeInicio: React.FC<{ value: number[]; onChange: (dias: number[]) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => {
  const dias = normalizarDiasDeInicio(value);
  const alternar = (d: number) => onChange(normalizarDiasDeInicio(dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d]));
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={disabled} onClick={() => onChange([])} className={chip(dias.length === 0)}>
        Cualquier día
      </button>
      {ORDEN.map((d) => (
        <button key={d} type="button" disabled={disabled} onClick={() => alternar(d)} className={chip(dias.includes(d))} title={DIAS_DE_LA_SEMANA[d]}>
          {CORTO[d]}
        </button>
      ))}
    </div>
  );
};
