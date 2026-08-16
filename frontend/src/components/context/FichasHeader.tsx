import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { InfoModal } from '../ui/InfoModal';
import { getHelp } from '../../data/help/helpContent';

/**
 * Encabezado del bloque "Fichas" del menú lateral, con su ⓘ.
 *
 * Se llama FICHAS y no "Contexto" a propósito. "Contexto" prometía que elegir una empresa o un
 * cliente acotaba lo que ves, y **eso no pasa en ningún lado**: las subpáginas de cada entidad
 * resuelven a quién muestran desde la URL (`useParams`), no desde el store, y las pantallas globales
 * (Todos los proyectos, Todos los contratos, Usuarios) listan todo igual. El store solo aporta el
 * nombre del chip, si se dibuja el submenú, y los links.
 *
 * La palabra importa porque la promesa incumplida confundía de verdad: con una empresa elegida
 * parecía que la vista del cliente estaba recortada por ella, cuando el dato ni siquiera se cruza
 * —un proyecto de un cliente puede tener contratos de dos empleadoras a la vez—.
 *
 * El texto largo va en un modal y no inline: el sidebar es el lugar más caro de la pantalla y esto
 * se lee una vez. Sale de `helpContent` como el resto de la ayuda de la app.
 */
export const FichasHeader: React.FC = () => {
  const [abierto, setAbierto] = useState(false);
  const ayuda = getHelp('fichas');

  return (
    <>
      <div className="flex items-center gap-1.5 px-2 pb-2">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fichas</span>
        <button type="button" onClick={() => setAbierto(true)} title="Qué son las fichas" aria-label="Qué son las fichas" className="text-gray-400 hover:text-blue-500 transition-colors">
          <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
        </button>
      </div>

      {/*
       * PORTAL A `document.body` — no es opcional acá, y el z-index solo no alcanza.
       *
       * `Modal` se renderiza en el lugar del árbol donde se lo monta, y este vive dentro del
       * `<aside>` del menú, que es `position: fixed`. Un elemento fijo **crea un contexto de
       * apilamiento propio**, así que todo lo de adentro queda encerrado ahí: por más que el modal
       * pida z-120, compite dentro del aside y no contra la página. Resultado: el contenido que se
       * pinta después (las tarjetas y sus íconos) le pasaba por encima.
       *
       * Con el portal el modal sale a `body` y compite en el contexto raíz. El `zIndex` se mantiene
       * en 120 para quedar sobre el drawer móvil (z-50) y sobre los modales de página (z-110).
       */}
      {abierto &&
        createPortal(
          <InfoModal isOpen onClose={() => setAbierto(false)} title={ayuda.title} size={ayuda.size} zIndex={120} actions={[{ label: 'Entendido', onClick: () => setAbierto(false), variant: 'primary' }]}>
            {ayuda.content}
          </InfoModal>,
          document.body,
        )}
    </>
  );
};
