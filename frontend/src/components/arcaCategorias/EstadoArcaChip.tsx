import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faTriangleExclamation, faCircleQuestion } from '@fortawesome/free-solid-svg-icons';
import { TEXTO_ESTADO_CATEGORIA, type EstadoCategoriaArca } from '@compartido/catalogoArca';

/**
 * El estado de una categoría contra lo que ARCA dice de su código, en una pastilla.
 *
 * `ok` va discreto (es lo normal); cualquier otro en rojo, salvo `nombre_distinto` ya confirmado, que
 * va en gris con el aviso: alguien lo revisó, pero sigue sin ser igual.
 */
export const EstadoArcaChip: React.FC<{ estado?: EstadoCategoriaArca | null; confirmada?: boolean; descripcion?: string }> = ({ estado, confirmada, descripcion }) => {
  if (!estado) return null;
  if (estado === 'ok')
    return (
      <span title={TEXTO_ESTADO_CATEGORIA.ok} className="inline-flex items-center text-green-600 dark:text-green-400">
        <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
      </span>
    );
  const titulo = `${TEXTO_ESTADO_CATEGORIA[estado]}${descripcion ? ` — ARCA: «${descripcion}»` : ''}${confirmada ? ' (confirmado)' : ''}`;
  const corto = { nombre_distinto: 'Nombre ≠ ARCA', grupo_distinto: 'Otro grupo en ARCA', no_existe_en_arca: 'No existe en ARCA', no_vigente: 'Ya no vigente' }[estado];
  return (
    <span
      title={titulo}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${
        confirmada ? 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600' : 'bg-red-50 text-red-700 border-red-300 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800'
      }`}
    >
      <FontAwesomeIcon icon={confirmada ? faCircleQuestion : faTriangleExclamation} className="h-2.5 w-2.5" />
      {corto}
      {confirmada ? ' · confirmado' : ''}
    </span>
  );
};
