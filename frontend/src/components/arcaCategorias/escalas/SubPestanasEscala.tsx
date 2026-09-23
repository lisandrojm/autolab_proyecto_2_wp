import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTableCells, faCoins, faBuilding, faFileContract, faIdCard } from '@fortawesome/free-solid-svg-icons';

/**
 * Las sub-pestañas de un convenio: lo que el acuerdo paritario define, además de la escala por grupo.
 *
 * Van DENTRO de la pestaña del convenio (no como pantallas aparte) porque son el mismo acuerdo mirado de cinco
 * maneras: la misma fecha de vigencia gobierna las cinco, y separarlas en rutas distintas obligaría a elegir la
 * fecha cinco veces.
 *
 * La barra queda pegada debajo de la de convenios, que está en `top-[177px]`. Este `top-[225px]` es esa altura
 * más la de esta barra: si alguna de las dos cambia de alto, las dos constantes se mueven juntas.
 */

export type SubPestanaEscala = 'escala' | 'adicionales' | 'pequenas' | 'acuerdos' | 'ficha';

const PESTANAS: Array<{ clave: SubPestanaEscala; texto: string; icono: typeof faTableCells; ayuda: string }> = [
  { clave: 'escala', texto: 'Escala por grupo', icono: faTableCells, ayuda: 'Los grupos salariales con sus importes y sus categorías.' },
  { clave: 'adicionales', texto: 'Adicionales', icono: faCoins, ayuda: 'Antigüedad, comidas, viáticos y todo lo que el acta paga además del básico.' },
  { clave: 'pequenas', texto: 'Pequeñas empresas', icono: faBuilding, ayuda: 'El capítulo del acta con valores por semana, jornada y hora extra.' },
  { clave: 'acuerdos', texto: 'Acuerdos', icono: faFileContract, ayuda: 'Los tramos paritarios, el expediente y el PDF del acta.' },
  { clave: 'ficha', texto: 'Ficha del convenio', icono: faIdCard, ayuda: 'Partes, sindicato y régimen alternativo.' },
];

export const SubPestanasEscala: React.FC<{ activa: SubPestanaEscala; onCambiar: (p: SubPestanaEscala) => void }> = ({ activa, onCambiar }) => (
  <div className="flex border-b border-gray-200 dark:border-gray-700 sticky top-[225px] z-10 bg-gray-100 dark:bg-gray-900 overflow-x-auto">
    {PESTANAS.map((p) => (
      <button
        key={p.clave}
        type="button"
        onClick={() => onCambiar(p.clave)}
        title={p.ayuda}
        className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${
          activa === p.clave ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
        }`}
      >
        <FontAwesomeIcon icon={p.icono} className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{p.texto}</span>
      </button>
    ))}
  </div>
);
