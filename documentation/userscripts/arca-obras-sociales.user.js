// ==UserScript==
// @name         WeProdu — Traer obras sociales de ARCA
// @namespace    weprodu
// @version      1.0.0
// @description  Recorre una lista de CUIL en Registrar Nuevas Altas y junta la obra social que ARCA precompleta. NO registra altas.
// @match        https://serviciossegsoc.afip.gob.ar/tramites_con_clave_fiscal/MiSimplificacion/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * QUÉ HACE
 * --------
 * Automatiza el paso mecánico de la constatación: por cada CUIL de una cola, lo escribe en Registrar
 * Nuevas Altas, aprieta Agregar, espera el postback y lee la obra social que ARCA precompletó. Al
 * terminar deja `CUIL,RNOS` en el portapapeles para pegarlo en WeProdu.
 *
 * Corre DENTRO de la sesión que la persona ya abrió con su clave fiscal: no guarda credenciales, no
 * resuelve captchas y no inicia sesión. Es el mismo trabajo que se hace a mano, sin el tipeo.
 *
 *
 * LO QUE NO HACE, Y POR QUÉ ESTÁ ESCRITO ASÍ
 * ------------------------------------------
 * Esta pantalla es el formulario que DA DE ALTA relaciones laborales ante el organismo. Un script
 * suelto acá puede registrar altas reales, masivas y sin vuelta atrás. Por eso el permiso está
 * modelado como LISTA BLANCA y no como lista negra:
 *
 *   - `accionar()` es la ÚNICA función que dispara un control, y solo acepta el botón que pasó por
 *     `esBotonSeguro()`.
 *   - `esBotonSeguro()` exige que el texto del control coincida EXACTAMENTE con "Agregar" y rechaza
 *     cualquier cosa que mencione confirmar / registrar / aceptar / grabar / enviar / alta.
 *   - Nunca se llama a `form.submit()` ni a `__doPostBack` a mano: eso saltearía el filtro.
 *
 * Si ARCA cambia el flujo y "Agregar" pasa a confirmar el alta, este script deja de ser seguro. Antes
 * de tocar `BOTON_SEGURO` hay que verificar en la pantalla qué hace el botón nuevo.
 */

(function () {
  "use strict";

  const CLAVE = "weprodu.arca.os.cola";
  const VERSION_ESTADO = 1;

  /** El único control que el script puede accionar. Ver el comentario de arriba antes de tocarlo. */
  const BOTON_SEGURO = /^agregar$/i;
  /** Cualquiera de estas palabras en un control lo vuelve intocable, aunque también diga "Agregar". */
  const PROHIBIDO = /confirm|registr|acept|grab|enviar|guardar|alta|finaliz/i;

  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .trim()
      .toLowerCase();
  const digitos = (s) => String(s || "").replace(/\D/g, "");

  // --- Estado, fuera del DOM ---------------------------------------------------------------------
  // Cada Agregar es un postback de ASP.NET que recarga la página entera: cualquier variable en
  // memoria se pierde. La cola vive en localStorage y el script retoma en cada carga.
  const leerEstado = () => {
    try {
      const e = JSON.parse(localStorage.getItem(CLAVE) || "null");
      return e && e.v === VERSION_ESTADO ? e : null;
    } catch {
      return null;
    }
  };
  const guardarEstado = (e) => localStorage.setItem(CLAVE, JSON.stringify({ ...e, v: VERSION_ESTADO }));
  const borrarEstado = () => localStorage.removeItem(CLAVE);

  // --- Detección de controles --------------------------------------------------------------------
  // Los ids de WebForms son generados (ctl00$ContentPlaceHolder$...) y cambian entre pantallas, así
  // que se buscan por lo que se ve: qué dice el label y qué dice el botón. Si algún día falla, el
  // panel tiene un modo diagnóstico que lista lo que encontró.
  const inputCuil = () => {
    const inputs = [...document.querySelectorAll("input[type=text], input:not([type])")];
    const porId = inputs.find((i) => /cuil|cuit/i.test(i.id + " " + i.name));
    if (porId) return porId;
    // Por cercanía a un rótulo que diga CUIL.
    for (const i of inputs) {
      const fila = i.closest("tr, td, div");
      if (fila && /cuil/i.test(fila.textContent || "")) return i;
    }
    return null;
  };

  const esBotonSeguro = (el) => {
    if (!el) return false;
    const texto = norm(el.value || el.textContent || "");
    if (PROHIBIDO.test(texto)) return false;
    return BOTON_SEGURO.test(texto);
  };

  const botonAgregar = () => [...document.querySelectorAll("input[type=submit], input[type=button], button, a")].find(esBotonSeguro) || null;

  /**
   * Lee el RNOS que ARCA precompletó.
   *
   * Devuelve "" cuando no hay ninguno: para el organismo esa persona no tiene obra social registrada,
   * y ese vacío es una RESPUESTA — WeProdu lo guarda como "no devolvió ninguna" y aplica la del
   * convenio. Confundirlo con un error de lectura haría que se vuelva a consultar para siempre.
   */
  const leerRnos = () => {
    // 1) Un select de obra social ya posicionado en la que corresponde.
    const sel = [...document.querySelectorAll("select")].find((s) => /obra\s*social|rnos/i.test(s.id + " " + s.name + " " + (s.closest("tr, td, div")?.textContent || "")));
    if (sel && sel.selectedIndex >= 0) {
      const cod = digitos(sel.value) || digitos(sel.options[sel.selectedIndex]?.text);
      if (cod.length === 6) return cod;
    }
    // 2) Un input de solo lectura con el código.
    const inp = [...document.querySelectorAll("input[type=text], input[readonly]")].find((i) => /obra\s*social|rnos/i.test(i.id + " " + i.name));
    if (inp && digitos(inp.value).length === 6) return digitos(inp.value);
    // 3) Texto suelto: la celda que sigue a un rótulo "Obra Social".
    for (const el of document.querySelectorAll("td, div, span, label")) {
      if (!/obra\s*social/i.test(el.textContent || "")) continue;
      const cerca = (el.parentElement?.textContent || "") + " " + (el.nextElementSibling?.textContent || "");
      const m = cerca.match(/\b\d{6}\b/);
      if (m) return m[0];
    }
    return "";
  };

  // --- Acción ------------------------------------------------------------------------------------
  /** Único punto que dispara un control, y solo si pasó la lista blanca. */
  const accionar = (el) => {
    if (!esBotonSeguro(el)) {
      throw new Error("Control no permitido: el script solo puede apretar Agregar.");
    }
    el.click();
  };

  const escribirCuil = (input, cuil) => {
    // Se dispara `change` además de asignar: WebForms engancha validadores a los eventos, y un value
    // puesto en crudo llega al postback sin validar.
    input.value = cuil;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  // --- Motor de la cola --------------------------------------------------------------------------
  const paso = () => {
    const est = leerEstado();
    if (!est || !est.corriendo) return pintarPanel();

    const pendiente = est.cola[est.indice];
    if (!pendiente) {
      est.corriendo = false;
      guardarEstado(est);
      return pintarPanel();
    }

    const input = inputCuil();
    const boton = botonAgregar();
    if (!input || !boton) {
      est.corriendo = false;
      est.error = "No encontré el campo de CUIL o el botón Agregar en esta pantalla. Abrí Relaciones Laborales → Registrar Nuevas Altas y reanudá.";
      guardarEstado(est);
      return pintarPanel();
    }

    // Si venimos de un postback, lo que hay en pantalla es la respuesta del CUIL anterior: se lee
    // ANTES de mandar el siguiente.
    if (est.esperandoRespuesta) {
      est.resultados.push({ cuil: pendiente, rnos: leerRnos() });
      est.indice++;
      est.esperandoRespuesta = false;
      guardarEstado(est);
      if (est.indice >= est.cola.length) {
        est.corriendo = false;
        guardarEstado(est);
        return pintarPanel();
      }
      return setTimeout(paso, 400);
    }

    escribirCuil(input, est.cola[est.indice]);
    est.esperandoRespuesta = true;
    guardarEstado(est);
    // El click provoca el postback: la página se recarga y el script arranca de nuevo en `paso()`.
    setTimeout(() => accionar(boton), 250);
  };

  // --- Panel -------------------------------------------------------------------------------------
  const pintarPanel = () => {
    let caja = document.getElementById("weprodu-arca-os");
    if (!caja) {
      caja = document.createElement("div");
      caja.id = "weprodu-arca-os";
      caja.style.cssText =
        "position:fixed;right:16px;bottom:16px;z-index:99999;width:330px;font:12px/1.4 system-ui,sans-serif;background:#fff;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:12px;color:#0f172a";
      document.body.appendChild(caja);
    }
    const est = leerEstado();
    const hecho = est ? est.resultados.length : 0;
    const total = est ? est.cola.length : 0;

    caja.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px">WeProdu · Obras sociales de ARCA</div>
      ${est?.error ? `<div style="color:#b91c1c;margin-bottom:6px">${est.error}</div>` : ""}
      ${
        est && total
          ? `<div style="margin-bottom:8px">${hecho} de ${total} consultados${est.corriendo ? " — en curso…" : ""}</div>`
          : `<div style="margin-bottom:8px;color:#475569">Pegá los CUIL (uno por línea) y arrancá. El script solo aprieta <b>Agregar</b> y lee la obra social: no registra altas.</div>`
      }
      ${!est || !est.corriendo ? `<textarea id="wp-cuils" placeholder="20123456789&#10;27234567890" style="width:100%;height:70px;box-sizing:border-box;font-family:ui-monospace,monospace;font-size:11px">${est && !est.corriendo ? "" : ""}</textarea>` : ""}
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        ${!est || !est.corriendo ? `<button id="wp-run" style="flex:1;padding:6px;border-radius:6px;border:0;background:#2563eb;color:#fff;font-weight:600;cursor:pointer">Arrancar</button>` : `<button id="wp-stop" style="flex:1;padding:6px;border-radius:6px;border:0;background:#b91c1c;color:#fff;font-weight:600;cursor:pointer">Frenar</button>`}
        ${hecho ? `<button id="wp-copy" style="flex:1;padding:6px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;font-weight:600;cursor:pointer">Copiar resultado</button>` : ""}
        ${est ? `<button id="wp-clear" style="padding:6px 8px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;cursor:pointer">Limpiar</button>` : ""}
      </div>
      <div style="margin-top:6px"><a href="#" id="wp-diag" style="color:#64748b;font-size:11px">diagnóstico</a></div>`;

    caja.querySelector("#wp-run")?.addEventListener("click", () => {
      const cola = (caja.querySelector("#wp-cuils")?.value || "")
        .split(/[\s,;]+/)
        .map(digitos)
        .filter((c) => c.length === 11);
      if (!cola.length) return alert("No encontré ningún CUIL de 11 dígitos.");
      guardarEstado({ cola, indice: 0, resultados: [], corriendo: true, esperandoRespuesta: false, error: "" });
      paso();
    });
    caja.querySelector("#wp-stop")?.addEventListener("click", () => {
      const e = leerEstado();
      if (e) {
        e.corriendo = false;
        guardarEstado(e);
      }
      pintarPanel();
    });
    caja.querySelector("#wp-copy")?.addEventListener("click", () => {
      const e = leerEstado();
      const txt = (e?.resultados || []).map((r) => `${r.cuil},${r.rnos}`).join("\n");
      navigator.clipboard.writeText(txt).then(
        () => alert(`Copiadas ${e.resultados.length} filas. Pegalas en WeProdu → Constatar obras sociales.`),
        () => prompt("Copiá esto y pegalo en WeProdu:", txt),
      );
    });
    caja.querySelector("#wp-clear")?.addEventListener("click", () => {
      borrarEstado();
      pintarPanel();
    });
    caja.querySelector("#wp-diag")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      const i = inputCuil();
      const b = botonAgregar();
      alert(`Campo CUIL: ${i ? i.id || i.name : "NO ENCONTRADO"}\nBotón Agregar: ${b ? b.value || b.textContent : "NO ENCONTRADO"}\nRNOS leído ahora: ${leerRnos() || "(vacío)"}`);
    });
  };

  pintarPanel();
  // Retoma solo después de cada postback.
  if (leerEstado()?.corriendo) setTimeout(paso, 600);
})();
