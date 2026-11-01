import { useLayoutEffect, useRef } from "react";

/*
  CUÁNTO MIDE LA COLUMNA DE ACCIONES (01/11/2026), para pegar otra columna fija justo a su izquierda
  (`sticky right-[var(--ancho-acciones)]`). El ancho depende de los botones de cada fila, así que se
  mide en vez de fijarlo: se observa el encabezado `th.col-acciones` de la tabla y su ancho queda en la
  variable --ancho-acciones del elemento que lleva el ref (y la heredan todas las celdas de adentro).
*/
export function useAnchoAcciones<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const raiz = ref.current;
    if (!raiz || typeof ResizeObserver === "undefined") return;
    const encabezados = () => Array.from(raiz.querySelectorAll<HTMLElement>("th.col-acciones"));
    const poner = () => {
      const ancho = Math.max(0, ...encabezados().map((th) => th.getBoundingClientRect().width));
      if (ancho > 0) raiz.style.setProperty("--ancho-acciones", `${ancho}px`);
    };
    poner();
    const observador = new ResizeObserver(poner);
    encabezados().forEach((th) => observador.observe(th));
    return () => observador.disconnect();
  });
  return ref;
}
