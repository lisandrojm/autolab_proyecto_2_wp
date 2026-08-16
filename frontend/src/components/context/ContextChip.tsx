import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faChevronDown, faChevronRight, faXmark } from '@fortawesome/free-solid-svg-icons';

/**
 * Disparador de un selector de contexto (Cliente, Empresa).
 *
 * Los dos contextos usan ESTE componente y no una copia parecida: Cliente y Empresa son ejes
 * ORTOGONALES —un contrato tiene un cliente (para quién es el proyecto) y una empleadora (quién lo
 * firma y lo da de alta en ARCA)—, y si se ven distintos el usuario los lee como una jerarquía:
 * "elijo TELECOM y después la empresa de TELECOM". Compartir el componente hace que queden en
 * paralelo por construcción, no por disciplina.
 *
 * Por eso la etiqueta del eje ("Cliente" / "Empresa") va SIEMPRE visible, también cuando hay uno
 * elegido: es lo que distingue dos filas que, si no, serían dos nombres propios sin contexto.
 */
interface Props {
  /** Nombre del eje: "Cliente" o "Empresa". Se muestra siempre. */
  eje: string;
  icono: IconDefinition;
  /** Lo elegido; vacío = todavía no se eligió. */
  valor?: string;
  /** Segunda línea del elegido (CUIT, razón social). Opcional. */
  detalle?: string;
  /** Texto cuando no hay nada elegido. Va explícito ("Elegir empresa"), no un "Seleccionar…" genérico. */
  placeholder: string;
  abierto: boolean;
  onToggle: () => void;
  onLimpiar: (e: React.MouseEvent) => void;
}

export const ContextChip: React.FC<Props> = ({ eje, icono, valor, detalle, placeholder, abierto, onToggle, onLimpiar }) => (
  <button
    onClick={onToggle}
    title={valor ? `${eje}: ${valor}${detalle ? ` · ${detalle}` : ''}` : placeholder}
    className={`w-full flex items-center gap-2 px-2.5 py-2 text-sm rounded border transition-colors ${
      valor ? 'bg-primary-50 dark:bg-blue-900/30 border-primary-200 dark:border-blue-800' : 'bg-white dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-blue-900/30'
    }`}
  >
    <FontAwesomeIcon icon={icono} className={`h-3.5 w-3.5 shrink-0 ${valor ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'}`} />

    {/* Ancho fijo para que las dos filas alineen: es lo que las hace leer como ejes paralelos. */}
    <span className="w-[3.75rem] shrink-0 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{eje}</span>

    <span className="min-w-0 flex-1 text-left">
      {valor ? (
        <>
          <span className="block truncate font-medium text-gray-900 dark:text-white">{valor}</span>
          {detalle && <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">{detalle}</span>}
        </>
      ) : (
        <span className="block truncate text-gray-500 dark:text-gray-400">{placeholder}</span>
      )}
    </span>

    {valor && (
      <span onClick={onLimpiar} role="button" tabIndex={-1} title={`Salir del contexto de ${eje.toLowerCase()}`} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 shrink-0 cursor-pointer">
        <FontAwesomeIcon icon={faXmark} className="h-3 w-3 text-gray-500" />
      </span>
    )}
    <FontAwesomeIcon icon={abierto ? faChevronDown : faChevronRight} className="h-3 w-3 text-gray-400 shrink-0" />
  </button>
);
