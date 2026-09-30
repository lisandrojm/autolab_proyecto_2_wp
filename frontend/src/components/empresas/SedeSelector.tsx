import React, { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faXmark, faToggleOff, faStar } from "@fortawesome/free-solid-svg-icons";
import { InfoItem } from "../../api/info";
import { ordenarSedes } from "../../utils/sedesProyecto";

interface Props {
  /** El catálogo de sedes, en el orden general (Configuración → Sedes). */
  sedes: InfoItem[];
  cargando?: boolean;
  /** `data.id` de las sedes de la empresa. */
  value: number[];
  onChange: (ids: number[]) => void;
  /** La ★ de la empresa, solo para mostrarla: se elige en la ficha, Sedes. */
  favoritaId?: number | null;
}

/**
 * Asignación de Sedes a una empresa, con la misma forma que las Sucursales de ARCA: las asignadas
 * arriba como chips, el resto abajo con un switch. Son pocas, así que no hace falta buscador.
 *
 * La favorita (★, la que se preselecciona en el proyecto) se marca en la ficha de la empresa →
 * Sedes; acá solo se muestra.
 */
export const SedeSelector: React.FC<Props> = ({ sedes, cargando, value, onChange, favoritaId }) => {
  const conId = useMemo(() => sedes.filter((s) => s.data?.id != null), [sedes]);
  const nombre = (s: InfoItem) => s.name || s.data?.nombre || `Sede ${s.data?.id}`;
  const seleccionadas = useMemo(() => {
    const porId = new Map(conId.map((s) => [Number(s.data.id), s]));
    return ordenarSedes(value, conId).map((id) => porId.get(id)).filter(Boolean) as InfoItem[];
  }, [conId, value]);
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : ordenarSedes([...value, id], conId));

  if (cargando) {
    return (
      <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-2">
        <FontAwesomeIcon icon={faSpinner} spin className="h-3.5 w-3.5" /> Cargando sedes...
      </p>
    );
  }

  if (conId.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500 italic">Todavía no hay sedes cargadas. Cargalas en Configuración → Sedes y después asignalas acá.</p>;
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Asignadas ({seleccionadas.length})</p>
        {seleccionadas.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">Sin sedes asignadas.</p>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {seleccionadas.map((s) => {
              const id = Number(s.data.id);
              const fav = favoritaId != null && Number(favoritaId) === id;
              return (
                <span key={id} title={fav ? "Sede por defecto de esta empresa" : undefined} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-medium rounded border border-primary-200 dark:border-primary-800 max-w-full">
                  {fav && <FontAwesomeIcon icon={faStar} className="h-3 w-3 text-amber-500 shrink-0" />}
                  <span className="truncate">{nombre(s)}</span>
                  <button type="button" onClick={() => toggle(id)} title={`Quitar ${nombre(s)}`} className="hover:bg-primary-200 dark:hover:bg-primary-800/50 rounded p-0.5 transition-colors shrink-0">
                    <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
        {conId
          .filter((s) => !value.includes(Number(s.data.id)))
          .map((s) => (
            <button key={s._id} type="button" onClick={() => toggle(Number(s.data.id))} className="w-full text-left px-3 py-2 rounded-lg border flex items-center gap-3 transition-colors bg-white border-gray-200 hover:bg-gray-50 dark:bg-gray-900/40 dark:border-gray-700 dark:hover:bg-gray-800">
              <FontAwesomeIcon icon={faToggleOff} className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">{nombre(s)}</span>
            </button>
          ))}
      </div>
    </div>
  );
};
