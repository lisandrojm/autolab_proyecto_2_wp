import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { BANDEJAS, bandejaPorClave, siguienteBandeja, type ClaveBandeja } from '../../config/bandejasContratacion';
import { usePuedeAbrir } from '../../hooks/usePuedeAbrir';

const CHIP = 'inline-flex items-center px-2.5 py-1 rounded text-xs font-medium border whitespace-nowrap bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700';

/**
 * Al lado del título de cada bandeja: en qué paso del circuito se está (chips de filtro, como pidió el
 * usuario el 09/11/2026) y, discreto, el link al paso que sigue. El circuito se recorre de bandeja en
 * bandeja sin volver al menú. Sin permiso para el siguiente no se ofrece.
 */
export const PasoDelFlujo: React.FC<{ clave: ClaveBandeja; variante?: string }> = ({ clave, variante }) => {
  const puedeAbrir = usePuedeAbrir();
  const bandeja = bandejaPorClave(clave);
  const siguiente = siguienteBandeja(clave);
  return (
    <span className="flex items-center gap-1.5 flex-wrap min-w-0 ml-1">
      <span className={CHIP} title={bandeja.descripcion}>
        Paso {bandeja.numero} de {BANDEJAS.length}
      </span>
      {variante && (
        <>
          <FontAwesomeIcon icon={faChevronRight} className="h-2.5 w-2.5 text-gray-400 shrink-0" />
          <span className={CHIP}>{variante}</span>
        </>
      )}
      {siguiente && puedeAbrir(siguiente.ruta) && (
        <Link to={siguiente.ruta} title={siguiente.descripcion} className="ml-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:underline whitespace-nowrap">
          Siguiente paso: {siguiente.numero} · {siguiente.label}
          <FontAwesomeIcon icon={faArrowRight} className="h-2.5 w-2.5" />
        </Link>
      )}
    </span>
  );
};
