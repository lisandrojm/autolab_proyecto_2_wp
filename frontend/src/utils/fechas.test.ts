/**
 * El caso que estos tests existen para impedir es UNO: que una escala con vigencia al 1 de julio se
 * muestre el 30 de junio.
 *
 * Por eso el huso se fija a Buenos Aires (UTC-3) antes de que corra cualquier test: al este de Greenwich el bug
 * no se ve, y un test que solo pasa donde el error no ocurre no prueba nada. Y por eso la mitad son
 * sobre la fecha de calendario, que es la que NO hay que convertir.
 */
process.env.TZ = 'America/Argentina/Buenos_Aires';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatearInstante, formatearFechaCalendario } from './fechas.js';

describe('fecha de calendario: no se convierte de huso', () => {
  it('el 1 de julio se muestra el 1 de julio, no el 30 de junio', () => {
    // Es el bug reportado, literal. `new Date("2026-07-01").toLocaleDateString("es-AR")` da 30/6.
    assert.equal(formatearFechaCalendario('2026-07-01'), '1/7/2026');
    assert.notEqual(formatearFechaCalendario('2026-07-01'), '30/6/2026');
  });

  it('el primero de enero no se cae al año anterior', () => {
    // El mismo error, en su versión más cara: un corrimiento de un día que además cambia el año.
    assert.equal(formatearFechaCalendario('2026-01-01'), '1/1/2026');
  });

  it('funciona con la fecha completa en ISO, quedándose con la parte de calendario', () => {
    assert.equal(formatearFechaCalendario('2026-08-31T00:00:00.000Z'), '31/8/2026');
  });

  it('un Date viejo se lee en UTC, que es donde está el día que se quiso escribir', () => {
    // Los documentos anteriores guardaban estas fechas como Date a medianoche UTC. Con los getters
    // locales, en Buenos Aires eso es el día anterior a las 21:00.
    assert.equal(formatearFechaCalendario(new Date('2026-07-01T00:00:00.000Z')), '1/7/2026');
  });

  it('sin valor devuelve un guion, no «Invalid Date»', () => {
    assert.equal(formatearFechaCalendario(null), '—');
    assert.equal(formatearFechaCalendario(undefined), '—');
    assert.equal(formatearFechaCalendario(''), '—');
  });

  it('un formato que no reconoce se devuelve tal cual, sin adivinar', () => {
    // Mostrar el dato crudo es feo; mostrar otro día es un error. Se elige lo feo.
    assert.equal(formatearFechaCalendario('01/07/2026'), '01/07/2026');
  });
});

describe('instante: sí se convierte, y muestra la hora', () => {
  it('un instante UTC se muestra en hora local, 24 h', () => {
    // 12:14 UTC son las 09:14 en Buenos Aires.
    assert.equal(formatearInstante('2026-08-30T12:14:00.000Z'), '30/8/2026 09:14');
  });

  it('la hora lleva dos dígitos, para que se pueda leer de un vistazo en una columna', () => {
    assert.equal(formatearInstante('2026-08-30T12:04:00.000Z'), '30/8/2026 09:04');
  });

  it('a la madrugada la conversión cambia el día, y eso es correcto', () => {
    // Un instante SÍ pertenece a otro día según el huso: la revisión de las 01:00 UTC del 31 corrió
    // el 30 a las 22:00 para quien la mira desde acá. Es lo contrario del caso de calendario.
    assert.equal(formatearInstante('2026-08-31T01:00:00.000Z'), '30/8/2026 22:00');
  });

  it('sin valor devuelve un guion', () => {
    assert.equal(formatearInstante(null), '—');
    assert.equal(formatearInstante(undefined), '—');
  });
});
