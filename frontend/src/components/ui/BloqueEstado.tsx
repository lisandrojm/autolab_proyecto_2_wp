import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faToggleOn, faToggleOff } from '@fortawesome/free-solid-svg-icons';

/**
 * El bloque «Estado» del final de un formulario: activo / inactivo, en un solo gesto.
 *
 * Existe porque los tres formularios que tienen este campo lo mostraban distinto: Proyecto con una
 * pastilla verde chica, Usuario con un botón grande de fondo lleno y sombra, y Contrato con un
 * checkbox suelto en el medio del formulario. Tres maneras de decir lo mismo, y ninguna de las tres
 * se parecía a las otras dos.
 *
 * Se tomó como referencia el de Proyecto: es el más discreto de los tres, y esto es un dato de
 * cierre —no la acción principal del formulario—, así que no debería competir con «Guardar».
 *
 * Va SIEMPRE al final y separado por una línea: es una propiedad del registro entero, no un campo
 * más de la sección donde caiga.
 */
interface Props {
  activo: boolean;
  onChange: (activo: boolean) => void;
  /** Cómo se llama el estado encendido. Default «Activo». */
  etiquetaActivo?: string;
  /** Cómo se llama el apagado. Cambia por dominio: un proyecto queda «En Espera», no «Inactivo». */
  etiquetaInactivo?: string;
  /** Título del bloque. Default «Estado». */
  titulo?: string;
  /**
   * Slot al lado del título, para un ⓘ que abra la explicación.
   *
   * Va acá y no como un párrafo debajo del switch: la aclaración de un estado suele ser larga —qué
   * implica prenderlo, a quién le afecta— y puesta en el formulario compite con el propio control,
   * que es lo único que hay que mirar para decidir.
   */
  info?: React.ReactNode;
  className?: string;
}

export const BloqueEstado: React.FC<Props> = ({ activo, onChange, etiquetaActivo = 'Activo', etiquetaInactivo = 'Inactivo', titulo = 'Estado', info, className = '' }) => (
  <div className={`border-t border-gray-200 dark:border-gray-700 pt-4 mt-4 ${className}`}>
    <div className="flex items-center gap-2 mb-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{titulo}</label>
      {info}
    </div>
    <button
      type="button"
      onClick={() => onChange(!activo)}
      className={`px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors ${activo ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400'}`}
    >
      <FontAwesomeIcon icon={activo ? faToggleOn : faToggleOff} className="mr-1 h-4 w-4" />
      {activo ? etiquetaActivo : etiquetaInactivo}
    </button>
  </div>
);
