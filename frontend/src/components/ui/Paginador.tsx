import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';

/**
 * Paginador para listas que YA están en memoria.
 *
 * No pide páginas al servidor: la lista completa está cargada y lo que se recorta es lo que se
 * DIBUJA. Con 2.669 convenios el navegador estaba armando 2.669 filas de tabla con tres columnas de
 * texto largo, y eso es lo que se sentía lento — la respuesta de la API son 840 KB, que llegan en un
 * suspiro.
 *
 * La consecuencia de que los datos estén completos en memoria es la que importa: el buscador filtra
 * SIEMPRE sobre el total, no sobre la página que se está viendo, y el resultado se vuelve a paginar.
 * Un buscador que solo mira la página actual es peor que no tener buscador, porque contesta «no hay
 * resultados» sobre datos que sí están.
 */

/** Cuántos por página. Es lo que entra en una pantalla sin scrollear tres veces. */
export const POR_PAGINA = 50;

export const Paginador: React.FC<{
  /** Cuántos elementos hay DESPUÉS de filtrar. */
  total: number;
  pagina: number;
  onCambiar: (pagina: number) => void;
  /** Cómo se llama lo que se pagina, en plural: "convenios", "obras sociales". */
  entidadPlural?: string;
}> = ({ total, pagina, onCambiar, entidadPlural }) => {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  // Con una sola página no hay nada que decidir: el paginador sería un control que no hace nada.
  if (paginas <= 1) return null;

  const desde = (pagina - 1) * POR_PAGINA + 1;
  const hasta = Math.min(pagina * POR_PAGINA, total);

  /*
    Qué números se muestran: los de alrededor, con la primera y la última siempre presentes.

    Con 54 páginas, dibujarlas todas es una tira de números que nadie lee. Y las puntas se conservan
    porque «volver al principio» y «ver el final» son los dos saltos que se hacen de verdad.
  */
  const cerca = [pagina - 1, pagina, pagina + 1].filter((p) => p >= 1 && p <= paginas);
  const visibles = [...new Set([1, ...cerca, paginas])].sort((a, b) => a - b);

  const btn = 'min-w-[2rem] px-2 py-1 rounded-md text-xs font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const inactivo = 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400';

  return (
    <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
      {/* El rango va primero y en texto: es lo que contesta «¿dónde estoy?» sin tener que contar. */}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {desde}–{hasta} de {total}
        {entidadPlural ? ` ${entidadPlural}` : ''}
      </p>

      <nav className="flex items-center gap-1" aria-label="Paginación">
        <button type="button" onClick={() => onCambiar(pagina - 1)} disabled={pagina === 1} aria-label="Página anterior" className={`${btn} ${inactivo}`}>
          <FontAwesomeIcon icon={faChevronLeft} className="h-2.5 w-2.5" />
        </button>

        {visibles.map((p, i) => (
          <React.Fragment key={p}>
            {/* El «…» marca que hay páginas salteadas. Sin él, «1 27 28 29 54» se lee como si fueran
                cinco páginas y no cincuenta y cuatro. */}
            {i > 0 && p - visibles[i - 1] > 1 && <span className="px-1 text-xs text-gray-400 dark:text-gray-600">…</span>}
            <button
              type="button"
              onClick={() => onCambiar(p)}
              aria-label={`Página ${p}`}
              aria-current={p === pagina ? 'page' : undefined}
              className={`${btn} ${p === pagina ? 'border-blue-600 bg-blue-600 text-white' : inactivo}`}
            >
              {p}
            </button>
          </React.Fragment>
        ))}

        <button type="button" onClick={() => onCambiar(pagina + 1)} disabled={pagina === paginas} aria-label="Página siguiente" className={`${btn} ${inactivo}`}>
          <FontAwesomeIcon icon={faChevronRight} className="h-2.5 w-2.5" />
        </button>
      </nav>
    </div>
  );
};
