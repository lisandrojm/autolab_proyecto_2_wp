/**
 * Tests del filtro de categorías por VALORACIÓN.
 *
 * Run with:
 *   npx tsx --test src/utils/seleccionConvenioCategoria.test.ts
 *   – o –
 *   npm run test:seleccion-categoria
 *
 * Lo que estos tests existen para impedir es UNO: que el filtro comercial se coma un filtro de ARCA.
 * El orden es función → convenios de la empleadora → convenio elegido → valoración, y la valoración
 * va última porque los otros tres los exige el organismo: una categoría de un convenio que la
 * empleadora no registró hace que ARCA rebote el archivo, y eso no se ve hasta que vuelve rechazado.
 *
 * El otro caso cubierto es el modo permisivo: mientras las funciones no estén valoradas, el filtro
 * NO se aplica. Si se aplicara, la contratación se frenaría entera el día que esto se despliegue.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { categoriasOfrecidas } from './seleccionConvenioCategoria.js';
import type { CategoriaSatItem } from '../api/categoriasSat.js';
import type { RoleFrameItem } from '../api/roleFrames.js';

const ORO = 'oro-id';
const PLATA = 'plata-id';

/** Una categoría del catálogo: es de donde salen el convenio y el código de ARCA. */
const cat = (id: number, nombre: string, convenio: string): CategoriaSatItem =>
  ({ _id: `c${id}`, name: nombre, data: { id, numeroCategoria: id, nombre, convenio, codigoArca: String(35000 + id).padStart(6, '0'), isActive: true } }) as unknown as CategoriaSatItem;

/** Una función con sus categorías ya valoradas, como las guarda el ABM de Roles Empresa. */
const rol = (asignadas: Array<{ id: number; nombre: string; valoracionId?: string | null }>): RoleFrameItem =>
  ({ _id: 'rf1', name: 'Director de Programas', data: { rol: { id: 1, nombre: 'Director de Programas' }, categoriasSat: asignadas.map((a) => ({ id: a.id, nombre: a.nombre, numeroCategoria: a.id, valoracionId: a.valoracionId ?? null })) } }) as unknown as RoleFrameItem;

const CATALOGO = [cat(1, 'Director de Programas', '0634/11'), cat(2, 'Jefe de Producción', '0634/11'), cat(3, 'Operador', '0131/75')];
/** La función del caso real: 1 en Oro, 2 en Plata. */
const ROL_VALORADO = rol([
  { id: 1, nombre: 'Director de Programas', valoracionId: ORO },
  { id: 2, nombre: 'Jefe de Producción', valoracionId: PLATA },
]);

const base = {
  rolesFrame: [ROL_VALORADO],
  convenioElegido: '0634/11',
  codigosEmpleadora: ['0634/11'],
  categorias: CATALOGO,
  verTodasDelConvenio: false,
};

const ids = (r: { categorias: Array<{ id: number | string }> }) => r.categorias.map((c) => Number(c.id)).sort();

describe('categoriasOfrecidas — el filtro por valoración', () => {
  it('un proyecto Oro sólo ve la categoría Oro', () => {
    const r = categoriasOfrecidas({ ...base, valoracionProyecto: ORO });
    assert.deepEqual(ids(r), [1]);
    assert.equal(r.ocultasPorValoracion, 1);
    assert.equal(r.rolNoTieneCategoriasDeLaValoracion, false);
  });

  it('un proyecto Plata sólo ve la categoría Plata', () => {
    const r = categoriasOfrecidas({ ...base, valoracionProyecto: PLATA });
    assert.deepEqual(ids(r), [2]);
    assert.equal(r.ocultasPorValoracion, 1);
  });

  it('sin valoración de proyecto no se filtra: el proyecto no está valorado', () => {
    const r = categoriasOfrecidas({ ...base });
    assert.deepEqual(ids(r), [1, 2]);
    assert.equal(r.ocultasPorValoracion, 0);
  });

  it('MODO PERMISIVO: si ninguna categoría de la función está valorada, no se filtra', () => {
    // Es el estado de todo el sistema hasta que alguien termine de valorar las funciones. Filtrar
    // acá dejaría la lista vacía y frenaría la contratación por un dato que todavía no se cargó.
    const sinValorar = rol([
      { id: 1, nombre: 'Director de Programas' },
      { id: 2, nombre: 'Jefe de Producción' },
    ]);
    const r = categoriasOfrecidas({ ...base, rolesFrame: [sinValorar], valoracionProyecto: ORO });
    assert.deepEqual(ids(r), [1, 2]);
    assert.equal(r.ocultasPorValoracion, 0);
    assert.equal(r.rolNoTieneCategoriasDeLaValoracion, false);
    assert.equal(r.rolSinValorar, true, 'tiene que avisarse: en silencio parece que el filtro no anduvo');
  });

  it('rolSinValorar sólo se prende con el proyecto valorado y la función sin valorar', () => {
    assert.equal(categoriasOfrecidas({ ...base, valoracionProyecto: ORO }).rolSinValorar, false, 'la función está valorada');
    const sinValorar = rol([{ id: 1, nombre: 'Director de Programas' }]);
    assert.equal(categoriasOfrecidas({ ...base, rolesFrame: [sinValorar] }).rolSinValorar, false, 'el proyecto no está valorado: no hay nada que explicar');
  });

  it('la función valoró, pero ninguna es de la valoración del proyecto: avisa y NO deja lista vacía', () => {
    const r = categoriasOfrecidas({ ...base, valoracionProyecto: 'diamante-id' });
    assert.equal(r.rolNoTieneCategoriasDeLaValoracion, true);
    assert.ok(r.categorias.length > 0, 'una lista vacía sin explicación se lee como un error de la pantalla');
  });

  it('«ver todas» destraba el filtro, y lo que quedó afuera se sigue contando', () => {
    const r = categoriasOfrecidas({ ...base, valoracionProyecto: ORO, verTodasLasValoraciones: true });
    assert.deepEqual(ids(r), [1, 2]);
    assert.equal(r.ocultasPorValoracion, 0);
  });

  it('una categoría SIN valorar no entra en un proyecto valorado', () => {
    // No se puede afirmar que corresponda a ese nivel; ofrecerla sería decidir por quien no la cargó.
    const mixto = rol([
      { id: 1, nombre: 'Director de Programas', valoracionId: ORO },
      { id: 2, nombre: 'Jefe de Producción' },
    ]);
    const r = categoriasOfrecidas({ ...base, rolesFrame: [mixto], valoracionProyecto: ORO });
    assert.deepEqual(ids(r), [1]);
  });
});

describe('categoriasOfrecidas — el orden de los filtros', () => {
  it('LA VALORACIÓN NO SE COME EL FILTRO DE ARCA: una categoría de otro convenio no entra ni siendo de la valoración', () => {
    /*
      Es la invariante que da sentido al orden. La 3 es del 0131/75, que esta empleadora no registró,
      y está en Oro. Si la valoración se aplicara antes que el convenio, entraría — y ARCA rebota el
      alta con una categoría de un convenio que el CUIT no tiene registrado.
    */
    const conOtroConvenio = rol([
      { id: 1, nombre: 'Director de Programas', valoracionId: ORO },
      { id: 3, nombre: 'Operador', valoracionId: ORO },
    ]);
    const r = categoriasOfrecidas({ ...base, rolesFrame: [conOtroConvenio], valoracionProyecto: ORO });
    assert.deepEqual(ids(r), [1], 'la 3 es del 0131/75: la empleadora no lo registró');
    assert.equal(r.ocultasPorConvenio, 1);
  });

  it('lo oculto por convenio y lo oculto por valoración se cuentan por separado', () => {
    // Son dos cosas distintas para quien mira: una la destraba el operador cambiando de convenio, la
    // otra necesita el escape manual auditado. Sumarlas en un número las volvería la misma cosa.
    const mezcla = rol([
      { id: 1, nombre: 'Director de Programas', valoracionId: ORO },
      { id: 2, nombre: 'Jefe de Producción', valoracionId: PLATA },
      { id: 3, nombre: 'Operador', valoracionId: ORO },
    ]);
    const r = categoriasOfrecidas({ ...base, rolesFrame: [mezcla], valoracionProyecto: ORO });
    assert.equal(r.ocultasPorConvenio, 1, 'la 3, por convenio');
    assert.equal(r.ocultasPorValoracion, 1, 'la 2, por valoración');
    assert.deepEqual(ids(r), [1]);
  });
});
