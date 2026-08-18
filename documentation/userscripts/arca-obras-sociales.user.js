// ==UserScript==
// @name         WeProdu — Constatar obras sociales en ARCA
// @namespace    weprodu
// @version      2.0.0
// @description  Recorre una lista de CUIL en Registrar Nuevas Altas y junta la obra social que ARCA precompleta. NO confirma el alta.
// @match        https://serviciossegsoc.afip.gob.ar/tramites_con_clave_fiscal/MiSimplificacion/app/Contribuyente/RelacionLaboral/Altas.aspx*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * QUÉ HACE
 * --------
 * Automatiza el tipeo de la constatación: por cada CUIL de una cola lo escribe, aprieta Agregar, y
 * cuando la página vuelve del postback lee la obra social que ARCA precompletó para esa fila. Al
 * terminar deja `CUIL,RNOS` en el portapapeles para pegarlo en WeProdu.
 *
 * POR QUÉ CORRE ACÁ Y NO EN EL SERVER
 * -----------------------------------
 * Porque WeProdu NO guarda la clave fiscal, y esa es la decisión, no una limitación pendiente: el
 * login manual es lo que garantiza que el sistema nunca toca la credencial de AFIP —que no da acceso
 * a esta pantalla, da acceso a toda la identidad tributaria de quien la posee—. El script corre
 * dentro de la sesión que la persona ya abrió. Si algún día alguien propone guardar la clave "para
 * automatizar el login", esa es otra decisión y hay que tomarla a propósito.
 *
 * LO QUE NO HACE, Y POR QUÉ ESTÁ ESCRITO ASÍ
 * ------------------------------------------
 * Esta pantalla DA DE ALTA relaciones laborales ante el organismo. Un script suelto acá puede
 * registrar altas reales, masivas e irreversibles. Por eso el permiso es LISTA BLANCA:
 *
 *   - `accionar()` es la ÚNICA función que dispara un control, y solo acepta el que pasó por
 *     `esBotonAgregar()`.
 *   - `esBotonAgregar()` exige que el value sea exactamente "Agregar" y rechaza cualquier cosa que
 *     mencione aceptar / confirmar / registrar / grabar / enviar / finalizar.
 *   - Nunca se llama a `__doPostBack` ni a `form.submit()`: eso saltearía el filtro.
 *
 * Si ARCA cambia el flujo y Agregar pasa a confirmar el alta, este script deja de ser seguro. Antes
 * de tocar `BOTON_AGREGAR`, verificá en la pantalla qué hace el botón nuevo.
 */

(function () {
  "use strict";

  const CLAVE = "__os_cola";
  const VERSION_ESTADO = 2;
  /** Margen para que el autocompletado de la obra social termine de pintar antes de leer. */
  const DELAY_LECTURA_MS = 450;

  const BOTON_AGREGAR = /^agregar$/i;
  const PROHIBIDO = /acept|confirm|registr|grab|enviar|guardar|finaliz/i;

  const SEL_CUIL = "#ctl00_ContentPlaceHolder1_InputCuil_txtCuil";
  /** Un input por fila ya agregada. El id trae el `ctlNN` que identifica a esa fila. */
  const SEL_OS = 'input[id*="ExtendCodeOS_AutocompleteText"]';
  const RE_CUIL_FILA = /(\d{2}-\d{8}-\d)\s*-\s*(.+)/;
  const RE_CTL = /ctl(\d+)/i;

  const digitos = (s) => String(s || "").replace(/\D/g, "");
  const conGuiones = (c) => (digitos(c).length === 11 ? `${digitos(c).slice(0, 2)}-${digitos(c).slice(2, 10)}-${digitos(c).slice(10)}` : String(c || ""));

  // --- Estado: fuera del DOM ---------------------------------------------------------------------
  // Cada Agregar es un `__doPostBack` que recarga la página entera: cualquier variable en memoria se
  // pierde. La cola vive en localStorage y el script se re-ejecuta y retoma en cada carga.
  const leer = () => {
    try {
      const e = JSON.parse(localStorage.getItem(CLAVE) || "null");
      return e && e.v === VERSION_ESTADO ? e : null;
    } catch {
      return null;
    }
  };
  const guardar = (e) => localStorage.setItem(CLAVE, JSON.stringify({ ...e, v: VERSION_ESTADO }));
  const limpiar = () => localStorage.removeItem(CLAVE);

  // --- Lectura de la grilla ----------------------------------------------------------------------
  /**
   * Empareja cada CUIL ya agregado con su obra social.
   *
   * NO se usa el índice de posición del input: el orden documental de los inputs de OS no tiene por
   * qué coincidir fila a fila con los encabezados, y un desfasaje de uno asignaría la obra social de
   * una persona a otra — un error que después nadie encuentra, porque las dos filas se ven bien.
   * Se usa el `ctlNN` del id como clave, y el CUIL se busca en el contenedor de esa misma fila.
   */
  const leerFilas = () => {
    const out = {};
    for (const input of document.querySelectorAll(SEL_OS)) {
      const ctl = (input.id.match(RE_CTL) || [])[1];
      // La fila es el ancestro que contiene el encabezado con "CUIL - APELLIDO NOMBRE".
      let fila = input.closest("tr, .row, div");
      let m = null;
      for (let i = 0; i < 6 && fila; i++) {
        m = (fila.textContent || "").match(RE_CUIL_FILA);
        if (m) break;
        fila = fila.parentElement;
      }
      if (!m) continue;
      const cuil = digitos(m[1]);
      const rnos = digitos(input.value);
      // Se guarda aunque venga vacío: que ARCA no precomplete nada es un RESULTADO —esa persona no
      // tiene obra social registrada— y WeProdu lo aplica como tal. Tratarlo como error haría que el
      // mismo CUIL se vuelva a consultar para siempre.
      out[cuil] = { rnos: rnos.length === 6 ? rnos : "", ctl };
    }
    return out;
  };

  // --- Acción ------------------------------------------------------------------------------------
  const esBotonAgregar = (el) => {
    if (!el) return false;
    const txt = String(el.value || el.textContent || "").trim();
    if (PROHIBIDO.test(txt)) return false;
    return BOTON_AGREGAR.test(txt);
  };

  /** Se busca por value y no por id: el id generado por WebForms cambia más que el rótulo. */
  const botonAgregar = () => [...document.querySelectorAll('input[type="submit"], input[type="button"], button')].find(esBotonAgregar) || null;

  /** Único punto que dispara un control, y solo si pasó la lista blanca. */
  const accionar = (el) => {
    if (!esBotonAgregar(el)) throw new Error("Control no permitido: este script solo puede apretar Agregar.");
    el.click();
  };

  const escribirCuil = (input, cuil) => {
    // Se disparan los eventos además de asignar: WebForms engancha validadores a `change`, y un value
    // puesto en crudo llega al postback sin validar.
    input.value = conGuiones(cuil);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
  };

  // --- Máquina de estados ------------------------------------------------------------------------
  /**
   * Corre una vez por CARGA de página. El ciclo es:
   *   cargar → leer las filas que ya están → sacar de pendientes lo leído → mandar el próximo CUIL
   *   → postback → (vuelve a empezar)
   */
  const tick = () => {
    const est = leer();
    if (!est || !est.corriendo) return pintar();

    // 1. Lo que ya está en la grilla se cosecha SIEMPRE, aunque el script se haya reiniciado a mano.
    const filas = leerFilas();
    for (const [cuil, dato] of Object.entries(filas)) {
      if (!(cuil in est.hechos)) est.hechos[cuil] = dato.rnos;
    }
    est.pendientes = est.pendientes.filter((c) => !(c in est.hechos));
    guardar(est);

    // 2. ¿Terminó?
    if (est.pendientes.length === 0) {
      est.corriendo = false;
      guardar(est);
      pintar();
      copiarResultado(true);
      return;
    }

    // 3. Mandar el siguiente.
    const input = document.querySelector(SEL_CUIL);
    const boton = botonAgregar();
    if (!input || !boton) {
      est.corriendo = false;
      est.error = "No encontré el campo de CUIL o el botón Agregar. Asegurate de estar en Relaciones Laborales → Registrar Nuevas Altas.";
      guardar(est);
      return pintar();
    }

    const siguiente = est.pendientes[0];
    escribirCuil(input, siguiente);
    pintar();
    // El click provoca el postback: la página recarga y el script arranca de nuevo en `tick()`.
    setTimeout(() => {
      try {
        accionar(boton);
      } catch (e) {
        est.corriendo = false;
        est.error = e.message;
        guardar(est);
        pintar();
      }
    }, 200);
  };

  const copiarResultado = (avisar) => {
    const est = leer();
    if (!est) return;
    const txt = Object.entries(est.hechos)
      .map(([cuil, rnos]) => `${cuil},${rnos || ""}`)
      .join("\n");
    navigator.clipboard.writeText(txt).then(
      () => avisar && alert(`Listo: ${Object.keys(est.hechos).length} constatadas.\n\nPegá el resultado en WeProdu → Constatar obras sociales.`),
      () => prompt("Copiá esto y pegalo en WeProdu:", txt),
    );
  };

  // --- Panel -------------------------------------------------------------------------------------
  const pintar = () => {
    let caja = document.getElementById("weprodu-os");
    if (!caja) {
      caja = document.createElement("div");
      caja.id = "weprodu-os";
      caja.style.cssText =
        "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:320px;font:12px/1.45 system-ui,sans-serif;background:#fff;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.2);padding:12px;color:#0f172a";
      document.body.appendChild(caja);
    }
    const est = leer();
    const hechos = est ? Object.keys(est.hechos).length : 0;
    const faltan = est ? est.pendientes.length : 0;

    caja.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px">WeProdu · Obras sociales</div>
      ${est?.error ? `<div style="color:#b91c1c;margin-bottom:6px">${est.error}</div>` : ""}
      ${
        est && (hechos || faltan)
          ? `<div style="margin-bottom:8px">${hechos} constatadas · ${faltan} pendientes${est.corriendo ? " — en curso…" : ""}</div>`
          : `<div style="margin-bottom:8px;color:#475569">Solo lee la obra social que ARCA precompleta. <b>No confirma el alta.</b></div>`
      }
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${!est?.corriendo ? `<button id="os-run" style="flex:1;padding:7px;border-radius:6px;border:0;background:#2563eb;color:#fff;font-weight:700;cursor:pointer">▶ Constatar obras sociales</button>` : `<button id="os-stop" style="flex:1;padding:7px;border-radius:6px;border:0;background:#b91c1c;color:#fff;font-weight:700;cursor:pointer">Frenar</button>`}
        ${hechos ? `<button id="os-copy" style="padding:7px 9px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;font-weight:600;cursor:pointer">Copiar</button>` : ""}
        ${est ? `<button id="os-clear" style="padding:7px 9px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;cursor:pointer">Limpiar</button>` : ""}
      </div>
      <div style="margin-top:6px"><a href="#" id="os-diag" style="color:#64748b;font-size:11px">diagnóstico</a></div>`;

    caja.querySelector("#os-run")?.addEventListener("click", () => {
      const previo = leer();
      const pegado = prompt("Pegá los CUIL a constatar (uno por línea):", "");
      if (pegado === null) return;
      const cola = [...new Set(pegado.split(/[\s,;]+/).map(digitos).filter((c) => c.length === 11))];
      if (!cola.length) return alert("No encontré ningún CUIL de 11 dígitos.");
      // Idempotente: lo ya constatado en esta tanda no se vuelve a agregar.
      const hechosPrevios = previo?.hechos || {};
      guardar({ pendientes: cola.filter((c) => !(c in hechosPrevios)), hechos: hechosPrevios, corriendo: true, error: "" });
      tick();
    });
    caja.querySelector("#os-stop")?.addEventListener("click", () => {
      const e = leer();
      if (e) {
        e.corriendo = false;
        guardar(e);
      }
      pintar();
    });
    caja.querySelector("#os-copy")?.addEventListener("click", () => copiarResultado(false));
    caja.querySelector("#os-clear")?.addEventListener("click", () => {
      limpiar();
      pintar();
    });
    caja.querySelector("#os-diag")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      const filas = leerFilas();
      alert(
        `Campo CUIL: ${document.querySelector(SEL_CUIL) ? "OK" : "NO ENCONTRADO"}\n` +
          `Botón Agregar: ${botonAgregar() ? "OK" : "NO ENCONTRADO"}\n` +
          `Filas leídas: ${Object.keys(filas).length}\n` +
          Object.entries(filas)
            .map(([c, d]) => `  ${conGuiones(c)} → ${d.rnos || "(vacío)"} [ctl${d.ctl}]`)
            .join("\n"),
      );
    });
  };

  pintar();
  // Retoma sola después de cada postback. El delay le da tiempo al autocompletado de la OS.
  if (leer()?.corriendo) setTimeout(tick, DELAY_LECTURA_MS);
})();
