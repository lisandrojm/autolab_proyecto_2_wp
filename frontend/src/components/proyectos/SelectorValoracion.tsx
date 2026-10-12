import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faCheck } from "@fortawesome/free-solid-svg-icons";
import type { SimpleCatalogItem } from "../../api/simpleCatalog";
import { ChipValoracion } from "./ChipValoracion";
import { Modal } from "../ui/Modal";

/**
 * Desplegable de valoración con los TAGS DE COLOR, en lugar de un `<select>`.
 *
 * El nativo no deja pintar las opciones —Chrome en macOS ignora cualquier estilo del `<option>`—,
 * así que la lista decía «Oro / Plata» en gris y el color aparecía recién después de elegir. Acá
 * cada opción es el mismo tag que se ve en proyectos y al contratar.
 *
 * Las opciones van de MAYOR A MENOR nivel, en el mismo orden que la pantalla de Valoraciones
 * (`orden` 1 es el más alto: Oro arriba).
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

  const opciones = [...valoraciones].sort((a, b) => Number(a.orden ?? Number.MAX_SAFE_INTEGER) - Number(b.orden ?? Number.MAX_SAFE_INTEGER));
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

/**
 * VARIAS VALORACIONES A LA VEZ, EN UN MODAL. Una categoría puede valer para más de un nivel (Oro y
 * Plata): el botón muestra un chip por cada nivel elegido y abre una ventana que lo explica y deja
 * tildar los que correspondan. Es un modal y no un desplegable (pedido del 11/10/2026) porque la
 * decisión necesita la explicación al lado: la categoría se ofrece en todos los proyectos cuya
 * valoración sea cualquiera de las tildadas.
 *
 * Se guardan en el orden del catálogo (mayor a menor), así «la primera» es siempre la más alta.
 */
export const SelectorValoraciones: React.FC<{
  valoraciones: SimpleCatalogItem[];
  valores: string[];
  onChange: (ids: string[]) => void;
  etiqueta?: string;
  /** Por encima del modal que lo contenga (la ventana de Categorías usa 90). */
  zIndex?: number;
}> = ({ valoraciones, valores, onChange, etiqueta, zIndex = 120 }) => {
  const [abierto, setAbierto] = useState(false);
  const opciones = [...valoraciones].sort((a, b) => Number(a.orden ?? Number.MAX_SAFE_INTEGER) - Number(b.orden ?? Number.MAX_SAFE_INTEGER));
  const elegidas = opciones.filter((v) => valores.includes(v._id));
  const inactivas = valores.filter((id) => !valoraciones.some((v) => v._id === id));

  const alternar = (id: string) => {
    const nuevas = valores.includes(id) ? valores.filter((x) => x !== id) : [...valores, id];
    onChange([...opciones.filter((v) => nuevas.includes(v._id)).map((v) => v._id), ...nuevas.filter((x) => !valoraciones.some((v) => v._id === x))]);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        aria-label={etiqueta}
        title={etiqueta ? `${etiqueta}: elegir una o varias` : "Elegir una o varias valoraciones"}
        className="inline-flex flex-wrap items-center gap-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-1.5 py-1 hover:border-blue-400 dark:hover:border-blue-600"
      >
        {elegidas.map((v) => (
          <ChipValoracion key={v._id} nombre={String(v.name)} color={String(v.color || "")} />
        ))}
        {inactivas.length > 0 && <span className="px-1 text-xs text-gray-400">Inactiva</span>}
        {elegidas.length === 0 && inactivas.length === 0 && <span className="px-1 text-xs text-gray-500 dark:text-gray-400">Sin valorar</span>}
        <FontAwesomeIcon icon={faChevronDown} className="h-2.5 w-2.5 text-gray-400" />
      </button>
      {abierto && (
        <Modal isOpen onClose={() => setAbierto(false)} title="Valoración de la categoría" subtitle={etiqueta} size="sm" zIndex={zIndex}>
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 px-3 py-2.5 text-sm text-blue-900 dark:text-blue-200 space-y-1.5">
              <p>
                <strong>Podés tildar más de una.</strong> La categoría se va a ofrecer al contratar en todos los proyectos cuya valoración sea cualquiera de las tildadas.
              </p>
              <p className="text-xs text-blue-800/80 dark:text-blue-300/80">Sin ninguna tildada queda «sin valorar»: se ofrece en cualquier proyecto, sin filtro.</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
              {opciones.map((v) => (
                <label key={v._id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60">
                  <input type="checkbox" checked={valores.includes(v._id)} onChange={() => alternar(v._id)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <ChipValoracion nombre={String(v.name)} color={String(v.color || "")} />
                </label>
              ))}
              {opciones.length === 0 && <p className="px-3 py-3 text-xs text-gray-500">No hay valoraciones activas. Se cargan en Configuración → Valoraciones.</p>}
            </div>
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => onChange([])} disabled={valores.length === 0} className="text-sm font-semibold text-red-600 dark:text-red-400 hover:underline disabled:opacity-40 disabled:no-underline">
                Sin valorar
              </button>
              <button type="button" onClick={() => setAbierto(false)} className="btn-primary text-sm">
                Listo
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
