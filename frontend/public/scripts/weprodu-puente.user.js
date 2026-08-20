// ==UserScript==
// @name         WeProdu — Puente ARCA
// @namespace    weprodu
// @version      1.0.0
// @description  Cáscara del puente WeProdu <-> ARCA. No tiene lógica propia: trae y ejecuta /scripts/puente-arca.js. Está congelada: esta versión no cambia nunca.
// @match        http://localhost:5173/*
// @match        https://autolab.fun/*
// @match        https://serviciossegsoc.afip.gob.ar/tramites_con_clave_fiscal/*
// @match        https://auth.afip.gob.ar/*
// @match        https://portalcf.cloud.afip.gob.ar/*
// @updateURL    https://autolab.fun/scripts/weprodu-puente.user.js
// @downloadURL  https://autolab.fun/scripts/weprodu-puente.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      autolab.fun
// @run-at       document-idle
// ==/UserScript==

/*
  ============================================================================
  ESTA CÁSCARA ESTÁ CONGELADA EN v1.0.0. NO SE TOCA.
  ============================================================================

  Todo lo que hace es traer `/scripts/puente-arca.js` y ejecutarlo. La lógica de
  verdad —la cola, las tandas de 10, el Reiniciar, la lectura de filas, el
  handshake con WeProdu— vive allá y se puede cambiar cuantas veces haga falta
  sin subir ninguna versión y sin que nadie reinstale nada: con recargar la
  página alcanza.

  POR QUÉ

  Tampermonkey chequea actualizaciones UNA VEZ POR DÍA, no al instante. Con la
  lógica adentro, cada iteración subía la versión y dejaba al operador con el
  cartel "tenés la v2.4.0, hay una v2.5.0" hasta que la actualizara a mano.
  Tampermonkey sirve para scripts estables; esto está bajo iteración activa.

  QUÉ NO SE PUEDE CAMBIAR DESPUÉS (y por eso ya está resuelto acá)

   - los `@match`: definen DÓNDE puede correr la lógica. Van amplios a propósito
     —todo `tramites_con_clave_fiscal`, el login de AFIP y el portal— porque con
     la sesión caída ARCA rebota a FinSession.aspx, y si esa pantalla no estuviera
     matcheada la lógica no podría llevar al operador de vuelta al login;
   - los `@grant` y los `@connect`: sin `GM_xmlhttpRequest` no hay forma de traer
     la lógica, y sin los `@connect` de los dos orígenes no se la puede pedir.

  DE DÓNDE SE TRAE LA LÓGICA

  La cáscara corre en tres dominios distintos —WeProdu, ARCA, AFIP—, así que no
  puede deducir el origen de `location`: en ARCA daría afip.gob.ar. Se prueban
  los orígenes conocidos en orden y se recuerda el que contestó, para que la
  próxima carga vaya directo al que sirve. Localhost primero: si está levantado
  es porque hay alguien desarrollando, y esa copia es la que quiere ver.

  CACHE-BUSTER: el `?t=` va en el pedido de la LÓGICA, nunca en el .user.js
  —ahí rompería la detección de actualizaciones de Tampermonkey—.
*/
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var ORIGENES = ['http://localhost:5173', 'https://autolab.fun'];
  var K_BASE = 'puente_base'; // último origen que respondió
  var RUTA = '/scripts/puente-arca.js';

  function g(k, d) { try { return GM_getValue(k, d); } catch (e) { return d; } }
  function s(k, v) { try { GM_setValue(k, v); } catch (e) {} }

  /* Marca propia de la cáscara. Sirve para distinguir los dos fallos que desde afuera se ven igual:
     "no hay nada instalado" (no está esta marca) y "la cáscara corre pero la lógica no llegó o no se
     pudo ejecutar" (está esta marca y no la de la lógica). Sin esto, un bloqueo de `new Function`
     mandaría a reinstalar Tampermonkey, que es lo único que sí está bien. */
  function marcar(estado) {
    try { document.documentElement.setAttribute('data-weprodu-puente', VERSION + (estado ? ':' + estado : '')); } catch (e) {}
  }

  function ejecutar(codigo, base) {
    try {
      // La lógica recibe las funciones GM y sus datos: adentro se usan como si fueran globales.
      new Function('GM_setValue', 'GM_getValue', 'GM_deleteValue', 'WEPRODU', codigo)(GM_setValue, GM_getValue, GM_deleteValue, {
        version: VERSION,
        base: base,
      });
      marcar('ok');
      return true;
    } catch (e) {
      marcar('error');
      console.error('[WeProdu] no pude ejecutar la lógica del puente:', e);
      return false;
    }
  }

  /** Pide la lógica a un origen; si no contesta, sigue con el siguiente. */
  function traer(indice, orden) {
    if (indice >= orden.length) {
      marcar('sin-logica');
      console.warn('[WeProdu] no pude traer la lógica del puente desde: ' + orden.join(', '));
      return;
    }
    var base = orden[indice];
    GM_xmlhttpRequest({
      method: 'GET',
      url: base + RUTA + '?t=' + Date.now(),
      timeout: 8000,
      onload: function (r) {
        if (r.status !== 200 || !r.responseText) return traer(indice + 1, orden);
        s(K_BASE, base); // el que sirvió va primero la próxima vez
        ejecutar(r.responseText, base);
      },
      onerror: function () { traer(indice + 1, orden); },
      ontimeout: function () { traer(indice + 1, orden); },
    });
  }

  marcar('cargando');
  var ultimo = g(K_BASE, '');
  var orden = ORIGENES.slice();
  if (ultimo && orden.indexOf(ultimo) > 0) orden = [ultimo].concat(orden.filter(function (o) { return o !== ultimo; }));
  traer(0, orden);
})();
