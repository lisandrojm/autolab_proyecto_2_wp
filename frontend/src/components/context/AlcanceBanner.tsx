import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faGlobe, faUsers, faLandmark } from '@fortawesome/free-solid-svg-icons';
import { useClientContextStore } from '../../stores/clientContextStore';
import { useEmpresaContextStore } from '../../stores/empresaContextStore';

/**
 * Dice si la pantalla respeta o no el contexto activo.
 *
 * Es la respuesta a un problema silencioso: con un cliente elegido, "Proyectos" aparecía en dos
 * lugares del menú y NINGUNO decía cuál estaba filtrado. Peor todavía: hay pantallas globales que
 * ignoran el contexto por completo, y eso no se puede deducir mirándolas.
 *
 * Dos modos, y la diferencia importa:
 *  - `filtrado`: la pantalla SÍ está acotada a una entidad. El chip lo dice y sirve para salir.
 *  - `global`: la pantalla muestra todo aunque haya una ficha abierta. Se avisa, en tono neutro:
 *    no es un error, es el alcance de esa pantalla — y de hecho es el caso normal, porque abrir una
 *    ficha NO filtra el resto de la app.
 */
type Eje = 'cliente' | 'empresa';

const ICONOS: Record<Eje, typeof faUsers> = { cliente: faUsers, empresa: faLandmark };

interface Props {
  /** Qué eje mira esta pantalla. */
  eje: Eje;
  /**
   * `filtrado` = la pantalla ya está acotada a lo elegido. `global` = muestra todo.
   * En `global` el banner solo aparece si hay algo elegido; si no, no hay nada que aclarar.
   */
  modo: 'filtrado' | 'global';
  /** A dónde ir para ver la versión acotada (solo en `global`). */
  irAlFiltrado?: string;
  /** Nombre a mostrar en `filtrado` cuando la pantalla lo resuelve por URL y no por el store. */
  nombre?: string;
}

export const AlcanceBanner: React.FC<Props> = ({ eje, modo, irAlFiltrado, nombre }) => {
  const navigate = useNavigate();
  const { selectedClient, clearSelectedClient } = useClientContextStore();
  const { selectedEmpresa, clearSelectedEmpresa } = useEmpresaContextStore();

  const activo = eje === 'cliente' ? selectedClient?.name : selectedEmpresa?.razonSocial;
  const etiqueta = nombre || activo;
  const limpiar = eje === 'cliente' ? clearSelectedClient : clearSelectedEmpresa;

  if (modo === 'filtrado') {
    if (!etiqueta) return null;
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
        <FontAwesomeIcon icon={ICONOS[eje]} className="h-3 w-3" />
        {/* "Ficha de" y no "Filtrado por": habla el mismo idioma que el bloque FICHAS del menú. Sigue
            siendo cierto —esta pantalla muestra solo lo de esa entidad— y la ✕ sigue sirviendo para salir. */}
        <span>
          Ficha de: <strong>{etiqueta}</strong>
        </span>
        <button
          type="button"
          onClick={() => {
            limpiar();
            navigate(eje === 'cliente' ? '/clients' : '/empresas');
          }}
          title={`Salir del contexto de ${eje}`}
          className="p-0.5 rounded hover:bg-primary-200 dark:hover:bg-primary-800/60 transition-colors"
        >
          <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
        </button>
      </div>
    );
  }

  // Global: sin contexto activo no hay ambigüedad que aclarar.
  if (!activo) return null;
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
      <FontAwesomeIcon icon={faGlobe} className="h-3 w-3" />
      <span>
        Mostrando <strong>todo</strong>, sin filtrar por {eje} <FontAwesomeIcon icon={ICONOS[eje]} className="h-2.5 w-2.5 mx-0.5 opacity-70" /> <strong>{activo}</strong>
      </span>
      {irAlFiltrado && (
        <button type="button" onClick={() => navigate(irAlFiltrado)} className="font-semibold text-primary-600 dark:text-primary-400 hover:underline">
          Ver solo lo de {activo}
        </button>
      )}
    </div>
  );
};
