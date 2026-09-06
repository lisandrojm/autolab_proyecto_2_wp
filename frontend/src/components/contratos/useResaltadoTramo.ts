import { RefObject, useEffect } from "react";

/**
 * Al pasar por un campo, se prende SU TRAMO en «Cómo queda en el archivo».
 *
 * QUÉ CONTESTA
 *
 * Cada campo lleva un badge con su posición en el registro de 130 —«58–72»—, y más abajo está la
 * tabla con la línea que se va a generar. Eran dos listas que había que cruzar a ojo: leer «58–72»
 * arriba, scrollear, y buscar ese renglón entre catorce. El badge decía el número pero no llevaba a
 * ningún lado.
 *
 * CÓMO
 *
 * Mismo mecanismo que `useResaltadoDependencias`: delegación de eventos en un contenedor y marcado
 * por ATRIBUTO, sin estado de React. Pasar el mouse por el formulario no tiene por qué re-renderizar
 * los campos con sus pickers colgando.
 *
 *   [data-pos="74-78"]     lo pone el campo, derivado de su badge de posición
 *   [data-tramo="74-78"]   lo pone la fila de la tabla de la vista previa
 *
 * SI LA VISTA PREVIA ESTÁ PLEGADA NO PASA NADA, y no hace falta preguntarlo: plegada, sus filas no
 * existen en el DOM, así que no hay a quién marcar. Abrirla sola sería peor que no hacer nada — el
 * bloque mide varias pantallas y se desplegaría por pasar el mouse al lado.
 *
 * El contenedor tiene que envolver AL FORMULARIO Y A LA VISTA PREVIA, que son hermanos: por eso el
 * ref va en el contenedor de todo el detalle y no adentro del formulario.
 *
 * Es DECORATIVO y no puede ser el único indicador: la posición ya está dicha en texto en el badge de
 * cada campo y en la columna «Pos.» de la tabla. Esto solo evita el cruce a ojo.
 */

/** El atributo que prende el resaltado en la fila. Lo lee `index.css`. */
const MARCA = "data-tramo-activo";

/**
 * El badge del campo usa raya (74–78) y la tabla usa guion (74-78).
 *
 * La raya es tipografía —es lo correcto para un rango en prosa— y el guion es lo que arma la clave.
 * Se normaliza acá, en un solo lugar, en vez de cambiar uno de los dos: tocar el badge empeoraría el
 * texto, y atar la clave de la tabla a un detalle tipográfico sería peor todavía.
 */
const clave = (s: string): string => s.replace(/–|—/g, "-").replace(/\s/g, "");

export function useResaltadoTramo(ref: RefObject<HTMLElement>): void {
  useEffect(() => {
    const cont = ref.current;
    if (!cont) return;

    const apagar = () => {
      for (const el of cont.querySelectorAll(`[${MARCA}]`)) el.removeAttribute(MARCA);
    };

    const prender = (destino: EventTarget | null) => {
      apagar();
      const origen = destino instanceof Element ? destino.closest("[data-pos]") : null;
      const pos = origen?.getAttribute("data-pos");
      if (!pos) return;
      for (const fila of cont.querySelectorAll(`[data-tramo="${CSS.escape(clave(pos))}"]`)) fila.setAttribute(MARCA, "");
    };

    const alEntrar = (e: Event) => prender(e.target);
    const alSalir = () => apagar();

    cont.addEventListener("mouseover", alEntrar);
    cont.addEventListener("mouseleave", alSalir);
    cont.addEventListener("focusin", alEntrar);
    cont.addEventListener("focusout", alSalir);
    return () => {
      cont.removeEventListener("mouseover", alEntrar);
      cont.removeEventListener("mouseleave", alSalir);
      cont.removeEventListener("focusin", alEntrar);
      cont.removeEventListener("focusout", alSalir);
      apagar();
    };
  }, [ref]);
}
