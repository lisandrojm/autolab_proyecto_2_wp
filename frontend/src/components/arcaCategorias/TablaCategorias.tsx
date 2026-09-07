import React, { useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faXmark, faArrowRightArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { CategoriaArca } from '../../api/arcaCategorias';

/**
 * TODAS LAS CATEGORÍAS, DE TODOS LOS CONVENIOS, EN UNA TABLA.
 *
 * La vista de tarjetas contesta «qué convenios hay y cuál está sin cargar». Esta contesta la otra
 * pregunta, la que antes obligaba a adivinar: «dónde está la categoría 210053». Por eso el buscador
 * mira también el código y el convenio, y no solo el nombre.
 *
 * LA ★ LA DIBUJA QUIEN LA USA. La misma tabla sirve en el nomenclador —donde se marca el default de
 * la instalación— y en la ficha de una empleadora —donde se marca el suyo, que pisa al de la
 * instalación—. Son dos campos distintos, en dos documentos distintos, con el mismo gesto: si la
 * tabla eligiera uno, el otro necesitaría una copia entera de esto para cambiar una celda.
 */

export interface FilaCategoria {
  cat: CategoriaArca;
  convenio: string;
  nombreConvenio: string;
  /** «G3», o «—» para las que no cuelgan de ningún grupo. */
  grupo: string;
}

interface Props {
  filas: FilaCategoria[];
  cargando: boolean;
  busqueda: string;
  onBuscar: (v: string) => void;
  /** Qué va en el encabezado de la columna: el rótulo y, si corresponde, su botón de limpiar. */
  encabezadoPorDefecto: React.ReactNode;
  /** La ★ de esta fila. */
  renderPorDefecto: (fila: FilaCategoria) => React.ReactNode;
  /** Ir al convenio de esa fila. Sin esto, la columna de acciones no se dibuja. */
  onAbrirConvenio?: (convenio: string) => void;
}

export const TablaCategorias: React.FC<Props> = ({ filas, cargando, busqueda, onBuscar, encabezadoPorDefecto, renderPorDefecto, onAbrirConvenio }) => {
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((f) => `${f.cat.codigoArca} ${f.cat.nombre} ${f.cat.descripcionArca || ''} ${f.convenio} ${f.nombreConvenio}`.toLowerCase().includes(q));
  }, [filas, busqueda]);

  if (cargando) return <LoadingSpinner message="Resolviendo las categorías de todos los convenios..." />;

  return (
    <div className="space-y-3">
      <div className="relative">
        <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input value={busqueda} onChange={(e) => onBuscar(e.target.value)} placeholder="Buscar por código, nombre o convenio..." className="w-full pl-9 pr-8 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200" />
        {busqueda && (
          <button type="button" onClick={() => onBuscar('')} title="Limpiar la búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
            <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {visibles.length} de {filas.length} categoría(s).
      </p>

      <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap w-px">Cód. ARCA</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Convenio</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap w-px">Grupo</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap w-px">Contratos</th>
              {/* Última antes de Acciones, como en todos los nomencladores. */}
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap w-px">{encabezadoPorDefecto}</th>
              {onAbrirConvenio && <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap w-px">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={onAbrirConvenio ? 7 : 6} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  No hay ninguna categoría que coincida.
                </td>
              </tr>
            ) : (
              visibles.map((f) => (
                <tr key={f.cat._id} className="hover:bg-gray-50 dark:hover:bg-gray-900/20">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">{f.cat.codigoArca}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{f.cat.nombre}</span>
                    {!f.cat.isActive && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600" title="Resuelve para los contratos que ya la usan, pero no se ofrece al cargar uno nuevo.">
                        NO ELEGIBLE
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="font-mono text-xs text-blue-700 dark:text-blue-400">{f.convenio}</span>
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[220px]">{f.nombreConvenio}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{f.grupo}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">{f.cat.contratos > 0 ? f.cat.contratos : '—'}</td>
                  <td className="px-4 py-2.5">{renderPorDefecto(f)}</td>
                  {onAbrirConvenio && (
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {/* Editar vive en el detalle del convenio: ahí está el grupo, que es lo que
                          define la escala. Desde acá se va hasta ahí en vez de duplicar el formulario. */}
                      <button type="button" onClick={() => onAbrirConvenio(f.convenio)} title={`Abrir ${f.convenio} para editarla`} className="p-1.5 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors">
                        <FontAwesomeIcon icon={faArrowRightArrowLeft} className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
