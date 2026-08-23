import { RefObject, useEffect, useState } from "react";
import { ancestroQueRecorta } from "./ancestroQueRecorta";

/**
 * Cuánto alto le queda a un desplegable entre donde arranca y el borde de abajo de lo que lo
 * contiene.
 *
 * Los selectores de Empresa y de Cliente viven arriba del sidebar y se abren hacia abajo, con toda
 * la pantalla libre por delante. Con un tope fijo desperdiciaban esa pantalla: mostraban tres
 * clientes y a scrollear, en un monitor donde entraban quince.
 *
 * El límite es el menor entre el borde de la VENTANA y el del contenedor con scroll que lo envuelve
 * —el sidebar—, porque ese contenedor recorta (ver `ancestroQueRecorta`). Medir solo contra la
 * ventana daba un panel más alto que el sidebar, y las últimas filas quedaban cortadas sin forma de
 * llegar a ellas: mientras el desplegable está abierto el sidebar no scrollea, justamente para que
 * no haya dos scrolls encimados.
 *
 * Se mide en cada apertura y no una sola vez, porque la posición cambia: la ventana se redimensiona,
 * y con una ficha de empresa abierta el chip de Cliente baja varios renglones.
 */

/** Aire entre el final del desplegable y el borde de abajo, para que no quede pegado. */
const MARGEN = 16;

export function useAltoDisponible(ref: RefObject<HTMLElement>, abierto: boolean, minimo = 280): number | undefined {
  const [alto, setAlto] = useState<number>();

  useEffect(() => {
    if (!abierto) return;

    const medir = () => {
      const el = ref.current;
      if (!el) return;
      const contenedor = ancestroQueRecorta(el);
      const borde = Math.min(window.innerHeight, contenedor ? contenedor.getBoundingClientRect().bottom : Infinity);
      const espacio = borde - el.getBoundingClientRect().bottom - MARGEN;
      /*
       * El piso solo aplica cuando NADIE recorta: si el chip quedara cerca del borde de la ventana,
       * un desplegable de 40px es peor que uno que se sale un poco y se alcanza scrolleando la
       * página. Adentro de un contenedor que recorta es al revés — lo que se pase no existe— así que
       * ahí manda el espacio real aunque sea poco.
       */
      setAlto(contenedor ? espacio : Math.max(minimo, espacio));
    };

    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [abierto, ref, minimo]);

  return alto;
}
