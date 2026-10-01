import React, { useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSort, faSortDown, faSortUp } from '@fortawesome/free-solid-svg-icons';

/*
  ORDENAR UNA TABLA POR SUS COLUMNAS, COMO UN DATATABLE.

  Un click en el encabezado ordena ascendente, otro descendente y el tercero vuelve al orden original.
  Los vacíos (null, undefined, "") quedan SIEMPRE al final, en las dos direcciones: un «—» arriba de
  todo no dice nada y empuja lo que se buscaba fuera de la pantalla.

  Dos usos:
    · `useOrdenTabla(items, valores)`: la tabla tiene todas las filas en memoria y ordena acá.
    · `useOrden()` sólo con el estado: la tabla se pagina en el server y le manda `orden` para que
      ordene allá (ordenar acá sería ordenar sólo la página visible).
*/

export type Direccion = 'asc' | 'desc';
export interface Orden {
  columna: string;
  direccion: Direccion;
}

/** Lo que devuelve un accesor: el valor por el que se ordena la columna, no lo que se dibuja. */
export type ValorOrden = string | number | boolean | null | undefined;

const vacio = (v: ValorOrden) => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));

const comparador = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/** Compara dos valores no vacíos: números como números, booleanos como 0/1, texto con el collator. */
export const compararValores = (a: ValorOrden, b: ValorOrden): number => {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' || typeof b === 'boolean') return Number(!!a) - Number(!!b);
  return comparador.compare(String(a), String(b));
};

/** Ordena sin tocar el arreglo original. Estable: a igual valor se respeta el orden que traía. */
export function ordenarFilas<T>(items: T[], orden: Orden | null, valor: ((x: T) => ValorOrden) | undefined): T[] {
  if (!orden || !valor) return items;
  const signo = orden.direccion === 'asc' ? 1 : -1;
  return items
    .map((item, i) => ({ item, i, v: valor(item) }))
    .sort((x, y) => {
      const xv = vacio(x.v);
      const yv = vacio(y.v);
      if (xv || yv) return xv === yv ? x.i - y.i : xv ? 1 : -1;
      return signo * compararValores(x.v, y.v) || x.i - y.i;
    })
    .map((x) => x.item);
}

/** Sólo el estado del orden: asc → desc → sin orden. */
export function useOrden(inicial: Orden | null = null) {
  const [orden, setOrden] = useState<Orden | null>(inicial);
  const alternar = (columna: string) =>
    setOrden((o) => (!o || o.columna !== columna ? { columna, direccion: 'asc' } : o.direccion === 'asc' ? { columna, direccion: 'desc' } : null));
  return { orden, setOrden, alternar };
}

/**
 * Orden en memoria. `valores` mapea cada columna a su accesor; se lee por ref, así que puede
 * definirse inline en cada render sin recalcular el orden de más.
 */
export function useOrdenTabla<T>(items: T[], valores: Record<string, (x: T) => ValorOrden>, inicial: Orden | null = null) {
  const { orden, setOrden, alternar } = useOrden(inicial);
  const valoresRef = useRef(valores);
  valoresRef.current = valores;
  const ordenados = useMemo(() => ordenarFilas(items, orden, orden ? valoresRef.current[orden.columna] : undefined), [items, orden]);
  return { ordenados, orden, setOrden, alternar };
}

/**
 * El encabezado clickeable. Va ADENTRO del `<th>` (que sigue siendo de cada tabla, con sus clases
 * sticky y de grupo), y hereda su tipografía.
 */
export const BotonOrden: React.FC<{
  columna: string;
  orden: Orden | null;
  onAlternar: (columna: string) => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
}> = ({ columna, orden, onAlternar, children, className = '', title }) => {
  const activa = orden?.columna === columna;
  const icono = !activa ? faSort : orden!.direccion === 'asc' ? faSortUp : faSortDown;
  const ayuda = title || (activa ? (orden!.direccion === 'asc' ? 'Orden ascendente. Click: descendente.' : 'Orden descendente. Click: quitar el orden.') : 'Ordenar por esta columna');
  return (
    <button
      type="button"
      onClick={() => onAlternar(columna)}
      title={ayuda}
      className={`inline-flex items-center gap-1.5 uppercase tracking-wider font-bold text-left hover:text-gray-700 dark:hover:text-gray-300 transition-colors ${activa ? 'text-blue-600 dark:text-blue-400' : ''} ${className}`}
    >
      {children}
      <FontAwesomeIcon icon={icono} className={`h-2.5 w-2.5 shrink-0 ${activa ? '' : 'opacity-40'}`} />
    </button>
  );
};
