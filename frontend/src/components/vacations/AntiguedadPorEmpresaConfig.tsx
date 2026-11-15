import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp, faCircleInfo, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { companiesAPI, type Company } from "../../api/companies";
import type { ComputoAntiguedad } from "../../api/vacationConfig";

export const COMPUTO_POR_DEFECTO: ComputoAntiguedad = { modo: "empresaVigente", precedencia: [], sumarEntreEmpresas: false };

/**
 * «ANTIGÜEDAD POR EMPRESA» EN LA CONFIGURACIÓN DE VACACIONES (15/11/2026, pedido del usuario).
 *
 * Quien trabajó para varias empleadoras ya no suma la antigüedad de todas: los días por ley salen de
 * UNA (la «empresa de cómputo»). Acá se elige cómo: la vigente (la de la relación abierta o la más
 * reciente) o una precedencia fija de empresas. El interruptor de sumar vuelve al cálculo viejo.
 */
export const AntiguedadPorEmpresaConfig: React.FC<{ valor?: ComputoAntiguedad; onChange: (v: ComputoAntiguedad) => void }> = ({ valor, onChange }) => {
  const v = { ...COMPUTO_POR_DEFECTO, ...(valor || {}) };
  const [empresas, setEmpresas] = useState<Company[]>([]);
  const [agregar, setAgregar] = useState("");
  useEffect(() => {
    companiesAPI
      .list({ slim: true })
      .then(setEmpresas)
      .catch(() => setEmpresas([]));
  }, []);

  const nombre = (id: string) => {
    const e = empresas.find((x) => x._id === id);
    return e ? `${e.razonSocial}${e.cuit ? ` · ${e.cuit}` : ""}` : "Empresa que ya no existe";
  };
  const disponibles = useMemo(() => empresas.filter((e) => !v.precedencia.includes(e._id)), [empresas, v.precedencia]);
  const mover = (i: number, d: -1 | 1) => {
    const p = [...v.precedencia];
    [p[i], p[i + d]] = [p[i + d], p[i]];
    onChange({ ...v, precedencia: p });
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Antigüedad por empresa</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Define de qué empleadora se toma la antigüedad cuando la persona trabajó en varias. Ya no se suman.</p>

      <div className="space-y-2 max-w-2xl">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="radio" name="modoComputo" checked={v.modo === "empresaVigente"} onChange={() => onChange({ ...v, modo: "empresaVigente" })} disabled={v.sumarEntreEmpresas} className="mt-1 h-4 w-4 text-blue-600" />
          <span>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">Empresa vigente</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">La de la relación abierta; si no hay ninguna, la más reciente. Quien pasó de una empresa a otra arranca de cero en la nueva.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="radio" name="modoComputo" checked={v.modo === "precedenciaManual"} onChange={() => onChange({ ...v, modo: "precedenciaManual" })} disabled={v.sumarEntreEmpresas} className="mt-1 h-4 w-4 text-blue-600" />
          <span>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">Precedencia manual</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">Un orden fijo de empresas: cuenta la primera de la lista en la que trabajó la persona. Si no trabajó en ninguna de la lista, la vigente.</span>
          </span>
        </label>
      </div>

      {v.modo === "precedenciaManual" && !v.sumarEntreEmpresas && (
        <div className="mt-3 ml-7 max-w-2xl space-y-2">
          {v.precedencia.length === 0 ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">Todavía no hay empresas en la lista: mientras tanto se usa la vigente.</p>
          ) : (
            <ol className="rounded border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
              {v.precedencia.map((id, i) => (
                <li key={id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="w-5 text-xs font-bold text-gray-400">{i + 1}</span>
                  <span className="flex-1 text-gray-800 dark:text-gray-200">{nombre(id)}</span>
                  <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} title="Subir" aria-label="Subir" className="p-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-30">
                    <FontAwesomeIcon icon={faArrowUp} className="h-3 w-3" />
                  </button>
                  <button type="button" onClick={() => mover(i, 1)} disabled={i === v.precedencia.length - 1} title="Bajar" aria-label="Bajar" className="p-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-30">
                    <FontAwesomeIcon icon={faArrowDown} className="h-3 w-3" />
                  </button>
                  <button type="button" onClick={() => onChange({ ...v, precedencia: v.precedencia.filter((x) => x !== id) })} title="Quitar" aria-label="Quitar" className="p-1 text-gray-500 hover:text-red-600">
                    <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ol>
          )}
          {disponibles.length > 0 && (
            <div className="flex items-center gap-2">
              <select value={agregar} onChange={(e) => setAgregar(e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-white">
                <option value="">Elegí una empresa…</option>
                {disponibles.map((e) => (
                  <option key={e._id} value={e._id}>
                    {e.razonSocial}
                    {e.cuit ? ` · ${e.cuit}` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!agregar}
                onClick={() => {
                  onChange({ ...v, precedencia: [...v.precedencia, agregar] });
                  setAgregar("");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                Agregar
              </button>
            </div>
          )}
        </div>
      )}

      <label className="mt-4 flex items-start gap-3 cursor-pointer max-w-2xl">
        <input type="checkbox" checked={v.sumarEntreEmpresas} onChange={(e) => onChange({ ...v, sumarEntreEmpresas: e.target.checked })} className="mt-1 h-4 w-4 text-blue-600 rounded" />
        <span>
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">Sumar la antigüedad de todas las empresas (cálculo anterior)</span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">Vuelve a sumar los días de todas las empleadoras, como antes. Dejalo apagado salvo que haga falta reproducir un número viejo.</span>
        </span>
      </label>
      <p className="mt-3 flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 max-w-2xl">
        <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        Los períodos ya cerrados conservan el número con que se calcularon (sumado). Los días extra, el beneficio y el arrastre son de la persona y no cambian.
      </p>
    </div>
  );
};
