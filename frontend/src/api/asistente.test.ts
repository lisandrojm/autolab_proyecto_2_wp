/**
 * Tests del aviso de «hay una versión nueva del Asistente».
 *
 *   npm run test:asistente-version
 *
 * Se prueba la comparación de versiones y nada más, porque es donde están los dos errores caros y
 * ninguno de los dos se ve mirando la pantalla:
 *
 *   - avisar de más: manda a bajar 39 MB a alguien que ya está al día, y quema el aviso para siempre;
 *   - avisar de menos: la persona sigue con un Asistente viejo y se entera cuando algo falla.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { esPosterior } from './asistente';

describe('cuándo avisar de una versión nueva', () => {
  it('avisa solo si la publicada es posterior a la instalada', () => {
    assert.equal(esPosterior('1.7.0', '1.6.0'), true);
    assert.equal(esPosterior('2.0.0', '1.9.9'), true);
  });

  it('no avisa si son la misma', () => {
    assert.equal(esPosterior('1.6.0', '1.6.0'), false);
  });

  /**
   * Pasa mientras se desarrolla: la máquina corre un build local más nuevo que el publicado. Mandarla
   * a «actualizar» hacia atrás sería un consejo malo, y encima insistente.
   */
  it('no avisa si la instalada es MÁS nueva que la publicada', () => {
    assert.equal(esPosterior('1.6.0', '1.7.0'), false);
  });

  /**
   * El caso que rompe comparar como texto: `'1.10.0' > '1.9.0'` es FALSO comparando strings, porque
   * el `1` de `10` pierde contra el `9`. El aviso desaparecería justo al pasar de la 9 a la 10.
   */
  it('compara por número y no por texto: 1.10.0 es posterior a 1.9.0', () => {
    assert.equal(esPosterior('1.10.0', '1.9.0'), true);
    assert.equal(esPosterior('1.9.0', '1.10.0'), false);
  });

  /**
   * `versionPublicada()` devuelve `''` cuando no pudo leer el archivo. De «no sé» no se avisa nada:
   * un aviso disparado por un error de red manda a actualizar algo que quizá ya está al día.
   */
  it('con la versión vacía no avisa nada', () => {
    assert.equal(esPosterior('', '1.6.0'), false);
    assert.equal(esPosterior('1.6.0', ''), true); // sí al revés: si no sabemos qué corre, la publicada manda
  });
});
