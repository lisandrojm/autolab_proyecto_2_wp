import { RefObject, useEffect } from "react";
import { ancestroQueRecorta, ATRIBUTO_BLOQUEADO } from "./ancestroQueRecorta";

/**
 * Congela el scroll del contenedor que envuelve a un desplegable, mientras está abierto.
 *
 * Los selectores de Empresa y de Cliente viven adentro del sidebar, que scrollea. Con la lista
 * abierta quedaban DOS scrolls encimados: la rueda del mouse movía uno o el otro según dónde
 * estuviera el puntero, y como el panel está posicionado contra el chip, scrollear el sidebar se
 * llevaba la lista entera para arriba mientras el buscador seguía en su lugar. Se veía como si la
 * lista se hubiera despegado.
 *
 * Mientras el desplegable está abierto, entonces, el único scroll que existe es el de la lista.
 *
 * Se busca el contenedor en vez de recibirlo por parámetro para que el selector no tenga que saber
 * dónde está montado: hoy es el sidebar, y en el drawer del celular es otro elemento. Es el mismo
 * que usa `useAltoDisponible` para saber hasta dónde puede crecer el panel, y tiene que serlo: si
 * uno midiera contra un borde y el otro congelara otro elemento, volvería a haber un scroll suelto.
 *
 * Si ese contenedor no scrolleaba —recorta pero su contenido entra— congelarlo no cambia nada y no
 * hay nada que compensar. No se distingue el caso a propósito: preguntar "¿scrollea?" abre la puerta
 * a que los dos hooks elijan elementos distintos.
 */

export function useScrollAncestroBloqueado(ref: RefObject<HTMLElement>, activo: boolean): void {
  useEffect(() => {
    if (!activo) return;
    const cont = ancestroQueRecorta(ref.current);
    if (!cont) return;

    /*
     * Sacar el scroll ensancha el contenido por el ancho de la barra, y todo el sidebar se corre unos
     * píxeles justo cuando se abre la lista. Se compensa con padding del mismo ancho: en Windows son
     * ~15px y se nota; en macOS la barra flota, el ancho da 0 y no se agrega nada.
     */
    const barra = cont.offsetWidth - cont.clientWidth;
    const overflowPrevio = cont.style.overflowY;
    const paddingPrevio = cont.style.paddingRight;
    const paddingBase = parseFloat(getComputedStyle(cont).paddingRight) || 0;

    cont.style.overflowY = "hidden";
    if (barra > 0) cont.style.paddingRight = `${paddingBase + barra}px`;
    // Para que `ancestroQueRecorta` lo siga reconociendo como el contenedor intervenido: sin esto, medir de
    // nuevo con el desplegable abierto daría un alto contra la ventana en vez de contra el sidebar.
    cont.setAttribute(ATRIBUTO_BLOQUEADO, "");

    return () => {
      // Se restituye lo que había INLINE, no lo calculado: si no había nada, la clase de Tailwind
      // vuelve a mandar. Escribir el valor calculado dejaría el padding clavado en píxeles.
      cont.style.overflowY = overflowPrevio;
      cont.style.paddingRight = paddingPrevio;
      cont.removeAttribute(ATRIBUTO_BLOQUEADO);
    };
  }, [activo, ref]);
}
