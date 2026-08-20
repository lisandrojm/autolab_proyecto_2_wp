// ==UserScript==
// @name         WeProdu — Validar obras sociales en ARCA (auto)
// @namespace    weprodu
// @version      2.5.0
// @description  Puente automático WeProdu <-> ARCA. WeProdu manda la lista de CUIL, el script la valida en ARCA sola y devuelve los RNOS a WeProdu. No confirma altas. No guarda clave fiscal.
// @match        http://localhost:5173/*
// @match        https://autolab.fun/*
// @match        https://serviciossegsoc.afip.gob.ar/tramites_con_clave_fiscal/*
// @match        https://auth.afip.gob.ar/*
// @match        https://portalcf.cloud.afip.gob.ar/*
// @updateURL    https://autolab.fun/scripts/weprodu-obra-social.user.js
// @downloadURL  https://autolab.fun/scripts/weprodu-obra-social.user.js
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

  CONTRATO CON WEPRODU (lo implementa el front, ver `puenteArca.ts`).
  Todo va por `document`: es lo único que cruza el sandbox de Tampermonkey — ver LA FRONTERA abajo.
   - Arranque:    document.dispatchEvent(new CustomEvent('weprodu-os-start',
                    { detail: [ { cuil:'27-40073687-7', contractId:'...' }, ... ] }))
   - Resultado:   document.addEventListener('weprodu-os-results', e => ...)
                    e.detail = [ { cuil, rnos, contractId } ]   rnos '' = sin afiliación -> convenio
   - Handshake:   document.dispatchEvent(new Event('weprodu-os-ready'))   ← ver `entregar()`
   - Prueba:      document.dispatchEvent(new CustomEvent('weprodu-os-ping'))
                  → contesta 'weprodu-os-pong' con { version }. Es lo ÚNICO que prueba que el canal
                    funciona: la marca sola solo dice que el script se ejecutó una vez.
   - Presencia:   <meta name="weprodu-os-ext"> ó <html data-weprodu-os>  (window.__weproduOSExt
                  también se setea, pero puede no llegar a la página)

  REGLA: con `@grant` distinto de `none`, `document` es el único canal confiable en las DOS
  direcciones. `window` y `unsafeWindow` son respaldo — nunca el canal principal, ni para emitir ni
  para escuchar.
*/

/*
  SOBRE @updateURL / @downloadURL

  Sin estas dos líneas Tampermonkey NO puede actualizar el script, y un script creado con "Crear un
  nuevo script" + pegar tampoco queda vinculado a ningún origen. Eso hacía que cada versión nueva
  dejara al operador con la copia vieja —o con el script roto si el pegado salió incompleto— sin
  ningún aviso. Instalado desde la URL, Tampermonkey chequea y actualiza solo.

  Apuntan a PRODUCCIÓN a propósito: es donde está el operador real. Trabajando en localhost, el
  auto-update traería la versión publicada en vez de la local — por eso la app compara la versión que
  responde el script contra la del archivo servido y avisa cuando no coinciden (ver `puenteArca.ts`).
*/
(function () {
  'use strict';

  var VERSION = '2.5.0';
  var ARCA_HOST = 'serviciossegsoc.afip.gob.ar';
  /*
    Los otros dos hosts del camino. Antes el script SOLO corría en Altas.aspx, y con la sesión caída
    ARCA no te deja ahí: te rebota a FinSession.aspx ("ingrese con su clave fiscal"), una pantalla
    donde el script no existía. Resultado: apretabas "Validar", se abría una pestaña muerta y no
    pasaba nada más — la cola quedaba sembrada esperando una pantalla que nunca se iba a abrir.
    Corriendo también en el login y en el portal, el script se encarga del camino de vuelta.
  */
  var AUTH_HOST = 'auth.afip.gob.ar';
  var PORTAL_HOST = 'portalcf.cloud.afip.gob.ar';
  var ARCA_ALTAS_URL = 'https://serviciossegsoc.afip.gob.ar/tramites_con_clave_fiscal/MiSimplificacion/app/Contribuyente/RelacionLaboral/Altas.aspx';
  var AFIP_LOGIN_URL = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';
  var K = {
    queue: 'os_queue', // [{cuil, contractId}]
    orden: 'os_orden', // [cuil]
    hechos: 'os_hechos', // {cuil: rnos}
    active: 'os_active',
    done: 'os_done',
    last: 'os_last',
    errores: 'os_errores', // {cuil:true}
    fase: 'os_fase', // '' | 'limpiando' — el Reiniciar final, para no dejar filas cargadas
    nav: 'os_nav', // {t, n} — saltos automáticos hechos, para no quedar en un loop de redirecciones
  };
  function g(k, d) { try { return GM_getValue(k, d); } catch (e) { return d; } }
  function s(k, v) { try { GM_setValue(k, v); } catch (e) {} }

  var isARCA = location.hostname.indexOf(ARCA_HOST) >= 0;
  var isAuth = location.hostname.indexOf(AUTH_HOST) >= 0;
  var isPortal = location.hostname.indexOf(PORTAL_HOST) >= 0;
  /** La pantalla donde el script trabaja de verdad. El resto del recorrido es solo llegar hasta acá. */
  function enAltas() { return /RelacionLaboral\/Altas\.aspx/i.test(location.pathname); }

  /*
    ======================= LA FRONTERA DEL SANDBOX =======================

    Con cualquier `@grant` distinto de `none` —y acá hacen falta GM_setValue/GM_getValue para cruzar
    los datos entre ARCA y WeProdu— Tampermonkey ejecuta el script en un SANDBOX: el `window` de acá
    NO es el `window` de la página. Una marca puesta en `window.__weproduOSExt` no la ve la app, y un
    `window.addEventListener('weprodu-os-start')` nunca recibe el evento que dispara React. Los dos
    lados funcionan por separado y no se hablan — el síntoma es "no detecta el script".

    Lo único que atraviesa el sandbox es el DOM. Por eso todo el contrato se apoya en `document`:
    las marcas van como <meta> y como atributo del <html>, y los eventos se escuchan y emiten en
    `document`. `window` se mantiene como respaldo por si algún día no hay sandbox, y `unsafeWindow`
    se usa cuando Tampermonkey lo expone.
  */
  function paginaWindow() {
    try { return typeof unsafeWindow !== 'undefined' && unsafeWindow ? unsafeWindow : window; } catch (e) { return window; }
  }
  /**
   * Escucha en los dos lados de la frontera, procesando cada evento UNA vez.
   *
   * El mismo handler queda registrado en `document`, `window` y `unsafeWindow` porque no se sabe de
   * cuál lado está la página. Como del otro lado también se emite por más de un canal, el handler
   * correría dos o tres veces por el MISMO evento — sembrando la cola de nuevo y reiniciando el
   * poller a mitad de camino. El WeakSet lo procesa una sola vez y no retiene nada en memoria.
   */
  function escuchar(nombre, fn) {
    var vistos = new WeakSet();
    var wrap = function (e) {
      if (e && typeof e === 'object') {
        if (vistos.has(e)) return;
        vistos.add(e);
      }
      fn(e);
    };
    try { document.addEventListener(nombre, wrap); } catch (e) {}
    try { window.addEventListener(nombre, wrap); } catch (e) {}
    try { var w = paginaWindow(); if (w !== window) w.addEventListener(nombre, wrap); } catch (e) {}
  }
  function emitir(nombre, detail) {
    try { document.dispatchEvent(new CustomEvent(nombre, { detail: detail })); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent(nombre, { detail: detail })); } catch (e) {}
    try { var w = paginaWindow(); if (w !== window) w.dispatchEvent(new CustomEvent(nombre, { detail: detail })); } catch (e) {}
  }

  // ======================= LADO WEPRODU =======================
  function initWeprodu() {
    // 1) avisar que la extensión está instalada. Las marcas del DOM son las que valen: el `window`
    //    puede no ser el de la página (ver arriba).
    try {
      document.documentElement.setAttribute('data-weprodu-os', VERSION);
      if (!document.querySelector('meta[name="weprodu-os-ext"]')) {
        var m = document.createElement('meta');
        m.name = 'weprodu-os-ext';
        m.content = VERSION;
        (document.head || document.documentElement).appendChild(m);
      }
    } catch (e) {}
    try { window.__weproduOSExt = VERSION; } catch (e) {}
    try { var pw = paginaWindow(); if (pw !== window) pw.__weproduOSExt = VERSION; } catch (e) {}

    // 2) cuando WeProdu pide validar, sembrar la cola y empezar a esperar
    escuchar('weprodu-os-start', function (ev) {
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
      s(K.fase, '');
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
    escuchar('weprodu-os-ready', function () { if (g(K.done, false)) entregar(); });

    /*
      4) Ping/pong: la única prueba de que el CANAL funciona.

      Que exista la marca en el DOM solo demuestra que el script se ejecutó una vez. No dice nada del
      camino de vuelta: con el permiso "Permitir scripts de usuario" apagado, o con un cambio futuro
      en el sandbox, se puede llegar a "detectada" y que igual no arranque nada. Contestar un pong es
      lo que prueba que los eventos cruzan de verdad, que es lo que hace falta saber ANTES de mandar
      a alguien a validar 21 personas.
    */
    escuchar('weprodu-os-ping', function () { emitir('weprodu-os-pong', { version: VERSION }); });

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
    emitir('weprodu-os-results', detail);
    // limpiar para la próxima tanda
    s(K.done, false); s(K.active, false);
    s(K.queue, []); s(K.orden, []); s(K.hechos, {}); s(K.errores, {}); s(K.last, ''); s(K.fase, '');
  }

  // ======================= LADO ARCA =======================
  /**
   * ARCA no acepta más de 10 relaciones laborales cargadas a la vez.
   *
   * Al intentar la 11 no agrega la fila y contesta "No es posible ingresar mas de 10 relaciones
   * laborales a la vez". Con la lógica vieja eso se leía como "el CUIL falló", así que en una tanda
   * de 21 se validaban 10 y los otros 11 quedaban marcados como error sin que nadie se enterara:
   * gente sin validar que APARENTABA haber sido consultada. Por eso el trabajo va en tandas de 10,
   * con `Reiniciar` en el medio.
   */
  var TOPE_ARCA = 10;

  function inputCuil() { return document.getElementById('ctl00_ContentPlaceHolder1_InputCuil_txtCuil'); }

  /**
   * Los DOS únicos botones que este script puede apretar, buscados por su rótulo EXACTO.
   *
   *   Agregar   → carga un CUIL en la grilla. No registra nada.
   *   Reiniciar → vacía la grilla. NO registra nada: es lo contrario de Aceptar.
   *
   * `Aceptar` está al lado de `Reiniciar` y CONFIRMA las altas ante el organismo. Confundirlos es el
   * peor error posible de este script: registraría altas reales, masivas e irreversibles, por fuera
   * del TXT. Por eso nunca se busca por posición ni por índice — solo por texto exacto — y no hay
   * ninguna otra función que dispare un control.
   */
  function botonPorRotulo(rotulo) {
    var c = document.querySelectorAll('input[type=submit],input[type=button],button');
    for (var i = 0; i < c.length; i++) {
      if (rotulo.test((c[i].value || c[i].textContent || '').trim())) return c[i];
    }
    return null;
  }
  function btnAgregar() { return botonPorRotulo(/^Agregar$/i); }
  function btnReiniciar() { return botonPorRotulo(/^Reiniciar$/i); }

  function sesionExpirada() {
    if (inputCuil()) return false;
    return /sesi[oó]n ha finalizado|no ha iniciado su sesi[oó]n|ingrese con su clave fiscal/i.test(document.body.textContent || '');
  }

  /**
   * ¿ARCA acaba de rechazar por el tope de 10?
   *
   * Se chequea aunque el script ya trabaje de a 10: el contador puede desincronizarse si el operador
   * tenía filas cargadas antes de arrancar. Cuando aparece, el CUIL en curso NO es un error — no se
   * lo pudo ni intentar — así que se reintenta en la tanda siguiente.
   */
  function topeAlcanzado() {
    return /no es posible ingresar mas de 10 relaciones laborales/i.test(document.body.textContent || '');
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
    var out = {}, ambiguas = 0, total = 0, os = document.querySelectorAll('input[id*="ExtendCodeOS_AutocompleteText"]');
    for (var i = 0; i < os.length; i++) {
      total++;
      var cuil = cuilDeLaFila(os[i]);
      if (!cuil) { ambiguas++; continue; }
      // El código real vive en el input oculto `_AutocompleteValue`; el visible trae la descripción.
      var v = document.getElementById(os[i].id.replace('_AutocompleteText', '_AutocompleteValue'));
      var code = v && v.value ? v.value.replace(/\D/g, '') : '';
      if (!code) code = (os[i].value || '').replace(/\D/g, '');
      out[cuil] = code;
    }
    return { filas: out, ambiguas: ambiguas, total: total };
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

  /** Aprieta Reiniciar y deja la grilla vacía. Devuelve false si el botón no está. */
  function reiniciarGrilla() {
    var btn = btnReiniciar();
    if (!btn) return false;
    setTimeout(function () { btn.click(); }, 200); // postback -> recarga -> procesarARCA() de nuevo
    return true;
  }

  /**
   * Botón manual para dejar la pantalla prolija sin correr una validación.
   *
   * Existe porque una corrida cancelada a mitad de camino deja filas cargadas, y filas cargadas son
   * altas a medio hacer que alguien puede confirmar por error más adelante.
   */
  function ofrecerLimpieza(cuantas) {
    var b = badge(
      '⚠ Quedaron ' + cuantas + ' fila(s) cargadas en ARCA.<br><span style="color:#8b949e">No son altas: se descartan con Reiniciar.</span><br>' +
        '<button id="__weprodu_limpiar" style="margin-top:8px;background:#1f6feb;border:none;color:#fff;border-radius:6px;padding:6px 11px;cursor:pointer;font:12px system-ui">Limpiar pantalla de ARCA</button>',
      '#d29922',
    );
    var btn = b.querySelector('#__weprodu_limpiar');
    if (btn) btn.onclick = function () { if (!reiniciarGrilla()) badge('No encuentro el botón Reiniciar.', '#d29922'); };
  }

  function procesarARCA() {
    var activa = g(K.active, false);
    var limpiando = g(K.fase, '') === 'limpiando';
    if (!activa && !limpiando) {
      // Sin tanda en curso: si el operador dejó filas de una corrida cancelada, se le ofrece limpiar.
      var suelto = leerFilas();
      if (suelto.total > 0) ofrecerLimpieza(suelto.total);
      return;
    }

    // Sesión vencida: se frena SIN tocar los pendientes. La cola sobrevive al relogin y retoma sola.
    // Va primero: con la sesión caída, cualquier cosa que se dedujera del DOM sería falsa.
    if (sesionExpirada()) {
      var orden0 = g(K.orden, []), hechos0 = g(K.hechos, {});
      var faltan = orden0.filter(function (c) { return !(c in hechos0); }).length;
      badge(
        '⏸ Se venció la sesión de ARCA.<br><span style="color:#8b949e">Volvé a loguearte y reabrí “Registrar Nuevas Altas”.<br>Quedan ' + faltan + ' — sigue solo.<br>' +
          'Las filas que hayan quedado cargadas se limpian al retomar.</span>',
        '#d29922',
      );
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

    // 1) COSECHAR SIEMPRE, antes de cualquier Reiniciar. Reiniciar sin haber leído es perder la tanda.
    var propias = 0, ajenas = 0;
    Object.keys(filas).forEach(function (c) {
      if (orden.indexOf(c) >= 0) { hechos[c] = filas[c]; propias++; }
      else ajenas++;
    });
    s(K.hechos, hechos);

    var pendientes = orden.filter(function (c) { return !(c in hechos) && !errores[c]; });

    // 2) Limpieza final: se pidió Reiniciar y la grilla ya está vacía → la corrida terminó.
    if (limpiando) {
      if (lectura.total > 0) { reiniciarGrilla(); return; }
      s(K.fase, '');
      s(K.done, true);
      s(K.active, false);
      var conOS = orden.filter(function (c) { return hechos[c] && !errores[c]; }).length;
      var errN = orden.filter(function (c) { return errores[c]; }).length;
      badge(
        '✓ Validación completa — ' + orden.length + ' CUIL<br><span style="color:#8b949e">' + conOS + ' con obra social · ' + (orden.length - conOS - errN) + ' del convenio' +
          (errN ? ' · ' + errN + ' con error' : '') + '<br><b>La pantalla de ARCA quedó limpia: no se registró ningún alta.</b><br>Volvé a WeProdu: se guardan solas.</span>',
        '#238636',
      );
      return;
    }

    // 3) Terminó de consultar: se limpia la grilla ANTES de dar por cerrada la corrida, para no dejar
    //    relaciones laborales a medio cargar que alguien pueda confirmar por error.
    if (pendientes.length === 0) {
      s(K.fase, 'limpiando');
      if (lectura.total > 0 && reiniciarGrilla()) return;
      return procesarARCA();
    }

    // 4) El tope: ARCA rechazó por tener 10 cargadas. El CUIL en curso NO es un error —no se lo pudo
    //    ni intentar— así que se deja pendiente y se reintenta después de vaciar la grilla.
    if (topeAlcanzado()) {
      s(K.last, '');
      badge('Tanda llena (' + TOPE_ARCA + '). Vaciando para seguir…<br><span style="color:#8b949e">' + (orden.length - pendientes.length) + ' / ' + orden.length + ' listos</span>', '#1f6feb');
      if (!reiniciarGrilla()) badge('No encuentro el botón Reiniciar: no puedo seguir sin vaciar la grilla.', '#d29922');
      return;
    }

    // 5) La grilla está llena de lo propio, o tiene filas ajenas que ocupan lugar del tope. En los dos
    //    casos hay que vaciar: lo propio ya se cosechó arriba y lo ajeno no es nuestro para leerlo.
    if (lectura.total >= TOPE_ARCA || (ajenas > 0 && propias === 0)) {
      s(K.last, '');
      var hechosN = orden.length - pendientes.length;
      badge('Vaciando la grilla para la tanda siguiente…<br><span style="color:#8b949e">' + hechosN + ' / ' + orden.length + ' listos</span>', '#1f6feb');
      if (!reiniciarGrilla()) badge('No encuentro el botón Reiniciar: no puedo seguir sin vaciar la grilla.', '#d29922');
      return;
    }

    // 6) Mandar el siguiente CUIL.
    var next = pendientes[0];
    // Lo intenté la vuelta pasada y no apareció, con la sesión viva y SIN tope: es un problema de ESE
    // CUIL en ARCA (inválido, ya con relación activa, un popup). Se marca ERROR y se sigue — nunca
    // vacío, que significaría "ARCA dijo que no tiene obra social".
    if (last === next && !(next in filas)) {
      errores[next] = true;
      s(K.errores, errores);
      s(K.last, '');
      return procesarARCA();
    }

    s(K.last, next);
    var hechosAhora = orden.length - pendientes.length;
    var tandaActual = Math.floor(hechosAhora / TOPE_ARCA) + 1;
    var tandasTotales = Math.ceil(orden.length / TOPE_ARCA);
    badge(
      'Validando ' + (hechosAhora + 1) + ' / ' + orden.length + (tandasTotales > 1 ? ' · tanda ' + tandaActual + ' de ' + tandasTotales : '') +
        '<br><span style="color:#8b949e">no cierres esta pestaña</span>',
      '#1f6feb',
    );

    var inp = inputCuil(), btn = btnAgregar();
    if (!inp || !btn) { badge('No encuentro el campo CUIL / Agregar.<br>¿Estás en “Registrar Nuevas Altas”?', '#d29922'); return; }
    inp.value = next.replace(/\D/g, '');
    setTimeout(function () { btn.click(); }, 250); // postback -> recarga -> corre de nuevo
  }

  // ======================= helpers comunes =======================
  function fmtCuil(x) {
    var d = (x || '').replace(/\D/g, '');
    return d.length === 11 ? d.slice(0, 2) + '-' + d.slice(2, 10) + '-' + d.slice(10) : '';
  }

  // ======================= llegar hasta la pantalla de altas =======================
  /**
   * Tope de saltos automáticos.
   *
   * Todo el ruteo de abajo son redirecciones, y una cadena de redirecciones puede cerrarse en
   * círculo — login → portal → Altas → sesión caída → login…—, por ejemplo si la clave fiscal no
   * tiene habilitado "Simplificación Registral" o si hay que elegir a qué empresa se representa.
   * Sin tope, eso es una pestaña rebotando para siempre. Con tope, el script se rinde y dice qué
   * hacer a mano, que es lo único útil llegado ese punto.
   */
  function puedeNavegar() {
    var v = g(K.nav, null);
    var ahora = Date.now();
    if (!v || typeof v !== 'object' || ahora - (v.t || 0) > 120000) v = { t: ahora, n: 0 };
    if (v.n >= 6) return false;
    s(K.nav, { t: v.t, n: v.n + 1 });
    return true;
  }
  function irA(url) {
    if (!puedeNavegar()) return false;
    setTimeout(function () { location.href = url; }, 900); // que el cartel se alcance a leer
    return true;
  }
  function faltanCuantos() {
    var orden = g(K.orden, []), hechos = g(K.hechos, {});
    return orden.filter(function (c) { return !(c in hechos); }).length;
  }
  function rendirse(quePasa) {
    badge(
      '⚠ ' + quePasa + '<br><span style="color:#8b949e">Entrá a mano a <b>Simplificación Registral → Registrar Nuevas Altas</b> (si representás a varias empresas, elegí una: la obra social se consulta por CUIL, sirve cualquiera).<br>' +
        'Quedan ' + faltanCuantos() + ' — apenas llegues sigo solo.</span>',
      '#d29922',
    );
  }

  /**
   * A dónde ir según dónde cayó la pestaña.
   *
   * El disparo desde WeProdu abre Altas.aspx directo, que es lo correcto cuando la sesión de ARCA
   * está viva. Cuando no lo está —el caso normal si hace rato que no se entra— ARCA rebota a
   * FinSession, y a partir de ahí este ruteo lleva solo hasta el login y de vuelta. La cola no se
   * toca en ningún momento: sobrevive al relogin y retoma donde quedó.
   */
  function rutearARCA() {
    if (isARCA && enAltas() && !sesionExpirada()) {
      s(K.nav, { t: Date.now(), n: 0 }); // llegamos: el presupuesto de saltos se renueva
      procesarARCA();
      return;
    }
    // Sin tanda en curso no se navega nada: nadie pidió ir a ningún lado.
    if (!g(K.active, false) && g(K.fase, '') !== 'limpiando') return;

    if (isAuth) {
      badge('🔑 Entrá con tu clave fiscal.<br><span style="color:#8b949e">Cuando estés adentro sigo solo con las ' + faltanCuantos() + ' que faltan. No leo ni guardo tu clave.</span>', '#1f6feb');
      return;
    }
    if (isPortal) {
      if (!irA(ARCA_ALTAS_URL)) return rendirse('No pude entrar solo a la pantalla de altas.');
      badge('✅ Sesión iniciada — voy a <b>Registrar Nuevas Altas</b>…', '#1f6feb');
      return;
    }
    // ARCA, pero fuera de Altas (FinSession, el menú, una pantalla intermedia).
    if (sesionExpirada()) {
      if (!irA(AFIP_LOGIN_URL)) return rendirse('La sesión de ARCA se venció y no pude volver solo al login.');
      badge('⏸ Se venció la sesión de ARCA — te llevo a iniciar sesión…<br><span style="color:#8b949e">Quedan ' + faltanCuantos() + '. Retomo apenas entres.</span>', '#d29922');
      return;
    }
    if (!irA(ARCA_ALTAS_URL)) rendirse('No pude entrar solo a la pantalla de altas.');
  }

  // ======================= arranque =======================
  if (isARCA || isAuth || isPortal) {
    setTimeout(rutearARCA, 400); // dar tiempo a que ARCA pinte la obra social precompletada
  } else {
    initWeprodu();
  }
})();
