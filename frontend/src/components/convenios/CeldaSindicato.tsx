import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye } from '@fortawesome/free-solid-svg-icons';
import { ConvenioFila } from './ConveniosTable';

/** El sindicato tal como lo pobla el server en el listado de convenios. */
interface SindicatoPoblado {
  _id: string;
  name: string;
  sigla?: unknown;
}

/**
 * El sindicato firmante de un convenio, ya poblado por el server como `{_id, name, sigla}`.
 * Devuelve `null` cuando el convenio no tiene gremio asignado, que es el caso de la enorme mayoría.
 */
export const sindicatoDeConvenio = (c: ConvenioFila): SindicatoPoblado | null => {
  const v = (c as { sindicatoId?: unknown }).sindicatoId;
  return v && typeof v === 'object' ? (v as SindicatoPoblado) : null;
};

/**
 * La celda «Sindicato»: chip con la sigla más el ojito que lleva al gremio.
 *
 * Compartida por el nomenclador y la ficha de empresa. Estaba duplicada y ya había divergido —la
 * ficha se quedó sin el ojito— que es exactamente lo que le pasó antes a `ConveniosTable` y a la
 * celda de paritarias. Una tercera copia de tres líneas de JSX no vale el riesgo de que las tres
 * digan cosas distintas.
 *
 * CHIP y no texto plano a propósito: «Fuente de paritarias», dos columnas más allá, también nombra
 * gremios —y para la mayoría de los convenios dice lo mismo, porque la fuente suele ser el sitio del
 * propio gremio—. La forma es lo único que las distingue de un vistazo.
 */
export const CeldaSindicato: React.FC<{ convenio: ConvenioFila }> = ({ convenio }) => {
  const s = sindicatoDeConvenio(convenio);
  if (!s) return <span className="text-gray-400 dark:text-gray-600">—</span>;
  const sigla = typeof s.sigla === 'string' ? s.sigla.trim() : '';
  return (
    <span className="inline-flex items-center gap-1.5">
      {/* La sigla si la hay; si no, el nombre, que es lo único que queda para identificarlo. */}
      <span title={s.name} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
        {sigla || s.name}
      </span>
      {/*
        El camino de vuelta al gremio, simétrico al ojito que hay en Sindicatos.

        Lleva al ABM con el buscador ya cargado y no a una ficha, porque ese catálogo no tiene una:
        `?buscar=` deja la fila a la vista, con su sigla y sus otros convenios al lado.
      */}
      <Link to={`/sindicatos?buscar=${encodeURIComponent(s.name)}`} title={`Ver ${s.name} en Sindicatos`} aria-label={`Ver ${s.name} en Sindicatos`} className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">
        <FontAwesomeIcon icon={faEye} className="h-3.5 w-3.5" />
      </Link>
    </span>
  );
};
