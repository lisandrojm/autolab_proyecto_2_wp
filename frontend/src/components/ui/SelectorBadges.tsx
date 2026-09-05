import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faSearch, faTimes, faXmark } from '@fortawesome/free-solid-svg-icons';
import { Modal } from './Modal';
import { fuzzyMatch } from '../../utils/searchHelpers';

/**
 * ELEGIR VARIOS DE UNA LISTA LARGA: badges arriba, buscador en una ventana aparte.
 *
 * Es el gesto de «Rol/es Empresa» en la ficha de usuario, que hasta acá vivía escrito a mano dentro
 * de `UserFormModal` —una vez para roles, otra para sindicatos— y ahora también lo necesitan los
 * Tipos de Contrato del ABM de Estados. Una tercera copia inline era la garantía de que las tres
 * terminaran comportándose distinto.
 *
 * POR QUÉ UNA VENTANA Y NO UNA LISTA EN EL FORMULARIO
 *
 * La lista tiene decenas o cientos de opciones. Metida en el formulario se lleva 300px de alto para
 * mostrar cinco filas y obliga a scrollear dentro de un scroll. Afuera, la ventana usa la pantalla
 * entera para buscar, y en el formulario queda solo lo elegido — que es lo único que importa
 * después de elegir.
 *
 * LO ELEGIDO VA ARRIBA Y AFUERA DEL BUSCADOR. Badges adentro de un input lo hacen crecer y se leen
 * como texto tipeado; afuera se leen como lo que son, la selección actual.
 */

export interface OpcionSelector {
  id: string;
  nombre: string;
  /**
   * Motivo por el que NO se puede elegir. Vacío/ausente = se puede.
   *
   * Es texto y no un booleano a propósito: una opción bloqueada sin explicación deja a la persona
   * probando clicks contra algo que no responde. Acá el motivo se muestra en la fila y en el tooltip.
   */
  bloqueadoPor?: string;
}

interface Props {
  /** Nombre del bloque en el formulario. */
  etiqueta: string;
  items: OpcionSelector[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Título de la ventana. Por defecto, la etiqueta. */
  tituloModal?: string;
  /** Qué se está eligiendo, en una línea. Va bajo el título de la ventana. */
  descripcion?: string;
  placeholder?: string;
  /** Ayuda bajo la etiqueta, en el formulario. */
  ayuda?: React.ReactNode;
  /** Qué decir cuando no hay nada elegido. */
  textoVacio?: string;
  /** Ofrecer «Seleccionar todos» en la ventana. Solo tiene sentido en listas cortas. */
  permitirTodos?: boolean;
  /** Por encima del modal que lo contiene. */
  zIndex?: number;
  /** Acciones extra al lado de la etiqueta (ⓘ, contadores). */
  children?: React.ReactNode;
}

const Badge: React.FC<{ texto: string; onQuitar: () => void }> = ({ texto, onQuitar }) => (
  <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
    {texto}
    <button type="button" onClick={onQuitar} title={`Quitar ${texto}`} className="rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/60 p-0.5">
      <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
    </button>
  </span>
);

export const SelectorBadges: React.FC<Props> = ({ etiqueta, items, value, onChange, tituloModal, descripcion, placeholder = 'Buscar…', ayuda, textoVacio, permitirTodos, zIndex = 90, children }) => {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const elegidos = value.map((id) => items.find((i) => i.id === id)).filter(Boolean) as OpcionSelector[];
  const filtrados = items.filter((i) => fuzzyMatch(i.nombre, busqueda));
  const seleccionables = items.filter((i) => !i.bloqueadoPor);

  const abrir = () => {
    setBusqueda('');
    setAbierto(true);
  };
  const alternar = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 ml-1">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{etiqueta}</span>
          {elegidos.length > 0 && <span className="text-[11px] normal-case tracking-normal text-gray-500 dark:text-gray-400">({elegidos.length} de {seleccionables.length})</span>}
          {children}
          {/* El [+] solo con algo elegido: sin nada, abajo está el botón ancho y esto sería un
              segundo camino a lo mismo. */}
          {elegidos.length > 0 && (
            <button
              type="button"
              onClick={abrir}
              aria-label={`Agregar a ${etiqueta}`}
              className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0"
            >
              <FontAwesomeIcon icon={faPlus} className="h-2.5 w-2.5" />
            </button>
          )}
        </div>

        {ayuda && <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">{ayuda}</p>}

        {elegidos.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {elegidos.map((o) => (
              <Badge key={o.id} texto={o.nombre} onQuitar={() => alternar(o.id)} />
            ))}
          </div>
        ) : (
          /* Sin nada elegido, un botón ancho: es la invitación a abrir la ventana, y ocupa una fila
             en vez de las cinco que ocupaba la lista completa. */
          <button
            type="button"
            onClick={abrir}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <FontAwesomeIcon icon={faSearch} className="h-3.5 w-3.5" />
            {textoVacio || `Elegir ${etiqueta.toLowerCase()}…`}
          </button>
        )}
      </div>

      {abierto && (
        <Modal
          isOpen
          onClose={() => setAbierto(false)}
          title={tituloModal || etiqueta}
          subtitle={`${value.length} seleccionado(s)${descripcion ? ` · ${descripcion}` : ''}`}
          size="lg"
          zIndex={zIndex}
          footer={
            <>
              {permitirTodos && (
                <button type="button" onClick={() => onChange(seleccionables.map((i) => i.id))} className="btn-secondary" disabled={value.length === seleccionables.length}>
                  Seleccionar todos
                </button>
              )}
              <button type="button" onClick={() => onChange([])} className="btn-secondary" disabled={value.length === 0}>
                Limpiar
              </button>
              <button type="button" onClick={() => setAbierto(false)} className="btn-primary">
                Listo
              </button>
            </>
          }
        >
          {/* Alto fijo: con la altura atada al contenido, filtrar encogía la ventana y «Listo» se
              movía debajo del cursor. Lo que scrollea es la grilla, no el modal. */}
          <div className="h-[60vh] flex flex-col">
            {elegidos.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
                {elegidos.map((o) => (
                  <Badge key={o.id} texto={o.nombre} onQuitar={() => alternar(o.id)} />
                ))}
              </div>
            )}

            <div className="relative mb-3 shrink-0">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FontAwesomeIcon icon={faSearch} className="h-3.5 w-3.5 text-gray-400" />
              </div>
              <input type="text" autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={placeholder} className="input-field pl-9 pr-8" />
              {busqueda && (
                <button type="button" onClick={() => setBusqueda('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <FontAwesomeIcon icon={faTimes} className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 flex-1 overflow-y-auto content-start pr-1">
              {filtrados.map((o) => (
                <label
                  key={o.id}
                  title={o.bloqueadoPor || undefined}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                    o.bloqueadoPor
                      ? 'opacity-60 cursor-not-allowed bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700'
                      : value.includes(o.id)
                        ? 'cursor-pointer bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 ring-2 ring-blue-500/20'
                        : 'cursor-pointer bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <input type="checkbox" checked={value.includes(o.id)} disabled={!!o.bloqueadoPor} onChange={() => alternar(o.id)} className="rounded text-blue-500 focus:ring-blue-500 h-4 w-4 shrink-0 disabled:cursor-not-allowed" />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{o.nombre}</span>
                    {/* El motivo va EN la fila, no solo en el tooltip: una opción gris sin
                        explicación deja probando clicks contra algo que no responde. */}
                    {o.bloqueadoPor && <span className="block text-[10px] text-gray-500 dark:text-gray-400 truncate">{o.bloqueadoPor}</span>}
                  </span>
                </label>
              ))}
              {filtrados.length === 0 && <div className="col-span-full py-8 text-center text-xs text-gray-500 italic">No se encontró nada que coincida con «{busqueda}».</div>}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
