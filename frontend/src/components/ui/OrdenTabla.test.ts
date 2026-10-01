/**
 * El orden de las tablas (ver `OrdenTabla.tsx`). Run: npx tsx --test src/components/ui/OrdenTabla.test.ts
 */
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { ordenarFilas } from './OrdenTabla.js';

const filas = [{ n: 'b', v: 10 }, { n: 'a', v: null }, { n: 'c', v: 2 }, { n: 'd', v: '' as any }, { n: 'e', v: 2 }];

it('asc y desc, con los vacíos siempre al final', () => {
  assert.deepEqual(ordenarFilas(filas, { columna: 'v', direccion: 'asc' }, (x) => x.v).map((x) => x.n), ['c', 'e', 'b', 'a', 'd']);
  assert.deepEqual(ordenarFilas(filas, { columna: 'v', direccion: 'desc' }, (x) => x.v).map((x) => x.n), ['b', 'c', 'e', 'a', 'd']);
});

it('texto en castellano: sin distinguir mayúsculas ni tildes, y números dentro del texto como números', () => {
  const t = [{ s: 'Ñandú' }, { s: 'álvarez' }, { s: 'Zeta' }, { s: 'Item 10' }, { s: 'Item 9' }];
  assert.deepEqual(ordenarFilas(t, { columna: 's', direccion: 'asc' }, (x) => x.s).map((x) => x.s), ['álvarez', 'Item 9', 'Item 10', 'Ñandú', 'Zeta']);
});

it('sin orden devuelve el mismo arreglo', () => {
  assert.equal(ordenarFilas(filas, null, (x) => x.v), filas);
});
