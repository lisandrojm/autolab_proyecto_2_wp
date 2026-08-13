import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faToggleOff, faSearch, faSpinner, faXmark } from "@fortawesome/free-solid-svg-icons";
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

  /** Fila de resultado: los ya asociados no llegan acá (se listan arriba como badges). */
  const Fila: React.FC<{ item: SimpleCatalogItem }> = ({ item }) => (
    <button
      type="button"
      onClick={() => toggle(item._id)}
      className="w-full text-left px-3 py-2 rounded-lg border flex items-start gap-3 transition-colors bg-white border-gray-200 hover:bg-gray-50 dark:bg-gray-900/40 dark:border-gray-700 dark:hover:bg-gray-800"
    >
      <FontAwesomeIcon icon={faToggleOff} className="h-4 w-4 mt-0.5 shrink-0 text-gray-400" />
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

      {/* Elegidos: como badges con "×", igual que los filtros. Se ven todos de un vistazo aunque no
          coincidan con la búsqueda actual. */}
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Asociados ({seleccionados.length})</p>
        {seleccionados.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">Todavía no hay convenios asociados a esta empresa.</p>
        ) : (
          <div className="flex items-center gap-2 flex-wrap max-h-40 overflow-y-auto">
            {seleccionados.map((c) => (
              <span
                key={c._id}
                title={`${c.externalId ? `${c.externalId} — ` : ""}${c.name}${(c as { signatario?: string }).signatario ? ` (${(c as { signatario?: string }).signatario})` : ""}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-medium rounded border border-primary-200 dark:border-primary-800 max-w-full"
              >
                {c.externalId && <span className="font-mono opacity-70 shrink-0">{c.externalId}</span>}
                <span className="truncate">{c.name}</span>
                <button
                  type="button"
                  onClick={() => toggle(c._id)}
                  title={`Quitar ${c.name}`}
                  className="hover:bg-primary-200 dark:hover:bg-primary-800/50 rounded p-0.5 transition-colors shrink-0"
                >
                  <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                </button>
              </span>
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
                <Fila key={c._id} item={c} />
              ))}
            </div>
          )}
        </div>
      )}

      {!busqueda.trim() && !cargando && <p className="text-xs text-gray-400 dark:text-gray-500">Escribí para buscar entre los {convenios.length} convenios del catálogo.</p>}
    </div>
  );
};
