/**
 * El contenedor más cercano hacia arriba que RECORTA lo que se salga de él. `null` si no hay ninguno.
 *
 * Es la pieza que los desplegables de Empresa y Cliente necesitan para no abrirse a ciegas. Los dos
 * viven adentro del sidebar, y el sidebar recorta: un contenedor con `overflow-y: auto` recorta las
 * dos direcciones, porque la especificación fuerza el otro eje a `auto` en cuanto uno deja de ser
 * `visible`. Lo que se pase de ese borde no se ve.
 *
 * Se pregunta por RECORTAR y no por SCROLLEAR, que era lo primero que parecía alcanzar, por el
 * contenedor de escritorio: no tiene `flex-1`, así que con poco contenido mide lo que mide su
 * contenido y su borde de abajo queda bastante más arriba que el de la ventana. No scrollea —no hay
 * nada que scrollear— pero recorta igual, y un panel medido contra la ventana perdía sus últimas
 * filas sin ningún scroll con el que llegar a ellas.
 *
 * Lo usan `useAltoDisponible`, para saber hasta dónde puede crecer el panel, y
 * `useScrollAncestroBloqueado`, para congelarlo mientras el panel está abierto.
 */

/**
 * Marca que deja `useScrollAncestroBloqueado` mientras tiene un contenedor congelado.
 *
 * NO sobra: congelarlo le pone `overflow-y: hidden` por encima de su clase, y aunque eso sigue
 * recortando, la marca deja explícito cuál es el contenedor intervenido y evita depender del orden
 * en que corran los dos hooks.
 */
export const ATRIBUTO_BLOQUEADO = "data-scroll-bloqueado";

/** Un valor de `overflow` que no sea `visible` recorta. `clip` incluido. */
const recorta = (overflow: string): boolean => overflow !== "visible";

export function ancestroQueRecorta(desde: HTMLElement | null): HTMLElement | null {
  let el = desde?.parentElement ?? null;
  while (el && el !== document.body) {
    if (el.hasAttribute(ATRIBUTO_BLOQUEADO)) return el;
    if (recorta(getComputedStyle(el).overflowY)) return el;
    el = el.parentElement;
  }
  return null;
}
