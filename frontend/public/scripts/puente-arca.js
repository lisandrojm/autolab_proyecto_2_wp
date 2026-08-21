/*
  ============================================================================
  LA LÓGICA DEL PUENTE ARCA — este archivo es el que se toca.
  ============================================================================

  No es un userscript: no tiene cabecera ==UserScript== y Tampermonkey no lo
  instala. Lo trae y lo ejecuta la cáscara `weprodu-puente.user.js`, que está
  CONGELADA en v1.0.0 y no se toca nunca más.

  POR QUÉ ESTÁ PARTIDO EN DOS

  Tampermonkey chequea actualizaciones una vez por día, no al instante. Con la
  lógica adentro del .user.js, cada cambio subía la versión y dejaba al operador
  con un "tenés la vieja, hay una nueva" hasta que la actualizara a mano. Cinco
  veces seguidas. Tampermonkey está pensado para scripts estables, no para algo
  bajo iteración activa.

  Partido, iterar esto es como iterar cualquier archivo del front: se guarda, se
  recarga la página y listo. NO se sube ninguna versión y NO se reinstala nada.

  CÓMO SE EJECUTA

  La cáscara hace `new Function('GM_setValue','GM_getValue','GM_deleteValue','WEPRODU', <este texto>)`
  y lo invoca con las funciones GM y con `WEPRODU = { version, base }`. Por eso
  acá abajo se pueden usar GM_setValue/GM_getValue/GM_deleteValue como si fueran
  globales: son parámetros.

  La versión que reporta el pong es la de la CÁSCARA (congelada), no la de este
  archivo: es lo único que el operador tiene instalado y lo único que tendría
  sentido actualizar. `SELLO` es informativo, para saber qué copia está corriendo
  cuando se depura; no se compara contra nada y no dispara ningún aviso.

  El resto de la documentación —el contrato con WeProdu, la frontera del sandbox,
  el recorrido por ARCA— está en su sección, más abajo.
*/

(function () {
  'use strict';

  /*
    ======================= UNA SOLA INSTANCIA POR PESTAÑA =======================

    Con la cola viviendo en el almacén de Tampermonkey —compartido por TODOS los scripts instalados—
    dos instancias no son redundancia: son corrupción de estado. Las dos siembran, leen y pisan las
    mismas claves, y la tanda queda trabada en "Validando 20" con 0 validadas para siempre. Pasó de
    verdad, con tres copias conviviendo: el monolito viejo, el standalone y la cáscara.

    El lock va como ATRIBUTO DEL DOM y no como variable: cada script corre en su propio sandbox, así
    que una variable —por más global que parezca— no la ve el de al lado. El DOM es lo único
    compartido, que es la misma razón por la que todo el contrato con WeProdu se apoya en `document`.

    Ojo con lo que este lock NO puede hacer: una copia vieja SIN esta guarda igual va a arrancar. Por
    eso además se cuentan los pongs del lado de la app y se avisa en pantalla cuando hay más de uno
    (ver `probarExtension`): el lock evita que se peleen dos copias nuevas, el aviso es lo que hace
    que alguien vaya a borrar la vieja.
  */
  try {
    if (document.documentElement.getAttribute('data-weprodu-lock')) {
      console.info('[WeProdu] ya hay una instancia del puente activa en esta página: esta sale sin hacer nada.');
      return;
    }
    document.documentElement.setAttribute('data-weprodu-lock', String(Date.now()));
  } catch (e) {}

  /*
    DOS versiones, independientes entre sí y con nombres distintos a propósito:

     - CÁSCARA: el `.user.js` que Tampermonkey tiene instalado. Congelado en 1.0.0. Si cambiara, hay
       que reinstalar a mano: ESO sí merece un aviso.
     - LÓGICA (`SELLO`): este archivo, que se sirve aparte y cambia en cada iteración. Se actualiza
       solo al recargar la página, así que NO se avisa nada. Avisar por esto era exactamente el
       cartel que aparecía todo el tiempo sin nada que hacer al respecto.

    Nunca se comparan entre sí: son dos numeraciones que no tienen relación.
  */
  var CASCARA = (typeof WEPRODU !== 'undefined' && WEPRODU) || {};
  var VERSION = CASCARA.version || '1.0.0';
  var SELLO = '2026-08-20-1';
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
  /*
    EL PASO QUE FALTABA: la "sesión de trabajo".

    El cartel de ARCA dice dos cosas —«Su tiempo de sesión ha finalizado, O UD. NO HA INICIADO SU
    SESIÓN DE TRABAJO»— y todo este tiempo se leyó la primera. Es la segunda: Simplificación Registral
    no acepta deep-links. Entrar directo a Altas.aspx rebota a FinSession SIEMPRE, incluso con el
    navegador logueado, porque falta pasar por el selector de CUIT — que es lo que crea esa sesión de
    trabajo.

    El circuito obligatorio es: login → Simplificación Registral → IndexContribuyente (elegir el
    CUIT) → DatosBasicos → Relaciones Laborales → Altas. Por eso el destino de la pestaña que abre
    WeProdu es el SELECTOR y no la pantalla de altas: es el primer punto del recorrido que ARCA acepta
    desde afuera.

    Explica además por qué el error era constante y no intermitente, que es lo que mandó a buscar
    durante días una sesión vencida que nunca había existido.
  */
  var ARCA_SELECTOR_URL = 'https://serviciossegsoc.afip.gob.ar/tramites_con_clave_fiscal/MiSimplificacion/app/login/IndexContribuyente.aspx';
  var AFIP_LOGIN_URL = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';
  /** El portal de clave fiscal: la puerta de entrada si ni siquiera el selector se deja abrir. */
  var AFIP_PORTAL_URL = 'https://portalcf.cloud.afip.gob.ar/portal/app/';
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
    // [{nombre, cuit}] — las empleadoras de la tanda. Sirven para decir CUÁL CUIT elegir en el
    // selector y para resaltarlo en la lista: "elegí el CUIT" a secas, con cinco representadas
    // adelante, no alcanza.
    empleadoras: 'os_empleadoras',
    // Cuántas veces ya se intentó elegir el CUIT solo. Un click contra AFIP que no surte efecto no
    // se reintenta: si la página vuelve al selector, se frena y se avisa. Un bucle de clicks contra
    // el organismo es exactamente lo que no queremos.
    autocuit: 'os_autocuit',
  };
  function g(k, d) { try { return GM_getValue(k, d); } catch (e) { return d; } }
  function s(k, v) { try { GM_setValue(k, v); } catch (e) {} }

  var isARCA = location.hostname.indexOf(ARCA_HOST) >= 0;
  var isAuth = location.hostname.indexOf(AUTH_HOST) >= 0;
  var isPortal = location.hostname.indexOf(PORTAL_HOST) >= 0;
  /**
   * ¿Estamos en la pantalla donde el script trabaja de verdad? El resto del recorrido es solo llegar.
   *
   * Se pregunta primero por el DOM y recién después por la URL: lo que importa es que esté el campo
   * de CUIL —eso es la pantalla de altas—, y atarlo solo a un patrón de URL haría que cualquier
   * cambio de ruta de ARCA se lea como "no estamos ahí" y dispare una redirección en vez de trabajar.
   */
  function enAltas() { return !!inputCuil() || /RelacionLaboral\/Altas\.aspx/i.test(location.pathname || ''); }

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
      /*
        El detalle acepta dos formas: el array de pedidos de siempre, y `{pedidos, empleadoras}`, que
        agrega de qué empleadora es la tanda. Las dos porque el evento lo emite la app y la app se
        deploya aparte: un front viejo tiene que seguir arrancando una corrida igual, solo que sin
        poder decir qué CUIT elegir en el selector.
      */
      var detalle = (ev && ev.detail) || [];
      var lista = Array.isArray(detalle) ? detalle : detalle.pedidos || [];
      var empleadoras = Array.isArray(detalle) ? [] : detalle.empleadoras || [];
      var cuils = [], orden = [];
      lista.forEach(function (it) {
        var c = fmtCuil(it.cuil);
        if (c) { cuils.push({ cuil: c, contractId: it.contractId }); orden.push(c); }
      });
      if (!cuils.length) return;
      s(K.empleadoras, empleadoras);
      s(K.autocuit, 0); // tanda nueva: se vuelve a permitir elegir el CUIT solo
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
    // `shell` y `logica` con nombres propios. `version` se mantiene solo para que una app vieja no se
    // quede sin nada que leer; la app nueva compara `shell` y NUNCA `logica`.
    escuchar('weprodu-os-ping', function () { emitir('weprodu-os-pong', { shell: VERSION, logica: SELLO, version: VERSION, base: CASCARA.base || '' }); });

    /*
      5) Reiniciar: vaciar el almacén compartido.

      La cola se puede envenenar —dos copias peleándose por las mismas claves, una corrida cortada a
      la mitad, un ARCA que nunca contestó— y el estado queda inconsistente sin ninguna forma de
      salir salvo desinstalar el script. Esto lo limpia entero desde la app, sin tocar nada más: no
      hay dato que se pierda, porque lo único que vive acá es el progreso de la tanda en curso.
    */
    escuchar('weprodu-os-reset', function () {
      Object.keys(K).forEach(function (k) { try { GM_deleteValue(K[k]); } catch (e) {} });
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      emitir('weprodu-os-reset-ok', { shell: VERSION });
    });

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
  /*
    Antes había acá un `rendirse()` con un texto único para cualquier atasco. Se sacó: cada pantalla
    del recorrido falla por un motivo distinto y necesita una instrucción distinta, y el mensaje
    genérico —"entrá a mano a Registrar Nuevas Altas"— era justamente el que omitía el paso que
    faltaba, elegir el CUIT. Ahora el cartel lo arma cada rama de `rutearARCA`.
  */

  /** Las empleadoras de la tanda, como texto para los carteles. */
  function empleadorasTexto() {
    var e = g(K.empleadoras, []) || [];
    if (!e.length) return '';
    return e
      .map(function (x) {
        var cuit = String(x.cuit || '').replace(/\D/g, '');
        return (x.nombre || '') + (cuit ? ' (' + fmtCuil(cuit) + ')' : '');
      })
      .join(' o ');
  }

  /**
   * ¿Ya se validó alguna en esta tanda?
   *
   * Es lo que separa dos problemas que hoy dicen lo mismo y mandan a lugares distintos: si no se
   * validó ninguna, nunca hubo sesión de trabajo —falta elegir el CUIT—; si ya había validadas, la
   * sesión existió y se venció. El texto tiene que decir cuál de los dos es.
   */
  function yaEmpezo() {
    return Object.keys(g(K.hechos, {}) || {}).length > 0;
  }

  /**
   * Resalta a la empleadora de la tanda en el selector de CUIT.
   *
   * En una cuenta que representa a varias empresas, "elegí el CUIT" no alcanza: hay que decir CUÁL y,
   * mejor, señalarlo. Se busca por CUIT (los dígitos, en cualquier formato) y si no, por nombre.
   */
  function resaltarEmpleadora() {
    var lista = g(K.empleadoras, []) || [];
    if (!lista.length) return false;
    var candidatos = document.querySelectorAll('tr, li, a, option, label, div.row');
    var encontrado = false;
    for (var i = 0; i < candidatos.length && !encontrado; i++) {
      var txt = (candidatos[i].textContent || '').trim();
      if (!txt || txt.length > 300) continue; // un contenedor grande "contiene" todo: no sirve
      for (var j = 0; j < lista.length; j++) {
        var cuit = String(lista[j].cuit || '').replace(/\D/g, '');
        var nombre = String(lista[j].nombre || '').trim();
        var pega = (cuit && txt.replace(/\D/g, '').indexOf(cuit) >= 0) || (nombre.length > 3 && txt.toUpperCase().indexOf(nombre.toUpperCase()) >= 0);
        if (!pega) continue;
        try {
          candidatos[i].style.outline = '3px solid #1f6feb';
          candidatos[i].style.background = 'rgba(31,111,235,.12)';
          candidatos[i].scrollIntoView({ block: 'center' });
        } catch (e) {}
        encontrado = true;
        break;
      }
    }
    return encontrado;
  }

  function enFinSession() { return /FinSession\.aspx/i.test(location.pathname || '') || sesionExpirada(); }
  function enSelectorCuit() { return /IndexContribuyente\.aspx/i.test(location.pathname || ''); }

  /*
    ===========================================================================
    LOS DOS BOTONES «Aceptar». SE LLAMAN IGUAL Y NO SON LO MISMO.
    ===========================================================================

      PANTALLA                                  «Aceptar»     QUÉ HACE
      ----------------------------------------  ------------  ---------------------------------------
      IndexContribuyente.aspx (selector CUIT)   ✅ seguro     Entra al servicio con ese CUIT.
                                                              Navegación pura, reversible, no registra
                                                              nada ante el organismo.
      Altas.aspx (formulario de altas)          🔴 PROHIBIDO  REGISTRA LAS ALTAS ANTE ARCA. Irreversible.

    Este script aprieta el PRIMERO y NUNCA el segundo. Confundirlos es el peor error posible de todo
    el proyecto: daría de alta relaciones laborales de verdad, a nombre de una empresa real, sin que
    nadie lo haya pedido.

    Por eso `elegirEmpleadora` chequea ELLA MISMA en qué pantalla está antes de tocar nada, además de
    que solo se la llame desde la rama del selector. Es redundante a propósito: la única protección
    que sirve acá es la que no depende de que quien llame se acuerde.
  */

  /**
   * Elige la empleadora en el selector de CUIT y entra al servicio.
   *
   * Es el último paso manual que quedaba además del login, y no tenía por qué serlo: elegir el CUIT
   * no registra nada, solo define bajo qué empresa se opera.
   *
   * Devuelve 'ok' | 'sin_lista' | 'no_esta' | 'sin_boton' — el motivo importa: "tu clave no tiene
   * acceso a esa empresa" y "no encontré el botón" mandan a hacer cosas distintas.
   */
  function elegirEmpleadora(cuitObjetivo) {
    if (!enSelectorCuit()) return 'sin_lista'; // guard de pantalla: ver el comentario de arriba
    var sel = document.querySelector('select');
    if (!sel || !sel.options || !sel.options.length) return 'sin_lista';

    var idx = -1;
    for (var i = 0; i < sel.options.length; i++) {
      // El texto de la opción suele venir "30-71029583-9 - FZERO S.R.L": se compara por dígitos y
      // desde el principio, para no pegarle a un CUIT que aparezca en el medio del nombre.
      if (String(sel.options[i].text || '').replace(/\D/g, '').indexOf(cuitObjetivo) === 0) { idx = i; break; }
    }
    if (idx < 0) return 'no_esta'; // no está en la lista: se avisa, no se adivina

    sel.selectedIndex = idx;
    try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {} // ASP.NET puede escucharlo

    // ✅ El «Aceptar» de ESTA pantalla (selector de CUIT): seguro, solo entra al servicio.
    //    NO es el de Altas.aspx, que registra altas. Ver la tabla de arriba.
    var btn = botonPorRotulo(/^Aceptar$/i);
    if (!btn) return 'sin_boton';
    setTimeout(function () { btn.click(); }, 200);
    return 'ok';
  }

  /**
   * Qué hacer según dónde cayó la pestaña.
   *
   * El recorrido de ARCA no se puede saltear (ver `ARCA_SELECTOR_URL`), así que el script no intenta
   * forzarlo: acompaña. En cada pantalla dice qué falta y espera; donde puede avanzar solo, avanza.
   *
   * LA COLA NO SE DESCARTA NUNCA mientras tanto. Antes el operador veía un error y no tenía forma de
   * saber que su tanda seguía viva: volvía a WeProdu y la mandaba de nuevo. Ahora cada cartel dice
   * cuántas quedan esperando, y arrancan solas al llegar a la pantalla correcta.
   */
  function rutearARCA() {
    if (isARCA && enAltas() && !sesionExpirada()) {
      // Llegamos: se renuevan los dos presupuestos —saltos y auto-selección de CUIT— porque el
      // recorrido funcionó. Si más tarde se cae la sesión, la próxima vuelta puede volver a intentarlo.
      s(K.nav, { t: Date.now(), n: 0 });
      s(K.autocuit, 0);
      procesarARCA();
      return;
    }
    // Sin tanda en curso no se dice nada: nadie pidió ir a ningún lado.
    if (!g(K.active, false) && g(K.fase, '') !== 'limpiando') return;

    var quedan = faltanCuantos();
    var quien = empleadorasTexto();
    var pasos =
      '<span style="color:#8b949e">1. Entrá a <b>Simplificación Registral - Empleadores</b>.<br>' +
      '2. <b>Elegí el CUIT' +
      (quien ? ' de ' + quien : '') +
      '</b> — sin este paso ARCA rechaza la pantalla de altas.<br>' +
      '3. <b>Relaciones Laborales → Registrar Nuevas Altas</b>. Arranco solo.<br>' +
      'La tanda de ' + quedan + ' sigue en espera.</span>';

    if (isAuth) {
      badge('🔑 Entrá con tu clave fiscal.<br>' + pasos, '#1f6feb');
      return;
    }
    if (isPortal) {
      badge('✅ Estás en el portal. Entrá a <b>Simplificación Registral - Empleadores</b>.<br>' + pasos, '#1f6feb');
      return;
    }
    if (enSelectorCuit()) {
      var lista = g(K.empleadoras, []) || [];
      var unaSola = lista.length === 1 ? lista[0] : null;
      var cuitObjetivo = unaSola ? String(unaSola.cuit || '').replace(/\D/g, '') : '';
      var intentos = Number(g(K.autocuit, 0)) || 0;

      /*
        Se elige sola SOLO con una empleadora y un CUIT concreto. Con varias no se adivina: una tanda
        es siempre de una sola empleadora, así que si llegan dos es que algo más arriba salió mal y
        elegir cualquiera sería operar bajo la empresa equivocada.
      */
      if (unaSola && cuitObjetivo.length === 11 && intentos === 0) {
        s(K.autocuit, 1);
        var r = elegirEmpleadora(cuitObjetivo);
        if (r === 'ok') {
          badge('⏳ Entrando como <b>' + (unaSola.nombre || fmtCuil(cuitObjetivo)) + '</b>…<br><span style="color:#8b949e">Después voy solo a Registrar Nuevas Altas. Quedan ' + quedan + '.</span>', '#1f6feb');
          return;
        }
        if (r === 'no_esta') {
          // Problema de permisos del organismo, no del script: no hay nada que reintentar.
          badge(
            '🚫 Tu clave fiscal no tiene acceso a <b>' + (unaSola.nombre || '') + '</b> (' + fmtCuil(cuitObjetivo) + ').<br>' +
              '<span style="color:#8b949e">Pedí la delegación de ese CUIT o entrá con otra clave. La tanda de ' + quedan + ' queda esperando.</span>',
            '#d29922',
          );
          return;
        }
        // 'sin_lista' / 'sin_boton': la pantalla no es la que esperábamos. Se cae al cartel manual.
      }

      var resaltado = resaltarEmpleadora();
      badge(
        '👉 <b>Elegí ' + (quien || 'el CUIT de la empleadora') + '</b>' +
          (resaltado ? ' — te lo marqué en la lista.' : '.') +
          (intentos > 0 ? '<br><span style="color:#d29922">Intenté elegirlo solo y la pantalla volvió acá: seguí a mano, no insisto para no quedar apretando botones contra ARCA.</span>' : '') +
          '<br><span style="color:#8b949e">Este es el paso que inicia la sesión de trabajo. Después entrá a <b>Relaciones Laborales → Registrar Nuevas Altas</b> y sigo solo con las ' +
          quedan +
          ' que faltan.</span>',
        '#1f6feb',
      );
      return;
    }
    if (enFinSession()) {
      /*
        Los dos casos que hasta ahora decían lo mismo. Sin ninguna validada, la sesión de trabajo
        nunca existió —falta elegir el CUIT—; con validadas, existió y se venció. Mandan al mismo
        lugar pero la explicación cambia, y la equivocada hace buscar donde no está.
      */
      var titulo = yaEmpezo()
        ? '⏸ Se venció la sesión de ARCA. Volvé a entrar y elegí el CUIT' + (quien ? ' de ' + quien : '') + ' — quedan ' + quedan + '.'
        : '⚠ Falta iniciar la <b>sesión de trabajo</b>: ARCA no deja entrar directo a la pantalla de altas.';
      /*
        Escalera de destinos, del más específico al más general, según cuántas veces ya rebotamos.

        No se puede saber de antemano cuál acepta ARCA —depende de si hay clave fiscal puesta y de
        cuánto tolera cada pantalla que se entre desde afuera—, así que se prueba en orden en vez de
        fijar uno a ciegas: selector de CUIT → login → portal. Sin esto, con el navegador deslogueado
        el selector y FinSession se rebotan entre ellos hasta agotar el tope de saltos.
      */
      var saltos = (g(K.nav, null) || {}).n || 0;
      var destino = saltos < 2 ? ARCA_SELECTOR_URL : saltos < 4 ? AFIP_LOGIN_URL : AFIP_PORTAL_URL;
      var comoSeLlama = saltos < 2 ? 'al selector de CUIT' : saltos < 4 ? 'al login de clave fiscal' : 'al portal de AFIP';
      if (!irA(destino)) {
        badge(titulo + '<br>' + pasos, '#d29922');
        return;
      }
      badge(titulo + '<br><span style="color:#8b949e">Te llevo ' + comoSeLlama + '…</span>', '#d29922');
      return;
    }
    /*
      Otra pantalla interna de ARCA (DatosBasicos, un menú). Acá la sesión de trabajo YA está: el
      selector se pasó. Así que se intenta el salto a Altas, que es lo único que falta; si ARCA lo
      rechaza igual, el tope de saltos corta y queda el instructivo.
    */
    if (!irA(ARCA_ALTAS_URL)) {
      badge('👉 Andá a <b>Relaciones Laborales → Registrar Nuevas Altas</b>.<br>' + pasos, '#d29922');
      return;
    }
    badge('✅ Sesión de trabajo iniciada — voy a <b>Registrar Nuevas Altas</b>…<br><span style="color:#8b949e">Quedan ' + quedan + '.</span>', '#1f6feb');
  }

  // ======================= arranque =======================
  if (isARCA || isAuth || isPortal) {
    setTimeout(rutearARCA, 400); // dar tiempo a que ARCA pinte la obra social precompletada
  } else {
    initWeprodu();
  }
})();
