import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faToggleOff, faSearch, faSpinner, faXmark } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogItem } from "../../api/simpleCatalog";

/**
 * Elegir un SUBCONJUNTO de un catálogo grande para una empresa.
 *
 * Es el mismo gesto para convenios (miles en el nomenclador), obras sociales (496) y cualquier otro
 * catálogo que la empleadora "registra": buscar en el universo y quedarse con los suyos. Por eso hay
 * un solo componente y no una copia por catálogo — la interacción tiene que ser idéntica, y lo es
 * por construcción.
 *
 * Los elegidos se listan SIEMPRE arriba, como badges con "×", aunque no coincidan con la búsqueda
 * actual: son pocos y es lo que el usuario necesita ver de un vistazo. Los resultados solo aparecen
 * al escribir, porque volcar miles de filas no ayuda a nadie.
 */
interface Props {
  items: SimpleCatalogItem[];
  cargando?: boolean;
  /** Ids de los elegidos. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Cómo se llama lo que se elige, en plural y minúscula: "convenios", "obras sociales". */
  entidadPlural: string;
  placeholder: string;
  /** Formatea el `externalId` para mostrarlo (ej. el RNOS con guiones). */
  formatCodigo?: (externalId: string) => string;
  /** Segunda línea de cada resultado (ej. el signatario del convenio). */
  detalle?: (item: SimpleCatalogItem) => string | undefined;
}

/** Cuántos resultados se muestran a la vez: estos catálogos tienen cientos o miles de filas. */
const MAX_RESULTADOS = 40;

/**
 * Todas las palabras del texto buscado tienen que aparecer en algún lado del ítem (código, nombre o
 * detalle), sin importar el orden: "comercio faecys" encuentra el CCT de Empleados de Comercio. Se
 * ignoran acentos y mayúsculas.
 */
const normalizar = (s: string): string =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    // El rango va con escapes y NO con los caracteres literales: son marcas combinantes invisibles,
    // que cualquier reformateo o cambio de codificación puede romper sin que se note.
    .replace(/[\u0300-\u036f]/g, "");

export const CatalogoMultiSelector: React.FC<Props> = ({ items, cargando, value, onChange, entidadPlural, placeholder, formatCodigo, detalle }) => {
  const [busqueda, setBusqueda] = useState("");

  const codigo = (item: SimpleCatalogItem) => (formatCodigo ? formatCodigo(String(item.externalId || "")) : String(item.externalId || ""));

  const seleccionados = useMemo(() => items.filter((c) => value.includes(c._id)), [items, value]);

  const resultados = useMemo(() => {
    const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return [];
    // Los ya elegidos se listan aparte arriba, así no aparecen dos veces.
    return items.filter((c) => {
      if (value.includes(c._id)) return false;
      const texto = normalizar(`${c.externalId || ""} ${codigo(c)} ${c.name || ""} ${detalle?.(c) || ""}`);
      return palabras.every((p) => texto.includes(p));
    });
  }, [items, busqueda, value, formatCodigo, detalle]);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <FontAwesomeIcon icon={cargando ? faSpinner : faSearch} spin={cargando} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={cargando ? `Cargando ${entidadPlural}...` : placeholder}
          disabled={cargando}
          className="w-full pl-9 pr-9 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60"
        />
        {busqueda && (
          <button type="button" onClick={() => setBusqueda("")} title="Limpiar" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Asociados ({seleccionados.length})</p>
        {seleccionados.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">Todavía no hay {entidadPlural} asociadas a esta empresa.</p>
        ) : (
          <div className="flex items-center gap-2 flex-wrap max-h-40 overflow-y-auto">
            {seleccionados.map((c) => (
              <span
                key={c._id}
                title={`${codigo(c) ? `${codigo(c)} — ` : ""}${c.name}${detalle?.(c) ? ` (${detalle(c)})` : ""}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-medium rounded border border-primary-200 dark:border-primary-800 max-w-full"
              >
                {codigo(c) && <span className="font-mono opacity-70 shrink-0">{codigo(c)}</span>}
                <span className="truncate">{c.name}</span>
                <button type="button" onClick={() => toggle(c._id)} title={`Quitar ${c.name}`} className="hover:bg-primary-200 dark:hover:bg-primary-800/50 rounded p-0.5 transition-colors shrink-0">
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
                <button
                  key={c._id}
                  type="button"
                  onClick={() => toggle(c._id)}
                  className="w-full text-left px-3 py-2 rounded-lg border flex items-start gap-3 transition-colors bg-white border-gray-200 hover:bg-gray-50 dark:bg-gray-900/40 dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  <FontAwesomeIcon icon={faToggleOff} className="h-4 w-4 mt-0.5 shrink-0 text-gray-400" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 break-words">
                      {codigo(c) && <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-2">{codigo(c)}</span>}
                      {c.name}
                    </span>
                    {detalle?.(c) && <span className="block text-xs text-gray-500 dark:text-gray-400 break-words">{detalle(c)}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!busqueda.trim() && !cargando && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Escribí para buscar entre {items.length} {entidadPlural} del catálogo.
        </p>
      )}
    </div>
  );
};
