import React, { Children, Fragment, isValidElement, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileExcel, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { exportarTablaAExcel } from '../../utils/exportarTablaExcel';
import { sweetAlert } from '../../utils/sweetAlert';

/*
  UNA TABLA CUYO ENCABEZADO QUEDA FIJO, CON EL SCROLL DE LA PÁGINA (30/10/2026).

  Se usa en lugar del `div.overflow-x-auto` que envolvía cada `<table>`; la tabla va adentro tal cual
  estaba (`<thead>` + `<tbody>`), sin tocar sus filas:

      <TablaConEncabezadoFijo className="rounded-xl border …" tabla="w-full text-sm">
        <thead>…</thead>
        <tbody>…</tbody>
      </TablaConEncabezadoFijo>

  POR QUÉ NO ES UN `position: sticky` EN EL `<thead>`. Un sticky se pega al contenedor con scroll más
  cercano, y el `overflow-x-auto` del scroll lateral convierte a la caja de la tabla en ese contenedor,
  que no scrollea en vertical: el encabezado no se pega a nada. Las soluciones anteriores tenían cada
  una su problema:
    · darle a la caja un alto con scroll propio (`max-h` + sticky adentro) deja DOS barras de scroll en
      la misma pantalla, y el usuario pidió que sólo scrollee la página;
    · correr el `<thead>` con un `translateY` desde el evento de scroll va un cuadro atrás del scroll
      (el scroll corre en el compositor, el JS después) y el encabezado tiembla.

  LO QUE HACE: dibuja el encabezado DOS veces.
    · Dentro de la tabla, invisible: es el que fija el ancho de cada columna y ocupa su lugar.
    · Arriba, en una caja `sticky` que sí se pega a la página (o al cuerpo del modal) y que lleva una
      copia de la tabla sólo con el encabezado, con los anchos de columna medidos de la tabla real y el
      mismo scroll lateral (sin barra). La tabla real sube lo que mide su encabezado, así la copia queda
      exactamente encima.
  Como la copia se renderiza desde el mismo JSX, los clicks para ordenar, la casilla de «marcar todas»
  y los títulos funcionan igual que en el original.

  DÓNDE SE PEGA. Si algún ancestro tiene scroll vertical (el cuerpo de un `Modal`), arriba de él; si no,
  debajo del encabezado de la pantalla (`--wp-sticky-top`, que publica `PageLayout`). Se puede forzar con
  `top`. OJO: un ancestro con `overflow-hidden` deja al encabezado sin pegar (también es un contenedor
  de scroll); para recortar los bordes redondeados de una tarjeta va `overflow-clip`, que no lo es.
  En desarrollo se avisa por consola.

  EXPORTAR A EXCEL (16/11/2026). Arriba a la derecha de cada tabla va el botón «Excel», que baja lo que
  la tabla tiene dibujado (`utils/exportarTablaExcel.ts`): se pidió que TODA tabla se pueda exportar, y
  ponerlo acá las cubre a todas, también a las que se agreguen. Una tabla que ya tiene su propio export
  (un CSV o un reporte hecho a medida) lo apaga con `sinExportar`. `exportar` le pone nombre al archivo;
  sin eso, sale del título del modal o de la pantalla.
*/

interface Medidas {
  /** Ancho de cada columna de la tabla real, en px. */
  columnas: number[];
  ancho: number;
  alto: number;
}

interface Props {
  children: React.ReactNode;
  /** Clases de la caja exterior: lo decorativo que llevaba el `div` que envolvía a la tabla (bordes, fondo), sin el `overflow-x-auto`. */
  className?: string;
  /** Clases de la `<table>`. */
  tabla?: string;
  /** A qué altura se pega. Por defecto se detecta: el borde de arriba de un contenedor con scroll (menos su padding), `--wp-sticky-top` en la página. */
  top?: string;
  tablaRef?: React.Ref<HTMLTableElement>;
  /** El nombre del archivo de Excel (sin extensión ni fecha). Por defecto, el título del modal o de la pantalla. */
  exportar?: string;
  /** Sin el botón «Excel»: la tabla ya tiene su propio export. */
  sinExportar?: boolean;
}

/** El botón «Excel» de arriba de la tabla. No se dibuja mientras la tabla no tiene filas. */
const BotonExcel: React.FC<{ tabla: React.RefObject<HTMLTableElement | null>; nombre?: string }> = ({ tabla, nombre }) => {
  const [bajando, setBajando] = useState(false);
  const [hayFilas, setHayFilas] = useState(false);
  // En cada render: las filas llegan después (la tabla se dibuja vacía mientras carga).
  useLayoutEffect(() => {
    const t = tabla.current;
    const filas = t ? Array.from(t.tBodies).reduce((n, b) => n + b.rows.length, 0) : 0;
    setHayFilas((antes) => (antes === filas > 0 ? antes : filas > 0));
  });
  if (!hayFilas) return null;
  const bajar = async () => {
    if (!tabla.current) return;
    setBajando(true);
    try {
      await exportarTablaAExcel(tabla.current, nombre);
    } catch (e: any) {
      sweetAlert.error('No se pudo exportar', e?.message || 'No se pudo armar el archivo de Excel.');
    } finally {
      setBajando(false);
    }
  };
  return (
    <div className="flex justify-end mb-1 print:hidden" data-no-exportar>
      <button type="button" onClick={bajar} disabled={bajando} title="Exportar esta tabla a Excel (lo que está en pantalla)" className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50">
        <FontAwesomeIcon icon={bajando ? faSpinner : faFileExcel} spin={bajando} />
        Excel
      </button>
    </div>
  );
};

/**
 * EL ALTO DE UNA BARRA PROPIA DE LA PÁGINA que también se pega debajo del header (la de «N tildadas» de
 * las pantallas de ARCA), para correr el encabezado de la tabla debajo de ella:
 *   const [barraRef, altoBarra] = useAltoDeBarra();
 *   <div ref={barraRef} className="sticky top-[var(--wp-sticky-top)] …">…</div>
 *   <TablaConEncabezadoFijo top={`calc(var(--wp-sticky-top, 64px) + ${altoBarra}px)`} …>
 * Da 0 mientras la barra no está.
 */
export function useAltoDeBarra(): [(el: HTMLElement | null) => void, number] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [alto, setAlto] = useState(0);
  useLayoutEffect(() => {
    if (!el) {
      setAlto(0);
      return;
    }
    const medir = () => setAlto(el.getBoundingClientRect().height);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [el]);
  return [setEl, alto];
}

/** Los hijos directos, abriendo los fragmentos: el `<thead>` puede venir dentro de un `<>…</>`. */
const aplanar = (nodos: React.ReactNode): React.ReactNode[] =>
  Children.toArray(nodos).flatMap((n) => (isValidElement(n) && n.type === Fragment ? aplanar((n.props as { children?: React.ReactNode }).children) : [n]));

const iguales = (a: Medidas | null, b: Medidas) =>
  !!a && a.ancho === b.ancho && a.alto === b.alto && a.columnas.length === b.columnas.length && a.columnas.every((w, i) => Math.abs(w - b.columnas[i]) < 0.01);

/**
 * Los anchos de columna a partir de los bordes de TODAS las celdas del encabezado (sirve con `colSpan`
 * y `rowSpan`: cada borde vertical distinto es el límite de una columna).
 */
const medirColumnas = (tabla: HTMLTableElement, thead: HTMLTableSectionElement): number[] => {
  const izquierda = tabla.getBoundingClientRect().left;
  const bordes: number[] = [];
  for (const fila of Array.from(thead.rows)) {
    for (const celda of Array.from(fila.cells)) {
      const r = celda.getBoundingClientRect();
      if (r.width <= 0) continue;
      bordes.push(r.left - izquierda, r.right - izquierda);
    }
  }
  bordes.sort((a, b) => a - b);
  // Dos celdas vecinas comparten el borde con diferencias de subpíxel: se toman como uno solo.
  const unicos: number[] = [];
  for (const x of bordes) if (!unicos.length || x - unicos[unicos.length - 1] > 0.5) unicos.push(x);
  return unicos.slice(1).map((x, i) => x - unicos[i]);
};

export const TablaConEncabezadoFijo: React.FC<Props> = ({ children, className = '', tabla = '', top, tablaRef, exportar, sinExportar }) => {
  const partes = aplanar(children);
  const encabezado = partes.find((p) => isValidElement(p) && p.type === 'thead') as React.ReactElement<React.HTMLAttributes<HTMLTableSectionElement>> | undefined;
  const resto = partes.filter((p) => p !== encabezado);

  const raizRef = useRef<HTMLDivElement>(null);
  const copiaRef = useRef<HTMLDivElement>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  const tablaRealRef = useRef<HTMLTableElement | null>(null);
  const [medidas, setMedidas] = useState<Medidas | null>(null);
  const [topDetectado, setTopDetectado] = useState('var(--wp-sticky-top, 64px)');

  const ponerTabla = useCallback(
    (el: HTMLTableElement | null) => {
      tablaRealRef.current = el;
      if (typeof tablaRef === 'function') tablaRef(el);
      else if (tablaRef) (tablaRef as React.MutableRefObject<HTMLTableElement | null>).current = el;
    },
    [tablaRef],
  );

  const medir = useCallback(() => {
    const t = tablaRealRef.current;
    const thead = t?.tHead;
    if (!t || !thead) return;
    const nuevas = { columnas: medirColumnas(t, thead), ancho: t.getBoundingClientRect().width, alto: thead.getBoundingClientRect().height };
    setMedidas((previas) => (iguales(previas, nuevas) ? previas : nuevas));
  }, []);

  // En cada render: las columnas se reparten distinto cuando cambia el contenido, aunque la tabla mida lo mismo.
  useLayoutEffect(() => {
    medir();
  });

  // Y cuando cambia el tamaño sin un render (ventana, sidebar, fuentes que terminan de cargar).
  const cantidadColumnas = medidas?.columnas.length ?? 0;
  useLayoutEffect(() => {
    const t = tablaRealRef.current;
    if (!t || typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(medir);
    observador.observe(t);
    for (const fila of Array.from(t.tHead?.rows ?? [])) for (const celda of Array.from(fila.cells)) observador.observe(celda);
    return () => observador.disconnect();
  }, [medir, cantidadColumnas]);

  // Dónde pegarse: ver el comentario de arriba.
  useLayoutEffect(() => {
    if (top) return;
    let el = raizRef.current?.parentElement ?? null;
    while (el && el !== document.body) {
      const { overflowY, overflowX } = getComputedStyle(el);
      const scrollea = overflowY === 'auto' || overflowY === 'scroll';
      // `overflow-x: hidden` solo hace que `overflow-y` compute `auto` sin que la caja scrollee de verdad.
      if (scrollea && (overflowX !== 'hidden' || el.scrollHeight > el.clientHeight + 1)) {
        // El sticky se pega debajo del padding del contenedor (el `pt-4` del cuerpo del Modal), y en ese
        // hueco se veían pasar las filas: se sube lo que mide el padding para pegarlo al borde (01/11/2026).
        const padding = parseFloat(getComputedStyle(el).paddingTop) || 0;
        setTopDetectado(`${-padding}px`);
        return;
      }
      if (import.meta.env.DEV && (overflowY === 'hidden' || (scrollea && overflowX === 'hidden'))) {
        console.warn('TablaConEncabezadoFijo: un contenedor con overflow hidden deja el encabezado sin pegar; usá overflow-clip.', el);
      }
      el = el.parentElement;
    }
    setTopDetectado('var(--wp-sticky-top, 64px)');
  }, [top]);

  // El scroll lateral de las dos cajas, a la par (en el render también, por si cambió el ancho).
  const sincronizar = (desde: HTMLDivElement | null, hacia: HTMLDivElement | null) => {
    if (desde && hacia && hacia.scrollLeft !== desde.scrollLeft) hacia.scrollLeft = desde.scrollLeft;
  };
  useLayoutEffect(() => {
    sincronizar(cajaRef.current, copiaRef.current);
  });

  if (!encabezado) {
    if (import.meta.env.DEV) console.warn('TablaConEncabezadoFijo: la tabla no tiene un <thead> como hijo directo; el encabezado no queda fijo.');
    return (
      <div className="min-w-0">
        {!sinExportar && <BotonExcel tabla={tablaRealRef} nombre={exportar} />}
        <div className={`overflow-x-auto ${className}`}>
          <table ref={ponerTabla} className={tabla}>
            {children}
          </table>
        </div>
      </div>
    );
  }

  return (
    // Una sola caja para el botón y la tabla: así un padre con `space-y`, grilla o flex las sigue viendo como un hijo.
    <div className="min-w-0">
    {!sinExportar && <BotonExcel tabla={tablaRealRef} nombre={exportar} />}
    <div ref={raizRef} className={`relative overflow-clip ${className}`}>
      <div
        ref={copiaRef}
        onScroll={() => sincronizar(copiaRef.current, cajaRef.current)}
        className="sticky z-10 overflow-x-auto bg-white dark:bg-gray-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ top: top ?? topDetectado }}
      >
        <table className={`${tabla.replace(/\btable-auto\b/g, '')} table-fixed`} style={medidas ? { width: medidas.ancho, minWidth: 0 } : undefined}>
          {medidas && (
            <colgroup>
              {medidas.columnas.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
          )}
          {encabezado}
        </table>
      </div>
      <div ref={cajaRef} onScroll={() => sincronizar(cajaRef.current, copiaRef.current)} className="overflow-x-auto" style={medidas ? { marginTop: -medidas.alto } : undefined}>
        <table ref={ponerTabla} className={tabla}>
          {/*
            Las celdas del encabezado invisible no pueden ser `sticky`: una columna fija a la derecha
            (Acciones) se mide donde está pegada, no donde está su columna, y los anchos salían corridos.
          */}
          {React.cloneElement(encabezado, { className: `${encabezado.props.className ?? ''} invisible [&_th]:static [&_td]:static`, 'aria-hidden': true })}
          {resto}
        </table>
      </div>
    </div>
    </div>
  );
};
