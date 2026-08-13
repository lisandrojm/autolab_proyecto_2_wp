import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faToggleOn, faToggleOff, faSearch, faSpinner, faXmark } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogItem } from "../../api/simpleCatalog";

interface Props {
  convenios: SimpleCatalogItem[];
  cargando?: boolean;
  /** Ids de los convenios asociados. */
  value: string[];
  onChange: (ids: string[]) => void;
}

/** Cuántos resultados se muestran a la vez: el nomenclador de AFIP tiene miles de convenios. */
const MAX_RESULTADOS = 40;

/**
 * Todas las palabras del texto buscado tienen que aparecer en algún lado del convenio (código,
 * actividad o signatario), sin importar el orden: "comercio faecys" encuentra el CCT de Empleados
 * de Comercio. Se ignoran acentos y mayúsculas.
 */
const normalizar = (s: string): string =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const coincide = (item: SimpleCatalogItem, palabras: string[]): boolean => {
  const texto = normalizar(`${item.externalId || ""} ${item.name || ""} ${(item as { signatario?: string }).signatario || ""}`);
  return palabras.every((p) => texto.includes(p));
};

export const ConvenioSelector: React.FC<Props> = ({ convenios, cargando, value, onChange }) => {
  const [busqueda, setBusqueda] = useState("");

  const seleccionados = useMemo(() => convenios.filter((c) => value.includes(c._id)), [convenios, value]);

  const resultados = useMemo(() => {
    const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return [];
    // Los ya elegidos se listan aparte arriba, así no aparecen dos veces.
    return convenios.filter((c) => !value.includes(c._id) && coincide(c, palabras));
  }, [convenios, busqueda, value]);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  const Fila: React.FC<{ item: SimpleCatalogItem; activo: boolean }> = ({ item, activo }) => (
    <button
      type="button"
      onClick={() => toggle(item._id)}
      className={`w-full text-left px-3 py-2 rounded-lg border flex items-start gap-3 transition-colors ${
        activo
          ? "bg-blue-50 border-blue-200 dark:bg-blue-900/25 dark:border-blue-800"
          : "bg-white border-gray-200 hover:bg-gray-50 dark:bg-gray-900/40 dark:border-gray-700 dark:hover:bg-gray-800"
      }`}
    >
      <FontAwesomeIcon icon={activo ? faToggleOn : faToggleOff} className={`h-4 w-4 mt-0.5 shrink-0 ${activo ? "text-blue-600 dark:text-blue-400" : "text-gray-400"}`} />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 break-words">
          {item.externalId && <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-2">{item.externalId}</span>}
          {item.name}
        </span>
        {(item as { signatario?: string }).signatario && <span className="block text-xs text-gray-500 dark:text-gray-400 break-words">{(item as { signatario?: string }).signatario}</span>}
      </span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <FontAwesomeIcon icon={cargando ? faSpinner : faSearch} spin={cargando} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={cargando ? "Cargando convenios..." : "Buscar por código, actividad o signatario…"}
          disabled={cargando}
          className="w-full pl-9 pr-9 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60"
        />
        {busqueda && (
          <button type="button" onClick={() => setBusqueda("")} title="Limpiar" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Elegidos: siempre visibles, aunque no coincidan con la búsqueda actual. */}
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Asociados ({seleccionados.length})</p>
        {seleccionados.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">Todavía no hay convenios asociados a esta empresa.</p>
        ) : (
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {seleccionados.map((c) => (
              <Fila key={c._id} item={c} activo />
            ))}
          </div>
        )}
      </div>

      {busqueda.trim() && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            Resultados ({resultados.length}
            {resultados.length > MAX_RESULTADOS ? ` — se muestran los primeros ${MAX_RESULTADOS}` : ""})
          </p>
          {resultados.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">Sin resultados para “{busqueda}”.</p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {resultados.slice(0, MAX_RESULTADOS).map((c) => (
                <Fila key={c._id} item={c} activo={false} />
              ))}
            </div>
          )}
        </div>
      )}

      {!busqueda.trim() && !cargando && <p className="text-xs text-gray-400 dark:text-gray-500">Escribí para buscar entre los {convenios.length} convenios del catálogo.</p>}
    </div>
  );
};
