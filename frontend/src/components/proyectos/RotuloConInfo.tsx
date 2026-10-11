import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { InfoModal } from '../ui/InfoModal';

/**
 * EL RÓTULO DE UN CAMPO DEL FORMULARIO DE PROYECTO, con su ⓘ.
 *
 * La explicación va en un modal y no debajo del campo: el formulario ya es largo, y un párrafo fijo
 * por campo lo hacía más largo para decir algo que se lee una vez. Mismo aspecto que el ⓘ de
 * «Empresa del Contrato» y «Empresa del Release».
 */
export const RotuloConInfo: React.FC<{ texto: string; titulo: string; children: React.ReactNode; className?: string }> = ({ texto, titulo, children, className = '' }) => {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <span className={`text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2 ${className}`}>
        {texto}
        <button type="button" onClick={() => setAbierto(true)} title={`Qué es «${titulo}»`} aria-label={`Qué es «${titulo}»`} className="text-blue-500 hover:text-blue-600 transition-colors normal-case">
          <FontAwesomeIcon icon={faInfoCircle} />
        </button>
      </span>
      <InfoModal isOpen={abierto} onClose={() => setAbierto(false)} title={titulo} size="sm" zIndex={90}>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{children}</div>
      </InfoModal>
    </>
  );
};
