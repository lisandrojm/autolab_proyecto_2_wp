// ==UserScript==
// @name         WeProdu — Constatar obras sociales en ARCA
// @namespace    weprodu
// @version      1.2
// @description  Recorre una lista de CUIL en Registrar Nuevas Altas, lee la obra social que ARCA precompleta y devuelve CUIL,RNOS. No confirma ninguna alta.
// @match        https://serviciossegsoc.afip.gob.ar/tramites_con_clave_fiscal/MiSimplificacion/app/Contribuyente/RelacionLaboral/Altas.aspx*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
  QUÉ HACE
  - Vos te logueás a mano en AFIP y llegás a "Registrar Nuevas Altas".
  - Apretás el botón flotante "▶ Constatar obras sociales", pegás los CUIL (uno por línea).
  - El script, por cada CUIL: lo escribe, aprieta "Agregar", espera el postback de ASP.NET
    (que recarga la página), y en la recarga lee la obra social que ARCA precompletó.
  - Cuando termina, te muestra el resultado CUIL,RNOS para copiar y pegar en WeProdu.

  IMPORTANTE
  - NUNCA aprieta "Aceptar". Solo escribe, Agrega y lee. No registra ninguna alta. `btnAgregar()`
    exige que el rótulo sea exactamente "Agregar", y es el único control que se clickea.
  - La cola vive en localStorage y el script se re-ejecuta en cada recarga: por eso sobrevive los
    postbacks. Es reanudable: si recargás a mano, sigue donde iba.
  - No guarda ni ve tu clave fiscal. Corre en la sesión que vos abriste.

  TRES COSAS QUE NUNCA SE RESUELVEN ADIVINANDO
  Lo que este script devuelve se guarda FIJO, con candado, en WeProdu: un dato mal leído no se
  corrige solo. Por eso hay tres casos donde prefiere frenar o excluir antes que suponer:

    1. Sesión vencida  -> frena y conserva la cola. Ver `sesionExpirada()`.
    2. Fila que no apareció -> va a `errores`, NO se exporta como vacío. Ver el paso 2 de `procesar()`.
    3. Emparejamiento ambiguo -> frena. Ver `cuilDeLaFila()`.

  Un vacío en el pegado significa "ARCA dijo que esta persona no tiene obra social", y WeProdu lo
  aplica como tal. Solo se emite cuando la fila apareció y el campo vino en blanco.
*/

(function () {
  'use strict';

  var KEY = '__weprodu_os_v1';

  // ---------- estado ----------
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
  }
  function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
  function clear() { localStorage.removeItem(KEY); }

  // ---------- helpers de la página ----------
  var RE_CUIL = /\d{2}-\d{8}-\d/g;

  function inputCuil() {
    return document.getElementById('ctl00_ContentPlaceHolder1_InputCuil_txtCuil');
  }
  /* Se busca por rótulo y no por id: el id generado por WebForms cambia más que el texto del botón.
     El `^Agregar$` es exacto a propósito — es lo único que este script tiene permitido apretar. */
  function btnAgregar() {
    var cands = document.querySelectorAll('input[type=submit],input[type=button],button');
    for (var i = 0; i < cands.length; i++) {
      var t = (cands[i].value || cands[i].textContent || '').trim();
      if (/^Agregar$/i.test(t)) return cands[i];
    }
    return null;
  }

  /*
    ¿Se cayó la sesión de ARCA?

    Dura poco —se vence en medio de una tanda de 20 con toda naturalidad— y al vencerse la página
    pasa a "Su tiempo de sesión ha finalizado". Sin detectarlo, el Agregar no produce fila y el CUIL
    en curso se contabilizaría como problema suyo cuando en realidad no se pudo consultar. Detectado,
    se frena sin tocar los pendientes: la cola sobrevive al relogin y el script retoma solo.
  */
  function sesionExpirada() {
    if (inputCuil()) return false; // si está el campo de CUIL, la sesión vive
    var txt = (document.body.textContent || '');
    return /sesi[oó]n ha finalizado|no ha iniciado su sesi[oó]n|ingrese con su clave fiscal/i.test(txt);
  }

  /*
    Encuentra el CUIL de la fila a la que pertenece ESTE input de obra social.
    Sube por los ancestros hasta el primero que contenga exactamente UN CUIL.

    El "exactamente uno" es el punto. Subir hasta el primer texto que parezca un CUIL es lo natural,
    pero si el ancestro se pasa de tamaño —salta de la fila al tbody— su textContent tiene todos los
    CUIL de la grilla y el primero es el de OTRA persona. Ahí cada input de obra social se emparejaría
    con el mismo CUIL y las obras sociales quedarían corridas, con todas las filas viéndose bien.
    Si aparecen dos o más, es ambiguo y se devuelve null: el llamador frena la corrida.
  */
  function cuilDeLaFila(osInput) {
    var node = osInput;
    for (var up = 0; up < 8 && node.parentElement; up++) {
      node = node.parentElement;
      var todos = (node.textContent || '').match(RE_CUIL) || [];
      if (todos.length === 1) return todos[0];
      if (todos.length > 1) return null; // ancestro demasiado grande: no se adivina
    }
    return null;
  }

  // Devuelve { filas: { "27-40073687-7": "901402", ... }, ambiguas: n } de las filas ya agregadas.
  function leerFilas() {
    var out = {}, ambiguas = 0;
    var osInputs = document.querySelectorAll('input[id*="ExtendCodeOS_AutocompleteText"]');
    for (var i = 0; i < osInputs.length; i++) {
      var os = osInputs[i];
      var cuil = cuilDeLaFila(os);
      if (!cuil) { ambiguas++; continue; }
      // El código real vive en el input oculto `_AutocompleteValue`; el visible trae la descripción.
      var code = '';
      var valEl = document.getElementById(os.id.replace('_AutocompleteText', '_AutocompleteValue'));
      if (valEl && valEl.value) code = valEl.value.replace(/\D/g, '');
      if (!code) code = (os.value || '').replace(/\D/g, '');
      out[cuil] = code; // '' es válido: ARCA no tiene obra social para esa persona
    }
    return { filas: out, ambiguas: ambiguas };
  }

  function soloDigitos(c) { return (c || '').replace(/\D/g, ''); }
  function fmtCuil(d) {
    d = soloDigitos(d);
    return d.length === 11 ? d.slice(0, 2) + '-' + d.slice(2, 10) + '-' + d.slice(10) : d;
  }

  // ---------- UI flotante ----------
  function badge(txt, color) {
    var b = document.getElementById('__weprodu_badge');
    if (!b) {
      b = document.createElement('div');
      b.id = '__weprodu_badge';
      b.style.cssText = 'position:fixed;z-index:999999;right:16px;bottom:16px;background:#161b22;color:#e6edf3;' +
        'font:13px system-ui;padding:10px 14px;border-radius:8px;border:1px solid #30363d;box-shadow:0 8px 24px rgba(0,0,0,.4);max-width:340px';
      document.body.appendChild(b);
    }
    b.style.borderColor = color || '#30363d';
    b.innerHTML = txt;
    return b;
  }

  function botonInicio() {
    if (document.getElementById('__weprodu_start')) return;
    var btn = document.createElement('button');
    btn.id = '__weprodu_start';
    btn.textContent = '▶ Constatar obras sociales';
    btn.style.cssText = 'position:fixed;z-index:999999;right:16px;bottom:16px;background:#1f6feb;color:#fff;' +
      'font:13px system-ui;padding:10px 14px;border:none;border-radius:8px;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.4)';
    btn.onclick = pedirCuils;
    document.body.appendChild(btn);
  }

  function pedirCuils() {
    var b = document.getElementById('__weprodu_start');
    if (b) b.remove();
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(1,4,9,.7);display:flex;align-items:center;justify-content:center';
    ov.innerHTML =
      '<div style="background:#161b22;border:1px solid #30363d;border-radius:12px;width:440px;padding:18px;font:13px system-ui;color:#e6edf3">' +
      '<div style="font-size:16px;font-weight:600;margin-bottom:8px">Pegá los CUIL a constatar</div>' +
      '<div style="color:#8b949e;margin-bottom:10px">Uno por línea. Con o sin guiones. Copialos desde WeProdu.</div>' +
      '<textarea id="__weprodu_ta" style="width:100%;height:150px;background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font:12px ui-monospace,monospace;padding:8px"></textarea>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">' +
      '<button id="__weprodu_cancel" style="background:transparent;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:7px 13px;cursor:pointer">Cancelar</button>' +
      '<button id="__weprodu_go" style="background:#238636;border:none;color:#fff;border-radius:6px;padding:7px 13px;cursor:pointer">Empezar</button>' +
      '</div></div>';
    document.body.appendChild(ov);
    document.getElementById('__weprodu_cancel').onclick = function () { ov.remove(); botonInicio(); };
    document.getElementById('__weprodu_go').onclick = function () {
      var raw = document.getElementById('__weprodu_ta').value || '';
      var lista = [];
      raw.split(/\s+/).forEach(function (tok) {
        var d = soloDigitos(tok);
        if (d.length === 11) lista.push(fmtCuil(d));
      });
      lista = lista.filter(function (v, i) { return lista.indexOf(v) === i; }); // dedupe
      ov.remove();
      if (!lista.length) { badge('No encontré CUIL válidos.', '#d29922'); botonInicio(); return; }
      save({ active: true, orden: lista.slice(), pendientes: lista.slice(), hechos: {}, errores: {}, last: null });
      procesar();
    };
  }

  function mostrarResultado(s) {
    var err = s.errores || {};
    // Solo se exporta lo que ARCA efectivamente contestó. Los que fallaron NO van: una línea
    // `CUIL,` vacía se aplica como "no tiene obra social" y queda sellada con candado.
    var exportables = s.orden.filter(function (c) { return !err[c]; });
    var texto = exportables.map(function (c) { return c + ',' + (s.hechos[c] || ''); }).join('\n');
    var conOS = exportables.filter(function (c) { return s.hechos[c]; }).length;
    var sinOS = exportables.length - conOS;
    var fallidos = s.orden.filter(function (c) { return err[c]; });

    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(1,4,9,.7);display:flex;align-items:center;justify-content:center';
    ov.innerHTML =
      '<div style="background:#161b22;border:1px solid #30363d;border-radius:12px;width:460px;padding:18px;font:13px system-ui;color:#e6edf3">' +
      '<div style="font-size:16px;font-weight:600;margin-bottom:6px">Listo — ' + exportables.length + ' constatadas</div>' +
      '<div style="color:#8b949e;margin-bottom:10px">' + conOS + ' con obra social · ' + sinOS + ' sin afiliación (queda la del convenio). Copiá y pegá en WeProdu.</div>' +
      (fallidos.length
        ? '<div style="color:#d29922;margin-bottom:10px;font-size:12px">⚠ ' + fallidos.length + ' no se pudieron consultar y NO van en el pegado (quedan sin constatar): ' + fallidos.join(', ') + '</div>'
        : '') +
      '<textarea id="__weprodu_out" readonly style="width:100%;height:170px;background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font:12px ui-monospace,monospace;padding:8px"></textarea>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">' +
      '<button id="__weprodu_close" style="background:transparent;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:7px 13px;cursor:pointer">Cerrar</button>' +
      '<button id="__weprodu_copy" style="background:#238636;border:none;color:#fff;border-radius:6px;padding:7px 13px;cursor:pointer">Copiar</button>' +
      '</div></div>';
    document.body.appendChild(ov);
    document.getElementById('__weprodu_out').value = texto;
    document.getElementById('__weprodu_close').onclick = function () { ov.remove(); };
    document.getElementById('__weprodu_copy').onclick = function () {
      var ta = document.getElementById('__weprodu_out'); ta.select();
      try { navigator.clipboard.writeText(texto); } catch (e) { document.execCommand('copy'); }
      document.getElementById('__weprodu_copy').textContent = '✓ copiado';
    };
  }

  // ---------- máquina de estados, corre en cada carga ----------
  function procesar() {
    var s = load();
    if (!s || !s.active) { botonInicio(); return; }

    // 0) ¿se venció la sesión de ARCA? -> PARAR sin tocar los pendientes.
    //    La cola queda guardada: cuando el operador vuelve a loguearse y reabre Registrar Nuevas
    //    Altas, el script retoma solo desde donde iba. Esto va PRIMERO, antes de cosechar o de
    //    marcar nada: con la sesión caída, todo lo que se dedujera del DOM sería falso.
    if (sesionExpirada()) {
      badge('⏸ Se venció la sesión de ARCA.<br>' +
            '<span style="color:#8b949e">Volvé a loguearte y reabrí “Registrar Nuevas Altas”.<br>' +
            'Quedan ' + s.pendientes.length + ' por constatar — el script sigue solo.</span>', '#d29922');
      return; // NO marcar nada
    }

    // 1) leer todo lo que ya está agregado y guardarlo (idempotente)
    var lectura = leerFilas();
    var filas = lectura.filas;

    // Emparejamiento ambiguo: se FRENA. Seguir significaría exportar obras sociales posiblemente
    // corridas, y del otro lado se guardan fijas con candado.
    if (lectura.ambiguas > 0) {
      s.active = false;
      save(s);
      badge('⚠ Frené: no pude emparejar ' + lectura.ambiguas + ' fila(s) con su CUIL.<br>' +
            '<span style="color:#8b949e">La estructura de la grilla cambió. No exporto nada dudoso: revisá la página.</span>', '#d29922');
      return;
    }

    Object.keys(filas).forEach(function (cuil) {
      if (s.orden.indexOf(cuil) >= 0) s.hechos[cuil] = filas[cuil];
    });
    s.pendientes = s.pendientes.filter(function (c) { return !(c in filas); });

    // 2) ¿quedan pendientes?
    if (s.pendientes.length) {
      var next = s.pendientes[0];

      // Intenté `next` la vuelta pasada y NO apareció como fila, con la sesión viva: es un problema
      // de ESE CUIL en ARCA (inválido, ya con relación activa, un popup). Se marca ERROR y se sigue.
      // NUNCA vacío: vacío significa "ARCA dijo que no tiene obra social", y eso solo se sabe si la
      // fila apareció. Marcarlo vacío sellaría con candado un dato falso.
      if (s.last === next && !(next in filas)) {
        s.errores = s.errores || {};
        s.errores[next] = true;
        s.pendientes.shift();
        s.last = null;
        save(s);
        return procesar(); // seguir con el siguiente sin recargar
      }

      s.last = next;
      save(s);
      badge('Constatando… ' + (s.orden.length - s.pendientes.length + 1) + ' / ' + s.orden.length +
            '<br><span style="color:#8b949e">no cierres esta pestaña</span>', '#1f6feb');

      var inp = inputCuil(), btn = btnAgregar();
      if (!inp || !btn) {
        badge('No encuentro el campo CUIL o el botón Agregar.<br>¿Estás en “Registrar Nuevas Altas”?', '#d29922');
        return;
      }
      inp.value = soloDigitos(next);      // ARCA acepta los 11 dígitos sin guiones
      setTimeout(function () { btn.click(); }, 250); // dispara el postback -> recarga -> vuelve a correr
      return;
    }

    // 3) sin pendientes -> terminar
    s.active = false;
    save(s);
    badge('✓ Constatación completa', '#238636');
    mostrarResultado(s);
    clear();
  }

  // arranque: dar un instante a que ARCA pinte las obras sociales precompletadas
  setTimeout(procesar, 400);
})();
