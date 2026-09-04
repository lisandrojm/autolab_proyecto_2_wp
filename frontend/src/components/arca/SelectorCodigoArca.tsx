import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faXmark, faSpinner, faTriangleExclamation, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { SimpleCatalogItem } from '../../api/simpleCatalog';

/**
 * Elegir un código de un nomenclador de ARCA, buscando por código o por nombre.
 *
 * Reemplaza a los inputs de texto libre donde estos códigos se tipeaban de memoria. Validar "3
 * dígitos" con un regex no servía de nada: `999` tiene 3 dígitos y ARCA lo rechaza igual. Lo único
 * que hace válido a un código es estar en el nomenclador, así que se elige de ahí.
 *
 * Es un combo de búsqueda y no un `<select>` nativo porque el catálogo más chico tiene 8 opciones y
 * el más grande 293, y varias comparten nombre.
 *
 * EL CÓDIGO SIEMPRE ESTÁ A LA VISTA, en el listado y en lo elegido. No es decoración: en Tipos de
 * Servicio hay nombres que se repiten y en dos casos (114/115 y 248/249) el código es lo ÚNICO que
 * los distingue.
 */

export const SelectorCodigoArca: React.FC<{
  label: string;
  /** Aclaración corta al lado de la etiqueta, ej. "(3 díg.)". */
  sufijoLabel?: string;
  items: SimpleCatalogItem[];
  cargando?: boolean;
  /** Código guardado, "" si no hay. */
  value: string;
  onChange: (codigo: string) => void;
  /** Normaliza para mostrar y guardar (ej. rellenar a 3 dígitos con ceros). */
  formatCodigo: (v: string) => string;
  placeholder?: string;
  /** Se muestra en vez del listado cuando el selector está trabado por una dependencia sin elegir. */
  bloqueadoPor?: string;
  /** Texto cuando el catálogo está vacío: dice dónde se llena. */
  vacioHint?: string;
  /**
   * La explicación del campo, detrás de un ⓘ al lado de la etiqueta.
   *
   * Va acá y no como párrafo debajo del selector: son textos que se leen una vez y después estorban
   * en cada edición. El ⓘ va FUERA del <label> — adentro, el label se asocia al botón y toda la fila
   * queda como área activa suya.
   */
  ayuda?: string;
}> = ({ label, sufijoLabel, items, cargando, value, onChange, formatCodigo, placeholder, bloqueadoPor, vacioHint, ayuda }) => {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (abierto) inputRef.current?.focus();
  }, [abierto]);

  // Al trabarse (se limpió la dependencia) el buscador se cierra: dejarlo abierto mostrando "elegí
  // primero el grupo" es una caja de texto que no hace nada.
  useEffect(() => {
    if (bloqueadoPor) setAbierto(false);
  }, [bloqueadoPor]);

  const porCodigo = useMemo(() => new Map(items.map((i) => [formatCodigo(String(i.externalId || '')), i.name])), [items, formatCodigo]);
  const codigo = value ? formatCodigo(value) : '';
  const nombre = codigo ? porCodigo.get(codigo) : undefined;
  // Cargado pero fuera del catálogo: viene de cuando esto se tipeaba a mano. No se borra solo —el
  // dato es del usuario— pero se marca, porque ARCA lo va a rechazar.
  const desconocido = !!codigo && !cargando && items.length > 0 && !nombre;

  /*
    SIN TOPE: se listan TODOS los del nomenclador.

    Estaba cortado en 30 y no se avisaba, así que un catálogo de 293 parecía terminar en la letra A y
    a los de la mitad del abecedario solo se llegaba adivinando la palabra que los trajera arriba. El
    mismo corte estaba en el buscador de actividades de un domicilio, y es el que se reportó.
  */
  const resultados = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digitos = q.replace(/\D/g, '');
    if (!term) return items;
    return items.filter((i) => (digitos && String(i.externalId || '').includes(digitos)) || String(i.name || '').toLowerCase().includes(term));
  }, [items, q]);

  return (
    <div className="space-y-1.5">
      <span className="flex items-center gap-1.5 ml-1">
        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
          {label} {sufijoLabel && <span className="normal-case tracking-normal text-gray-400">{sufijoLabel}</span>}
        </label>
        {ayuda && (
          <span title={ayuda} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help shrink-0">
            <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
          </span>
        )}
      </span>

      {/* Lo elegido, o el hueco. */}
      <div className={`rounded-lg border px-3 py-2 flex items-center gap-3 ${desconocido ? 'border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40'}`}>
        {codigo ? (
          <>
            <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400 shrink-0">{codigo}</span>
            <span className="text-sm text-gray-800 dark:text-gray-200 min-w-0 flex-1 truncate" title={nombre || ''}>
              {nombre || <span className="italic text-amber-700 dark:text-amber-400">no está en el catálogo</span>}
            </span>
            <button type="button" onClick={() => onChange('')} title={`Quitar ${label.toLowerCase()}`} className="text-gray-400 hover:text-red-500 transition-colors shrink-0">
              <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-500 italic flex-1">{bloqueadoPor ? bloqueadoPor : placeholder || 'Sin elegir'}</span>
        )}
        {!bloqueadoPor && (
          <button type="button" onClick={() => setAbierto((v) => !v)} className="shrink-0 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            {abierto ? 'Cerrar' : codigo ? 'Cambiar' : 'Elegir'}
          </button>
        )}
      </div>

      {abierto && !bloqueadoPor && (
        <div className="rounded-lg border border-blue-300 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20 p-2 space-y-2">
          <div className="relative">
            <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código o nombre…" className="input-field w-full pl-9" />
          </div>

          {cargando ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 px-1 py-2">
              <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5 h-3 w-3" />
              Cargando el catálogo…
            </p>
          ) : items.length === 0 ? (
            <p className="text-xs text-amber-700 dark:text-amber-400 px-1 py-2 flex items-start gap-1.5">
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3 mt-0.5 shrink-0" />
              {vacioHint || 'El catálogo está vacío.'}
            </p>
          ) : resultados.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 px-1 py-2">Sin resultados para «{q}».</p>
          ) : (
            <ul className="max-h-52 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60 bg-white dark:bg-gray-900">
              {resultados.map((i) => {
                const c = formatCodigo(String(i.externalId || ''));
                return (
                  <li key={i._id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(c);
                        setAbierto(false);
                        setQ('');
                      }}
                      className={`w-full text-left px-3 py-2 flex items-baseline gap-3 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors ${c === codigo ? 'bg-blue-50/70 dark:bg-blue-900/20' : ''}`}
                    >
                      <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400 shrink-0">{c}</span>
                      <span className="text-sm text-gray-800 dark:text-gray-200 min-w-0">{i.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
