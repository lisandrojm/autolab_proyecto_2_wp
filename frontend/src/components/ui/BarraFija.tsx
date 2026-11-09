import type React from 'react';
import { useAltoDeBarra } from './TablaConEncabezadoFijo';

/*
  EL BUSCADOR Y LOS FILTROS, FIJOS DEBAJO DEL ENCABEZADO DE LA PANTALLA (09/11/2026, pedido del usuario
  para todas las pestañas de Contratos).

  La barra se pega con `sticky` donde termina el encabezado de `PageLayout` (`--wp-sticky-top-pagina`).
  La tabla de abajo tiene que pegar su encabezado DEBAJO de la barra, no detrás: la raíz de la pestaña
  redefine `--wp-sticky-top` —el que lee `TablaConEncabezadoFijo`— sumándole lo que mide la barra. Por
  eso la barra no puede leer `--wp-sticky-top` (dentro de la raíz ya es el corrido) y lee la copia
  `-pagina`, que publica `PageLayout` con el mismo valor.

      const barra = useBarraFija();
      <div style={barra.raiz}>
        <div ref={barra.ref} className={CLASE_BARRA_FIJA}>…buscador y filtros…</div>
        <TablaConEncabezadoFijo …>…</TablaConEncabezadoFijo>
      </div>

  La barra sólo se pega mientras su contenedor (la raíz) esté a la vista: por eso tiene que ser hija
  directa de la raíz que envuelve también a la tabla.
*/

/** Fondo opaco del color de la página: las filas pasan por debajo sin verse. */
export const CLASE_BARRA_FIJA = 'sticky top-[var(--wp-sticky-top-pagina,64px)] z-20 bg-gray-100 dark:bg-gray-900 py-2';

/**
 * Para lo que está ENCIMA de la barra dentro de la misma raíz (p. ej. la cola de envío en Para Firmar):
 * mientras se recorre, la barra todavía no llegó a pegarse, así que sus tablas se pegan directo debajo
 * del encabezado de la página y no dejan el hueco de la barra.
 */
export const ENCIMA_DE_LA_BARRA = { '--wp-sticky-top': 'var(--wp-sticky-top-pagina, 64px)' } as React.CSSProperties;

export function useBarraFija(): { ref: (el: HTMLElement | null) => void; raiz: React.CSSProperties } {
  const [ref, alto] = useAltoDeBarra();
  return { ref, raiz: { '--wp-sticky-top': `calc(var(--wp-sticky-top-pagina, 64px) + ${alto}px)` } as React.CSSProperties };
}
