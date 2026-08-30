/**
 * El bug, en una línea: `!f.activa` daba `true` cuando el campo no venía, y la columna de
 * `/convenios` escribió «vigilancia pausada» sobre las TRES fuentes que estaban corriendo.
 *
 * No falló en un caso raro: falló en todas las filas. Estos tests fijan la única regla que lo
 * impide — **ausente no es `false`** — y también la simétrica, que es la peligrosa: nunca decir
 * «vigilando» sobre algo que no se pudo leer.
 */
process.env.TZ = 'America/Argentina/Buenos_Aires';

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { vigilanciaDe, avisoDeVigilancia, textoUltimaRevision } from './estadoFuente.js';

const f = (over: Record<string, unknown> = {}) => ({ _id: 'f1', nombre: 'SATSAID', activa: true, ultimaRevision: '2026-08-30T12:14:00.000Z', conProblema: false, ...over }) as never;

describe('vigilanciaDe: ausente no es pausada', () => {
  beforeEach(() => mock.method(console, 'error', () => {}));

  it('activa true → activa', () => assert.equal(vigilanciaDe(f()), 'activa'));
  it('activa false → pausada', () => assert.equal(vigilanciaDe(f({ activa: false })), 'pausada'));

  it('sin el campo NO dice pausada', () => {
    // El bug reportado, literal: las tres fuentes activas se veían «pausadas» porque el server no
    // mandaba `activa` y `!undefined` es `true`.
    assert.notEqual(vigilanciaDe(f({ _id: 'sin-campo', activa: undefined })), 'pausada');
    assert.equal(vigilanciaDe(f({ _id: 'sin-campo-2', activa: undefined })), 'desconocida');
  });

  it('sin el campo TAMPOCO dice activa', () => {
    // El error simétrico es el caro: decir «vigilando» sobre una fuente apagada deja pasar una
    // paritaria sin que nadie se entere. Ante la duda, no se afirma ninguna de las dos.
    assert.notEqual(vigilanciaDe(f({ _id: 'sin-campo-3', activa: undefined })), 'activa');
  });

  it('lo reporta como error de consulta, no en silencio', () => {
    const espia = mock.method(console, 'error', () => {});
    vigilanciaDe(f({ _id: 'nuevo-id', activa: undefined }));
    assert.equal(espia.mock.callCount(), 1);
    assert.match(String(espia.mock.calls[0].arguments[0]), /activa/);
  });

  it('null tampoco se toma como false', () => {
    assert.equal(vigilanciaDe(f({ _id: 'nulo', activa: null as never })), 'desconocida');
  });
});

describe('avisoDeVigilancia: qué se escribe en pantalla', () => {
  it('activa no dice nada: no hay nada que aclarar', () => assert.equal(avisoDeVigilancia('activa'), null));
  it('pausada lo dice', () => assert.equal(avisoDeVigilancia('pausada'), 'vigilancia pausada'));

  it('desconocida NO dice «pausada»', () => {
    // Es la distinción entera: un cartel que dice «pausada» siempre deja de significar algo, y el
    // día que una fuente se pause de verdad nadie lo va a registrar.
    assert.notEqual(avisoDeVigilancia('desconocida'), 'vigilancia pausada');
    assert.equal(avisoDeVigilancia('desconocida'), 'no se pudo leer si está vigilando');
  });
});

describe('textoUltimaRevision: fecha Y hora', () => {
  it('muestra la hora, no solo el día', () => {
    // Con revisión diaria, «30/8» no responde si corrió hoy temprano o quedó de ayer.
    assert.equal(textoUltimaRevision(f()), 'revisado el 30/8/2026 09:14');
  });

  it('una fuente rota lo dice, y también cuándo falló', () => {
    assert.equal(textoUltimaRevision(f({ conProblema: true })), 'la última revisión falló · 30/8/2026 09:14');
  });

  it('sin revisar todavía no inventa una fecha', () => {
    assert.equal(textoUltimaRevision(f({ ultimaRevision: null })), 'sin revisar todavía');
  });
});
