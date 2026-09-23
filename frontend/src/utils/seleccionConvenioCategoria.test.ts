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
import { categoriasOfrecidas, categoriaPorDefecto } from './seleccionConvenioCategoria.js';
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
    const sinValorar = rol([
      { id: 1, nombre: 'Director de Programas' },
      { id: 2, nombre: 'Jefe de Producción' },
    ]);
    assert.equal(categoriasOfrecidas({ ...base, rolesFrame: [sinValorar] }).rolSinValorar, false, 'el proyecto no está valorado: no hay nada que explicar');
    const unaSola = rol([{ id: 1, nombre: 'Director de Programas' }]);
    assert.equal(categoriasOfrecidas({ ...base, rolesFrame: [unaSola], valoracionProyecto: ORO }).rolSinValorar, false, 'con una sola categoría se elige sola: no hay nada que explicar');
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

/*
  ── LA CATEGORÍA QUE VIENE ELEGIDA ──

  Un proyecto Plata se contrata con las categorías Plata de la función: dejar el selector vacío obliga
  a elegir a mano algo que el dato ya decide. Y cuando la función NO tiene ninguna del nivel del
  proyecto, lo que no puede pasar es que no se proponga nada y tampoco se explique por qué la que
  quedó es de otro nivel — eso se lee como un descuido y es una decisión.

  Los `orden` son los de producción: 1 = Oro (el más alto), 2 = Plata.
*/
const NIVELES = [
  { _id: ORO, orden: 1 },
  { _id: PLATA, orden: 2 },
];
const BRONCE = 'bronce-id';
const NIVELES_CON_BRONCE = [...NIVELES, { _id: BRONCE, orden: 3 }];

/** Una categoría como la devuelve `categoriasOfrecidas`. */
const ofrecida = (id: number, valoracionId: string | null) => ({ id, nombre: `Categoría ${id}`, numeroCategoria: id, codigoArca: String(35000 + id).padStart(6, '0'), valoracionId });

describe('categoriaPorDefecto — qué viene elegido al abrir el alta', () => {
  it('un proyecto Plata elige la Plata, aunque la Oro esté primera en la lista', () => {
    const r = categoriaPorDefecto({ categorias: [ofrecida(1, ORO), ofrecida(2, PLATA)], valoracionProyecto: PLATA, niveles: NIVELES });
    assert.equal(r?.id, '2');
    assert.equal(r?.motivo, 'coincide');
  });

  it('un proyecto Oro elige la Oro', () => {
    const r = categoriaPorDefecto({ categorias: [ofrecida(1, ORO), ofrecida(2, PLATA)], valoracionProyecto: ORO, niveles: NIVELES });
    assert.equal(r?.id, '1');
    assert.equal(r?.motivo, 'coincide');
  });

  it('SIN Plata en la función, elige Oro y avisa que difiere', () => {
    // Es el caso del pedido: no hay categoría del nivel del proyecto, se propone la más cercana y se
    // dice. El motivo `otra-valoracion` es lo que la pantalla usa para explicarlo.
    const r = categoriaPorDefecto({ categorias: [ofrecida(1, ORO), ofrecida(3, ORO)], valoracionProyecto: PLATA, niveles: NIVELES });
    assert.equal(r?.motivo, 'otra-valoracion');
    assert.equal(r?.id, '1');
  });

  it('con varias del nivel del proyecto toma la primera y lo informa en `candidatas`', () => {
    const r = categoriaPorDefecto({ categorias: [ofrecida(1, PLATA), ofrecida(2, PLATA)], valoracionProyecto: PLATA, niveles: NIVELES });
    assert.equal(r?.id, '1');
    assert.equal(r?.candidatas, 2);
  });

  it('sin el nivel exacto, gana el MÁS CERCANO por orden', () => {
    // Proyecto Plata (2) entre Oro (1) y Bronce (3): las dos están a distancia 1, y el empate lo gana
    // el nivel más alto. Con Bronce a distancia 1 y Oro a 2, gana Bronce.
    const empate = categoriaPorDefecto({ categorias: [ofrecida(3, BRONCE), ofrecida(1, ORO)], valoracionProyecto: PLATA, niveles: NIVELES_CON_BRONCE });
    assert.equal(empate?.id, '1');

    const conBronce = categoriaPorDefecto({ categorias: [ofrecida(3, BRONCE), ofrecida(1, ORO)], valoracionProyecto: ORO, niveles: NIVELES_CON_BRONCE });
    assert.equal(conBronce?.id, '1'); // la propia Oro gana por coincidencia
  });

  it('una sola candidata se elige sola, esté valorada o no', () => {
    assert.deepEqual(categoriaPorDefecto({ categorias: [ofrecida(1, null)], valoracionProyecto: PLATA, niveles: NIVELES }), { id: '1', motivo: 'unica', candidatas: 1 });
  });

  it('con varias sin valorar NO decide: el dato que haría falta todavía no se cargó', () => {
    assert.equal(categoriaPorDefecto({ categorias: [ofrecida(1, null), ofrecida(2, null)], valoracionProyecto: PLATA, niveles: NIVELES }), null);
  });

  it('sin valoración del proyecto y con varias, no decide', () => {
    assert.equal(categoriaPorDefecto({ categorias: [ofrecida(1, ORO), ofrecida(2, PLATA)], valoracionProyecto: '', niveles: NIVELES }), null);
  });

  it('sin categorías, nada', () => {
    assert.equal(categoriaPorDefecto({ categorias: [], valoracionProyecto: PLATA, niveles: NIVELES }), null);
  });

  it('sin el orden de los niveles cargado no inventa cercanía', () => {
    // Sin `orden` no hay forma de saber cuál es "el más cercano": mejor no elegir que elegir por
    // orden de lista.
    assert.equal(categoriaPorDefecto({ categorias: [ofrecida(1, ORO), ofrecida(3, ORO)], valoracionProyecto: PLATA, niveles: [] }), null);
  });
});
