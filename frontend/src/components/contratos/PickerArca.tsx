import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faSpinner, faTriangleExclamation, faCheck } from '@fortawesome/free-solid-svg-icons';
import { Modal } from '../ui/Modal';

/**
 * Selector de un valor de ARCA. Uno solo, parametrizado, para los nueve campos editables.
 *
 * Toma la forma del formulario del organismo: cada campo abre una lista con búsqueda dinámica, se
 * elige y se vuelve. **Nada navega a otra pantalla.** El modal de Datos ARCA era un diagnóstico —
 * decía qué faltaba y mandaba a "Ir a Contratos ↗" a resolverlo—, así que cargar tres códigos
 * costaba cuatro pasos: abrir, irse, cargar, volver y reabrir.
 *
 * Lo que ARCA no tiene y acá sí son NIVELES: la modalidad de contrato no se tipea 143 veces, vive en
 * el tipo de contrato. Esa ventaja no se tira, pero tiene un costo que antes quedaba oculto —
 * editar desde la ficha de una persona toca a todas las que comparten ese tipo. Por eso el pie de
 * `alcance`: se edita sin irse, sabiendo a cuántos contratos afecta.
 */
export interface OpcionPicker {
  /** Código tal como va al archivo. Se muestra monoespaciado a la izquierda. */
  codigo: string;
  nombre: string;
  /**
   * Etiqueta a la derecha. En Tipo de Servicio es el grupo, y no es decorativa: hay nombres
   * repetidos entre grupos y sin esto son indistinguibles.
   */
  etiqueta?: string;
}

export const PickerArca: React.FC<{
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  /** Qué universo se está viendo y POR QUÉ está recortado. Es lo que evita la mitad de los rechazos. */
  subtitulo: string;
  opciones: OpcionPicker[];
  /** Código actualmente elegido, para marcarlo en la lista. */
  valor?: string;
  onElegir: (o: OpcionPicker) => void;
  /** Aviso de alcance: qué se toca además de este contrato al guardar. */
  alcance?: React.ReactNode;
  guardando?: boolean;
  /** Se muestra cuando no hay ninguna opción: explica qué cargar y dónde. */
  vacio?: React.ReactNode;
  zIndex?: number;
}> = ({ abierto, onCerrar, titulo, subtitulo, opciones, valor, onElegir, alcance, guardando, vacio, zIndex = 95 }) => {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (abierto) {
      setQ('');
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [abierto]);

  // Se busca por código Y por nombre siempre: el operador a veces tiene el número del padrón y a
  // veces la descripción, y no sabe de antemano cuál de los dos va a matchear.
  const resultados = useMemo(() => {
    const term = q
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');
    if (!term) return opciones;
    return opciones.filter((o) =>
      `${o.codigo} ${o.nombre} ${o.etiqueta || ''}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .includes(term),
    );
  }, [opciones, q]);

  if (!abierto) return null;

  return (
    <Modal isOpen={abierto} onClose={onCerrar} title={titulo} subtitle={subtitulo} size="md" zIndex={zIndex}>
      <div className="space-y-3">
        <div className="relative">
          <FontAwesomeIcon icon={guardando ? faSpinner : faSearch} spin={guardando} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={guardando}
            placeholder="Buscar por código o por nombre…"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60"
          />
        </div>

        {opciones.length === 0 ? (
          <div className="rounded-lg border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 px-3 py-3 text-[12px] text-amber-800 dark:text-amber-300">{vacio || 'No hay opciones para elegir.'}</div>
        ) : (
          <>
            <div className="max-h-[46vh] overflow-y-auto -mx-1 px-1 space-y-0.5">
              {resultados.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic px-2 py-4">Sin resultados para “{q}”.</p>
              ) : (
                resultados.map((o) => {
                  const elegido = !!valor && o.codigo === valor;
                  return (
                    <button
                      key={`${o.codigo}-${o.nombre}`}
                      type="button"
                      disabled={guardando}
                      onClick={() => onElegir(o)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg flex items-baseline gap-3 transition-colors disabled:opacity-50 ${elegido ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                    >
                      <code className="font-mono text-[12.5px] text-blue-600 dark:text-blue-400 shrink-0 min-w-[3.2rem]">{o.codigo}</code>
                      <span className="text-[13px] text-gray-800 dark:text-gray-100 min-w-0 flex-1">{o.nombre}</span>
                      {o.etiqueta && <span className="shrink-0 text-[10.5px] text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5">{o.etiqueta}</span>}
                      {elegido && <FontAwesomeIcon icon={faCheck} className="h-3 w-3 text-blue-500 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
            {resultados.length > 0 && (
              <p className="text-[11px] text-gray-400 dark:text-gray-500 px-1">
                {resultados.length === opciones.length ? `${opciones.length} opciones` : `${resultados.length} de ${opciones.length}`}
              </p>
            )}
          </>
        )}

        {/* El alcance va abajo y en ámbar: es lo que el operador no sabe cuando edita desde acá. */}
        {alcance && (
          <div className="rounded-lg border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 px-3 py-2.5 text-[11.5px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{alcance}</span>
          </div>
        )}
      </div>
    </Modal>
  );
};
