import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDownWideShort, faCheck } from "@fortawesome/free-solid-svg-icons";

/*
  EL BOTÓN «ORDENAR» AL LADO DE LOS FILTROS (31/10/2026). Para listados que se ordenan con criterios
  armados (no por una columna): un botón con el criterio elegido y un menú con las opciones. La
  primera opción es la de siempre (o la que diga `porDefecto`); con otra elegida, el botón se pinta
  como el de filtros activos. Un `valor` que no es ninguna opción (la tabla se ordenó por otra columna
  desde su encabezado) se muestra como «Ordenado por columna».
  Quién ordena lo decide la pantalla (en Solicitudes, el server: la tabla está paginada allá).
*/

export interface OpcionOrden<T extends string> {
  valor: T;
  texto: string;
}

export function MenuOrdenar<T extends string>({ valor, opciones, onChange, porDefecto }: { valor: T | null; opciones: OpcionOrden<T>[]; onChange: (v: T) => void; porDefecto?: T }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const elegida = opciones.find((o) => o.valor === valor);
  const cambiado = valor !== (porDefecto ?? opciones[0]?.valor);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const conEscape = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", conEscape);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      document.removeEventListener("keydown", conEscape);
    };
  }, [abierto]);

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        title={`Ordenar: ${elegida?.texto || "por columna"}`}
        className={`inline-flex items-center gap-2 px-3 py-2 border rounded text-sm transition-all duration-200 whitespace-nowrap ${
          cambiado
            ? "bg-primary-50 dark:bg-primary-900/20 border-primary-500 dark:border-primary-600 text-primary-700 dark:text-primary-300"
            : "border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
        }`}
      >
        <FontAwesomeIcon icon={faArrowDownWideShort} className="h-4 w-4" />
        <span className="hidden sm:inline max-w-[220px] truncate">{elegida?.texto || "Ordenado por columna"}</span>
      </button>
      {abierto && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Ordenar</p>
          {opciones.map((o) => (
            <button
              key={o.valor}
              type="button"
              role="menuitemradio"
              aria-checked={o.valor === valor}
              onClick={() => {
                onChange(o.valor);
                setAbierto(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${o.valor === valor ? "font-semibold text-primary-700 dark:text-primary-300" : "text-gray-700 dark:text-gray-200"}`}
            >
              <FontAwesomeIcon icon={faCheck} className={`h-3 w-3 shrink-0 ${o.valor === valor ? "" : "invisible"}`} />
              {o.texto}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
