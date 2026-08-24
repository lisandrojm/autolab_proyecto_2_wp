import { RefObject, useEffect } from "react";

/**
 * Al pasar por un campo, se prenden los que dependen de él y aquellos de los que depende.
 *
 * POR QUÉ NO ALCANZAN LAS CAJAS
 *
 * En Datos ARCA conviven dos formas de depender. Una se puede encajonar: el padre está justo arriba
 * del hijo, en la misma columna (`DepGroup`). La otra no. La obra social HABILITA seis campos
 * repartidos en dos columnas, y Modalidad Contrato manda sobre Fecha de Fin, que vive en la tercera
 * — Fecha de Fin pertenece a Vigencia, al lado de Fecha de Inicio, y moverla para poder encerrarla
 * rompería un orden que sí se lee bien. Encajonar la obra social terminaría siendo un marco
 * alrededor de casi todo el modal, que es lo mismo que no marcar nada.
 *
 * Así que la relación se muestra cuando se la busca, no todo el tiempo.
 *
 * CÓMO
 *
 * Cada campo declara `data-campo="modalidadContrato"` y, si depende de otros, `data-depende-de` con
 * la lista separada por espacios. Este hook escucha en el CONTENEDOR —delegación, un solo par de
 * listeners para los quince campos— y marca con `data-relacionado` a los parientes del que está
 * bajo el puntero o el foco. El CSS hace el resto (`index.css`, bloque «Datos ARCA»).
 *
 * Se marca por ATRIBUTO y no por estado de React a propósito: pasar el mouse por el formulario no
 * tiene por qué re-renderizar quince campos con sus pickers colgando.
 *
 * `focus` además de `hover` no es un extra: sin eso, quien navega con teclado no ve ninguna de estas
 * relaciones. Es la misma razón por la que el rail y el resaltado nunca son el único indicador —lo
 * que de verdad las comunica es la línea de ayuda de cada campo, que va en texto.
 */

/** El atributo que prende el resaltado. Lo lee `index.css`. */
const MARCA = "data-relacionado";

export function useResaltadoDependencias(ref: RefObject<HTMLElement>): void {
  useEffect(() => {
    const cont = ref.current;
    if (!cont) return;

    const apagar = () => {
      for (const el of cont.querySelectorAll(`[${MARCA}]`)) el.removeAttribute(MARCA);
    };

    const prender = (destino: EventTarget | null) => {
      apagar();
      const origen = destino instanceof Element ? destino.closest("[data-campo]") : null;
      if (!origen) return;

      const nombre = origen.getAttribute("data-campo");
      if (!nombre) return;

      // Los HIJOS: los que declaran a éste entre sus orígenes. `~=` matchea una palabra de la lista,
      // así que `data-depende-de="obraSocial sucursal"` responde a los dos.
      for (const hijo of cont.querySelectorAll(`[data-depende-de~="${CSS.escape(nombre)}"]`)) hijo.setAttribute(MARCA, "");

      // Y los PADRES: de quién depende éste. Sin esto, pararse sobre Fecha de Fin no mostraría que
      // quien la gobierna es Modalidad Contrato, que es justamente la pregunta que uno se hace ahí.
      for (const padre of (origen.getAttribute("data-depende-de") || "").split(/\s+/).filter(Boolean)) {
        const el = cont.querySelector(`[data-campo="${CSS.escape(padre)}"]`);
        if (el) el.setAttribute(MARCA, "");
      }
    };

    const alEntrar = (e: Event) => prender(e.target);
    // `mouseleave` en el contenedor y no `mouseout` por campo: salir de un campo para entrar en el de
    // al lado dispararía apagar-prender y haría titilar el resaltado.
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
