import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faCheck } from "@fortawesome/free-solid-svg-icons";
import type { SimpleCatalogItem } from "../../api/simpleCatalog";
import { ChipValoracion } from "./ChipValoracion";

/**
 * Desplegable de valoración con los TAGS DE COLOR, en lugar de un `<select>`.
 *
 * El nativo no deja pintar las opciones —Chrome en macOS ignora cualquier estilo del `<option>`—,
 * así que la lista decía «Oro / Plata» en gris y el color aparecía recién después de elegir. Acá
 * cada opción es el mismo tag que se ve en proyectos y al contratar.
 *
 * Las opciones van de MAYOR A MENOR nivel (por `orden`): es el orden en que se lee una jerarquía,
 * y el mismo en que se miran las categorías, de la más cara a la más barata.
 *
 * La lista se dibuja en un portal con posición fija: vive adentro de tablas con `overflow-x-auto` y
 * de modales, que la recortarían.
 */
export const SelectorValoracion: React.FC<{
  valoraciones: SimpleCatalogItem[];
  valor: string;
  onChange: (id: string) => void;
  /** Para el lector de pantalla y el tooltip: «Valoración de Operador de Cámaras en esta función». */
  etiqueta?: string;
}> = ({ valoraciones, valor, onChange, etiqueta }) => {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  const opciones = [...valoraciones].sort((a, b) => Number(b.orden ?? 0) - Number(a.orden ?? 0));
  const actual = valoraciones.find((v) => v._id === valor);

  useLayoutEffect(() => {
    if (!abierto || !boton.current) return;
    const r = boton.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, minWidth: r.width });
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: Event) => {
      if (e.target instanceof Node && (lista.current?.contains(e.target) || boton.current?.contains(e.target))) return;
      setAbierto(false);
    };
    const conTecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    // Al scrollear la tabla o el modal la lista quedaría flotando lejos del botón: se cierra.
    const alMover = (e: Event) => {
      if (e.target instanceof Node && lista.current?.contains(e.target)) return;
      setAbierto(false);
    };
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", conTecla);
    window.addEventListener("scroll", alMover, true);
    window.addEventListener("resize", alMover);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      document.removeEventListener("keydown", conTecla);
      window.removeEventListener("scroll", alMover, true);
      window.removeEventListener("resize", alMover);
    };
  }, [abierto]);

  const elegir = (id: string) => {
    onChange(id);
    setAbierto(false);
    boton.current?.focus();
  };

  const opcion = (id: string, contenido: React.ReactNode) => (
    <button
      key={id || "sin"}
      type="button"
      role="option"
      aria-selected={valor === id}
      onClick={() => elegir(id)}
      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700/60"
    >
      <span className="w-3 shrink-0 text-blue-600 dark:text-blue-400">{valor === id && <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />}</span>
      {contenido}
    </button>
  );

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={etiqueta}
        title={etiqueta}
        className="inline-flex items-center gap-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-1.5 py-1 hover:border-blue-400 dark:hover:border-blue-600"
      >
        {actual ? <ChipValoracion nombre={String(actual.name)} color={String(actual.color || "")} /> : valor ? <span className="px-1 text-xs text-gray-400">Inactiva</span> : <span className="px-1 text-xs text-gray-500 dark:text-gray-400">Sin valorar</span>}
        <FontAwesomeIcon icon={faChevronDown} className="h-2.5 w-2.5 text-gray-400" />
      </button>
      {abierto &&
        pos &&
        createPortal(
          <div
            ref={lista}
            role="listbox"
            style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.minWidth, zIndex: 200 }}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-1 shadow-xl"
          >
            {opciones.map((v) => opcion(v._id, <ChipValoracion nombre={String(v.name)} color={String(v.color || "")} />))}
            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
            {opcion("", <span className="text-xs text-gray-500 dark:text-gray-400">Sin valorar</span>)}
          </div>,
          document.body,
        )}
    </>
  );
};
