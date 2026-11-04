import { useCallback, useEffect, useRef, useState } from "react";

/*
  SCROLL INFINITO DEL LADO DEL CLIENTE (04/11/2026).

  La lista ya llegó entera del server; lo que pesa es DIBUJARLA: cada tarjeta de Renovaciones trae
  datos, botones y fechas, y con cien juntas el celular se traba al entrar. Se dibujan `tamano` y,
  cuando el centinela (un div vacío al final) asoma en pantalla, `tamano` más.

  `reinicio` es lo que cambia la lista —búsqueda, filtros, la lista nueva—: cuando cambia, se vuelve a
  los primeros, para no quedar con 200 dibujados después de buscar un nombre.

  El centinela se mira contra la PÁGINA (root null): en el panel scrollea la página, no una caja.
*/
export function useCargaProgresiva<T>(lista: T[], reinicio: unknown, tamano = 20) {
  const [cuantos, setCuantos] = useState(tamano);
  const observador = useRef<IntersectionObserver | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setCuantos(tamano), [reinicio, tamano]);

  const hayMas = cuantos < lista.length;

  // Ref con callback: el centinela aparece y desaparece según haya más o no.
  const centinela = useCallback(
    (nodo: HTMLElement | null) => {
      observador.current?.disconnect();
      if (!nodo) return;
      observador.current = new IntersectionObserver(
        (entradas) => {
          if (entradas.some((e) => e.isIntersecting)) setCuantos((n) => n + tamano);
        },
        // Un poco antes de llegar al final, así la tarjeta siguiente ya está cuando se la ve.
        { rootMargin: "400px 0px" },
      );
      observador.current.observe(nodo);
    },
    // Con `cuantos`: si después de sumar el centinela SIGUE a la vista, el observador nuevo lo avisa
    // al empezar a mirar y se suman otros; uno viejo no, porque sólo avisa cuando algo cambia.
    [tamano, cuantos],
  );

  useEffect(() => () => observador.current?.disconnect(), []);

  return { visibles: lista.slice(0, cuantos), hayMas, centinela };
}
