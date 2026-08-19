// ==UserScript==
// @name         WeProdu — Validar obras sociales en ARCA (auto)
// @namespace    weprodu
// @version      2.0.1
// @description  Puente automático WeProdu <-> ARCA. WeProdu manda la lista de CUIL, el script la valida en ARCA sola y devuelve los RNOS a WeProdu. No confirma altas. No guarda clave fiscal.
// @match        http://localhost:5173/*
// @match        https://autolab.fun/*
// @match        https://serviciossegsoc.afip.gob.ar/tramites_con_clave_fiscal/*/Contribuyente/RelacionLaboral/Altas.aspx*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-idle
// ==/UserScript==

/*
  CÓMO FUNCIONA (para que funcione SOLO)

  El script corre en DOS lugares:
   - En WeProdu: escucha cuando apretás "Validar obras sociales", guarda la lista de CUIL en el
     almacén compartido de Tampermonkey, y queda esperando el resultado.
   - En ARCA (Altas.aspx): lee esa lista, valida CUIL por CUIL sola (Agregar + leer la obra social +
     siguiente), sobrevive los postbacks y la sesión vencida, y al terminar deja los resultados en el
     mismo almacén.
   - De vuelta en WeProdu: los levanta y se los entrega a la app con un evento.

  El almacén de Tampermonkey (GM_setValue/GM_getValue) es lo que cruza los dos sitios: localStorage
  no sirve porque es por-dominio. Por eso hace falta la extensión y no alcanza un bookmarklet.

  SEGURIDAD: nunca aprieta "Aceptar" en ARCA. Solo lee. No toca ni guarda la clave fiscal: trabaja
  dentro de la sesión que vos abriste.

  CONTRATO CON WEPRODU (lo implementa el front, ver `puenteArca.ts`):
   - Arranque:    window.dispatchEvent(new CustomEvent('weprodu-os-start',
                    { detail: [ { cuil:'27-40073687-7', contractId:'...' }, ... ] }))
   - Resultado:   window.addEventListener('weprodu-os-results', e => ...)
                    e.detail = [ { cuil, rnos, contractId } ]   rnos '' = sin afiliación -> convenio
   - Handshake:   window.dispatchEvent(new Event('weprodu-os-ready'))   ← ver `entregar()`
   - Presencia:   window.__weproduOSExt  ó  <meta name="weprodu-os-ext">
*/

(function () {
  'use strict';

  var VERSION = '2.0.1';
  var ARCA_HOST = 'serviciossegsoc.afip.gob.ar';
  var K = {
    queue: 'os_queue', // [{cuil, contractId}]
    orden: 'os_orden', // [cuil]
    hechos: 'os_hechos', // {cuil: rnos}
    active: 'os_active',
    done: 'os_done',
    last: 'os_last',
    errores: 'os_errores', // {cuil:true}
  };
  function g(k, d) { try { return GM_getValue(k, d); } catch (e) { return d; } }
  function s(k, v) { try { GM_setValue(k, v); } catch (e) {} }

  var isARCA = location.hostname.indexOf(ARCA_HOST) >= 0;

  // ======================= LADO WEPRODU =======================
  function initWeprodu() {
    // 1) avisar que la extensión está instalada
    try {
      window.__weproduOSExt = VERSION;
      if (!document.querySelector('meta[name="weprodu-os-ext"]')) {
        var m = document.createElement('meta');
        m.name = 'weprodu-os-ext';
        m.content = VERSION;
        (document.head || document.documentElement).appendChild(m);
      }
    } catch (e) {}

    // 2) cuando WeProdu pide validar, sembrar la cola y empezar a esperar
    window.addEventListener('weprodu-os-start', function (ev) {
      var lista = (ev && ev.detail) || [];
      var cuils = [], orden = [];
      lista.forEach(function (it) {
        var c = fmtCuil(it.cuil);
        if (c) { cuils.push({ cuil: c, contractId: it.contractId }); orden.push(c); }
      });
      if (!cuils.length) return;
      s(K.queue, cuils);
      s(K.orden, orden);
      s(K.hechos, {});
      s(K.errores, {});
      s(K.last, '');
      s(K.done, false);
      s(K.active, true);
      esperarResultados();
    });

    /*
      3) Handshake para una carrera real.

      Si el operador vuelve a WeProdu con la tanda ya terminada y la app recarga, el script corre en
      `document-idle` —antes de que React monte su listener— y el `weprodu-os-results` se dispara
      contra nadie: los resultados se pierden y hay que rehacer toda la corrida. Por eso WeProdu avisa
      cuando está listo, y recién ahí se entrega.
    */
    window.addEventListener('weprodu-os-ready', function () { if (g(K.done, false)) entregar(); });

    // Y si React ya estaba montado (navegación sin recarga), esto alcanza.
    if (g(K.done, false)) entregar();
  }

  var pollTimer = null;
  function esperarResultados() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (g(K.done, false)) { clearInterval(pollTimer); pollTimer = null; entregar(); }
    }, 1000);
  }

  function entregar() {
    var orden = g(K.orden, []);
    var hechos = g(K.hechos, {});
    var errores = g(K.errores, {});
    var queue = g(K.queue, []);
    var byCuil = {};
    queue.forEach(function (q) { byCuil[q.cuil] = q.contractId; });
    // Los que fallaron NO se entregan: un rnos '' significa "ARCA dijo que no tiene obra social", y
    // del otro lado se guarda como validado. Un error de consulta entregado como '' sellaría un dato
    // falso — esas personas quedan sin validar y vuelven a aparecer como pendientes.
    var detail = orden
      .filter(function (c) { return !errores[c]; })
      .map(function (c) { return { cuil: c, rnos: hechos[c] || '', contractId: byCuil[c] }; });
    try {
      window.dispatchEvent(new CustomEvent('weprodu-os-results', { detail: detail }));
    } catch (e) {}
    // limpiar para la próxima tanda
    s(K.done, false); s(K.active, false);
    s(K.queue, []); s(K.orden, []); s(K.hechos, {}); s(K.errores, {}); s(K.last, '');
  }

  // ======================= LADO ARCA =======================
  function inputCuil() { return document.getElementById('ctl00_ContentPlaceHolder1_InputCuil_txtCuil'); }
  function btnAgregar() {
    // Por rótulo y no por id: el id de WebForms cambia más que el texto. `^Agregar$` es exacto a
    // propósito — es lo ÚNICO que este script tiene permitido apretar. Nunca "Aceptar".
    var c = document.querySelectorAll('input[type=submit],input[type=button],button');
    for (var i = 0; i < c.length; i++) { if (/^Agregar$/i.test((c[i].value || c[i].textContent || '').trim())) return c[i]; }
    return null;
  }
  function sesionExpirada() {
    if (inputCuil()) return false;
    return /sesi[oó]n ha finalizado|no ha iniciado su sesi[oó]n|ingrese con su clave fiscal/i.test(document.body.textContent || '');
  }

  var RE_CUIL = /\d{2}-\d{8}-\d/g;
  /*
    El CUIL de la fila a la que pertenece ESTE input: se sube hasta el ancestro que contenga
    exactamente UNO. Si se pasa de tamaño y salta al tbody, su texto tiene todos los CUIL de la
    grilla y el primero es el de otra persona: cada input se emparejaría con el mismo y las obras
    sociales quedarían corridas, con todas las filas viéndose bien. Dos o más = ambiguo, no se adivina.
  */
  function cuilDeLaFila(osInput) {
    var node = osInput;
    for (var up = 0; up < 8 && node.parentElement; up++) {
      node = node.parentElement;
      var todos = (node.textContent || '').match(RE_CUIL) || [];
      if (todos.length === 1) return todos[0];
      if (todos.length > 1) return null;
    }
    return null;
  }

  function leerFilas() {
    var out = {}, ambiguas = 0, os = document.querySelectorAll('input[id*="ExtendCodeOS_AutocompleteText"]');
    for (var i = 0; i < os.length; i++) {
      var cuil = cuilDeLaFila(os[i]);
      if (!cuil) { ambiguas++; continue; }
      // El código real vive en el input oculto `_AutocompleteValue`; el visible trae la descripción.
      var v = document.getElementById(os[i].id.replace('_AutocompleteText', '_AutocompleteValue'));
      var code = v && v.value ? v.value.replace(/\D/g, '') : '';
      if (!code) code = (os[i].value || '').replace(/\D/g, '');
      out[cuil] = code;
    }
    return { filas: out, ambiguas: ambiguas };
  }

  function badge(txt, color) {
    var b = document.getElementById('__weprodu_badge');
    if (!b) {
      b = document.createElement('div');
      b.id = '__weprodu_badge';
      b.style.cssText = 'position:fixed;z-index:999999;right:16px;bottom:16px;background:#161b22;color:#e6edf3;font:13px system-ui;padding:10px 14px;border-radius:8px;border:1px solid #30363d;box-shadow:0 8px 24px rgba(0,0,0,.4);max-width:340px';
      document.body.appendChild(b);
    }
    b.style.borderColor = color || '#30363d';
    b.innerHTML = txt;
    return b;
  }

  function procesarARCA() {
    if (!g(K.active, false)) return; // no hay tanda en curso

    // Sesión vencida: se frena SIN tocar los pendientes. La cola sobrevive al relogin y retoma sola.
    // Va primero: con la sesión caída, cualquier cosa que se dedujera del DOM sería falsa.
    if (sesionExpirada()) {
      var orden0 = g(K.orden, []), hechos0 = g(K.hechos, {});
      var faltan = orden0.filter(function (c) { return !(c in hechos0); }).length;
      badge('⏸ Se venció la sesión de ARCA.<br><span style="color:#8b949e">Volvé a loguearte y reabrí “Registrar Nuevas Altas”.<br>Quedan ' + faltan + ' — sigue solo.</span>', '#d29922');
      return;
    }

    var orden = g(K.orden, []);
    var hechos = g(K.hechos, {});
    var errores = g(K.errores, {});
    var last = g(K.last, '');

    var lectura = leerFilas();
    var filas = lectura.filas;

    // Emparejamiento ambiguo: se FRENA. Seguir sería exportar obras sociales posiblemente corridas,
    // y del otro lado se guardan fijas con candado.
    if (lectura.ambiguas > 0) {
      s(K.active, false);
      badge('⚠ Frené: no pude emparejar ' + lectura.ambiguas + ' fila(s) con su CUIL.<br><span style="color:#8b949e">La estructura de la grilla cambió. No mando nada dudoso a WeProdu.</span>', '#d29922');
      return;
    }

    Object.keys(filas).forEach(function (c) { if (orden.indexOf(c) >= 0) hechos[c] = filas[c]; });
    var pendientes = orden.filter(function (c) { return !(c in hechos); });

    if (pendientes.length) {
      var next = pendientes[0];
      // Ya lo intenté y no apareció, con la sesión viva: es un problema de ESE CUIL en ARCA
      // (inválido, ya con relación activa, un popup). Se marca ERROR y se sigue — nunca vacío, que
      // significaría "ARCA dijo que no tiene obra social".
      if (last === next && !(next in filas)) {
        errores[next] = true;
        hechos[next] = '';
        s(K.hechos, hechos); s(K.errores, errores); s(K.last, '');
        return procesarARCA();
      }
      s(K.hechos, hechos);
      s(K.last, next);
      badge('Validando… ' + (orden.length - pendientes.length + 1) + ' / ' + orden.length + '<br><span style="color:#8b949e">no cierres esta pestaña</span>', '#1f6feb');
      var inp = inputCuil(), btn = btnAgregar();
      if (!inp || !btn) { badge('No encuentro el campo CUIL / Agregar.<br>¿Estás en “Registrar Nuevas Altas”?', '#d29922'); return; }
      inp.value = next.replace(/\D/g, '');
      setTimeout(function () { btn.click(); }, 250); // postback -> recarga -> corre de nuevo
      return;
    }

    // terminado
    s(K.hechos, hechos);
    s(K.done, true);
    s(K.active, false);
    var conOS = orden.filter(function (c) { return hechos[c] && !errores[c]; }).length;
    var errN = orden.filter(function (c) { return errores[c]; }).length;
    badge(
      '✓ Validación completa — ' + orden.length + '<br><span style="color:#8b949e">' + conOS + ' con obra social · ' + (orden.length - conOS - errN) + ' del convenio' +
        (errN ? ' · ' + errN + ' con error' : '') + '<br>Volvé a WeProdu: se guardan solas.</span>',
      '#238636',
    );
  }

  // ======================= helpers comunes =======================
  function fmtCuil(x) {
    var d = (x || '').replace(/\D/g, '');
    return d.length === 11 ? d.slice(0, 2) + '-' + d.slice(2, 10) + '-' + d.slice(10) : '';
  }

  // ======================= arranque =======================
  if (isARCA) {
    setTimeout(procesarARCA, 400); // dar tiempo a que ARCA pinte la obra social precompletada
  } else {
    initWeprodu();
  }
})();
