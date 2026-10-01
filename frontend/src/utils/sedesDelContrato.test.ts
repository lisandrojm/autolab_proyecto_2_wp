/**
 * Qué sedes se ofrecen al contratar (ver `sedesDelContrato` en `sedesProyecto.ts`).
 * Run: npx tsx --test src/utils/sedesDelContrato.test.ts
 */
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { sedeElegida, sedesDelContrato } from './sedesProyecto.js';

const catalogo = [1, 2, 3, 4].map((id) => ({ name: `Sede ${id}`, data: { id, orden: id } }));
const companies = [
  { _id: 'e2030', sedeIds: [2, 3, 4], sedeFavoritaId: 3 },
  { _id: 'esin', sedeIds: [] },
];

it('las del proyecto, en su orden: la primera es la principal', () => {
  assert.deepEqual(sedesDelContrato({ sedeIds: [1, 2, 3] }, 'e2030', companies, catalogo), [1, 2, 3]);
  assert.deepEqual(sedesDelContrato({ sedeIds: [2, 1], sedeId: 2 }, 'esin', companies, catalogo), [2, 1]);
  // Proyectos de antes: una sola `sedeId`.
  assert.deepEqual(sedesDelContrato({ sedeId: 2 }, '', companies, catalogo), [2]);
});

it('sin sedes en el proyecto, las de la empresa con su favorita primero', () => {
  assert.deepEqual(sedesDelContrato({}, 'e2030', companies, catalogo), [3, 2, 4]);
  assert.deepEqual(sedesDelContrato({}, 'esin', companies, catalogo), []);
});

it('la elegida se respeta si sigue valiendo; si no, la primera', () => {
  assert.equal(sedeElegida('2', [3, 2]), 2);
  assert.equal(sedeElegida(1, [3, 2]), 3);
  assert.equal(sedeElegida('', []), null);
});
