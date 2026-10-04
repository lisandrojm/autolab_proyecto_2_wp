import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { progresoPorTandas, resumenCsv } from './progresoTandas';

const personas = Array.from({ length: 20 }, (_, i) => ({ cuil: `20${String(i + 1).padStart(8, '0')}1`, nombre: `Persona ${i + 1}` }));
const cuils = (desde: number, hasta: number) => personas.slice(desde, hasta).map((p) => p.cuil);

describe('progresoPorTandas', () => {
  it('antes de empezar muestra las tandas como van a salir: 9, 9 y 2, todas pendientes', () => {
    const p = progresoPorTandas({ eventos: [], personas });
    assert.deepEqual(p.tandas.map((t) => t.personas.length), [9, 9, 2]);
    assert.ok(p.tandas.every((t) => t.estado === 'pendiente'));
    assert.equal(p.cuenta.pendiente, 20);
  });

  it('con el tope leído de la pantalla, las pendientes se parten por ese tope', () => {
    const p = progresoPorTandas({ eventos: [{ tipo: 'tope', enPantalla: 5, usado: 5 }], personas });
    assert.deepEqual(p.tandas.map((t) => t.personas.length), [5, 5, 5, 5]);
    assert.equal(p.tope, 5);
  });

  it('a mitad de corrida: una tanda terminada, otra presentando y el resto pendiente', () => {
    const eventos = [
      { tipo: 'tope', enPantalla: 9, usado: 9 },
      { tipo: 'tanda', n: 1, de: 3, cuils: cuils(0, 9), estado: 'presentando' },
      ...cuils(0, 9).map((cuil, i) => ({ tipo: 'personaTanda', cuil, tanda: 1, estado: i === 1 ? 'rechazada' : 'registrada', motivo: i === 1 ? 'Error: CUIL inválido' : undefined })),
      { tipo: 'tanda', n: 1, de: 3, cuils: cuils(0, 9), estado: 'terminada', resultado: 'aceptada', duracionMs: 41000 },
      { tipo: 'tanda', n: 2, de: 3, cuils: cuils(9, 18), estado: 'presentando' },
      ...cuils(9, 18).map((cuil) => ({ tipo: 'personaTanda', cuil, tanda: 2, estado: 'presentando' })),
    ];
    const p = progresoPorTandas({ eventos, personas });
    assert.deepEqual(p.tandas.map((t) => t.estado), ['terminada', 'presentando', 'pendiente']);
    assert.deepEqual(p.cuenta, { pendiente: 2, presentando: 9, registrada: 8, rechazada: 1, incierta: 0, seco: 0 });
    assert.equal(p.tandas[0].personas[1].motivo, 'Error: CUIL inválido');
    assert.equal(p.tandas[0].duracionMs, 41000);
  });

  it('una persona devuelta y rearmada en otra tanda se muestra una sola vez, en la última', () => {
    const cinco = personas.slice(0, 5);
    const eventos = [
      { tipo: 'tope', enPantalla: 9, usado: 9 },
      { tipo: 'tanda', n: 1, de: 1, cuils: cinco.map((p) => p.cuil), estado: 'terminada', resultado: 'aceptada' },
      { tipo: 'personaTanda', cuil: cinco[2].cuil, tanda: 1, estado: 'rechazada', motivo: 'fecha inválida' },
      { tipo: 'tanda', n: 2, de: 2, cuils: [0, 1, 3, 4].map((i) => cinco[i].cuil), estado: 'terminada', resultado: 'aceptada' },
      ...[0, 1, 3, 4].map((i) => ({ tipo: 'personaTanda', cuil: cinco[i].cuil, tanda: 2, estado: 'registrada' })),
    ];
    const p = progresoPorTandas({ eventos, personas: cinco });
    assert.deepEqual(p.tandas.map((t) => t.personas.length), [1, 4]);
    assert.equal(p.tandas[0].personas[0].estado, 'rechazada');
    assert.equal(p.cuenta.registrada, 4);
  });

  it('el corte y las que solo se consultan salen aparte', () => {
    const p = progresoPorTandas({
      eventos: [
        { tipo: 'personaTanda', cuil: '20999999991', estado: 'registrada', porConsulta: true },
        { tipo: 'corte', motivo: 'rechazos_seguidos', mensaje: 'ARCA rechazó 4 altas seguidas.' },
      ],
      personas: personas.slice(0, 2),
      descartadas: [
        { cuil: '20999999991', nombre: 'Persona Incierta', motivo: 'incierta' },
        { cuil: '20888888881', nombre: 'Ya Presentada', motivo: 'presentada' },
      ],
    });
    assert.deepEqual(p.consultadas.map((c) => [c.nombre, c.estado, c.porConsulta]), [['Persona Incierta', 'registrada', true]]);
    assert.equal(p.corte?.motivo, 'rechazos_seguidos');
    assert.equal(p.cuenta.registrada, 0, 'la cuenta es de lo que se presenta en esta corrida');
  });

  it('el resumen para bajar trae una fila por persona, con su tanda, estado y motivo', () => {
    const p = progresoPorTandas({
      eventos: [
        { tipo: 'tanda', n: 1, de: 1, cuils: cuils(0, 2), estado: 'terminada' },
        { tipo: 'personaTanda', cuil: personas[0].cuil, tanda: 1, estado: 'registrada', cat: 'ABC123' },
        { tipo: 'personaTanda', cuil: personas[1].cuil, tanda: 1, estado: 'rechazada', motivo: 'dijo "no"; y punto' },
      ],
      personas: personas.slice(0, 2),
    });
    const lineas = resumenCsv(p, { razonSocial: '2030 S.R.L.', cuit: '30717068374' }).split('\r\n');
    assert.equal(lineas.length, 3);
    assert.match(lineas[1], /"1";"20000000011";"Persona 1";"Registrada";"ABC123"/);
    assert.match(lineas[2], /"Rechazada";"";"";"dijo ""no""; y punto"$/);
  });
});
