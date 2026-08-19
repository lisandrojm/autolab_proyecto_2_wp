/**
 * Tests del contrato entre WeProdu y el userscript.
 *
 * Run with:
 *   npx tsx --test src/components/contratos/puenteArca.test.ts
 *
 * POR QUÉ EXISTEN
 * El puente cruza una frontera que no se ve: Tampermonkey ejecuta el script en un SANDBOX cuando hay
 * cualquier `@grant` distinto de `none` —y este necesita `GM_setValue` para pasar datos entre ARCA y
 * WeProdu—. En ese modo, el `window` del script NO es el `window` de la página: una marca puesta en
 * `window.__weproduOSExt` no la ve la app, y un `addEventListener('weprodu-os-start')` del script
 * nunca recibe el evento que dispara React. Los dos lados "funcionan" por separado y no se hablan,
 * que es exactamente el síntoma de "no detecta el script".
 *
 * Lo único que atraviesa el sandbox es el DOM. Por eso el contrato se apoya en `document` y no en
 * `window`, y estos tests corren el userscript REAL contra un DOM mínimo para comprobarlo.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SCRIPT = fs.readFileSync(path.resolve("public/scripts/weprodu-obra-social.user.js"), "utf-8");

/** DOM mínimo: solo lo que el script toca. */
function crearEntorno(hostname: string) {
  const almacen = new Map<string, unknown>();
  const metas: Array<{ name: string; content: string }> = [];
  const atributos = new Map<string, string>();

  const documentElement = {
    setAttribute: (k: string, v: string) => atributos.set(k, v),
    getAttribute: (k: string) => atributos.get(k) ?? null,
    appendChild: () => {},
  };

  const document: any = {
    documentElement,
    head: { appendChild: (n: any) => metas.push(n) },
    body: { textContent: "" },
    createElement: () => ({ name: "", content: "" }),
    querySelector: (sel: string) => (sel.includes("weprodu-os-ext") ? metas.find((m) => m.name === "weprodu-os-ext") || null : null),
    querySelectorAll: () => [],
    getElementById: () => null,
  };
  const docTarget = new EventTarget();
  document.addEventListener = docTarget.addEventListener.bind(docTarget);
  document.removeEventListener = docTarget.removeEventListener.bind(docTarget);
  document.dispatchEvent = docTarget.dispatchEvent.bind(docTarget);

  // El `window` del SANDBOX: distinto del de la página, como hace Tampermonkey con @grant.
  const winTarget = new EventTarget();
  const window: any = {
    location: { hostname },
    addEventListener: winTarget.addEventListener.bind(winTarget),
    removeEventListener: winTarget.removeEventListener.bind(winTarget),
    dispatchEvent: winTarget.dispatchEvent.bind(winTarget),
    setTimeout: (fn: () => void) => fn(),
    setInterval: () => 0,
    clearInterval: () => {},
  };

  const contexto: any = {
    window,
    document,
    location: window.location,
    CustomEvent,
    Event,
    EventTarget,
    setTimeout: (fn: () => void) => fn(),
    setInterval: () => 0,
    clearInterval: () => {},
    GM_getValue: (k: string, d: unknown) => (almacen.has(k) ? almacen.get(k) : d),
    GM_setValue: (k: string, v: unknown) => almacen.set(k, v),
    GM_deleteValue: (k: string) => almacen.delete(k),
    console,
  };
  contexto.globalThis = contexto;

  return { contexto, document, window, almacen, metas, atributos };
}

const correr = (env: ReturnType<typeof crearEntorno>) => vm.runInNewContext(SCRIPT, env.contexto);

/**
 * Los objetos que devuelve el script nacen dentro del `vm`, en otro realm: su prototipo no es el
 * `Array`/`Object` de este contexto y `deepEqual` los rechaza aunque el contenido sea idéntico.
 * Aplanarlos compara lo que importa —los datos— en vez de la identidad del prototipo.
 */
const plano = (v: unknown) => JSON.parse(JSON.stringify(v ?? null));

describe("puente WeProdu ↔ userscript — presencia", () => {
  it("deja la marca en el DOM, que es lo único que cruza el sandbox de Tampermonkey", () => {
    const env = crearEntorno("localhost");
    correr(env);

    // El <meta> y el atributo del <html> viven en el DOM, compartido con la página.
    assert.ok(
      env.metas.some((m) => m.name === "weprodu-os-ext" && !!m.content),
      "sin una marca en el DOM, la app no puede saber que la extensión está instalada",
    );
    assert.ok(env.atributos.get("data-weprodu-os"), "el atributo del <html> es el respaldo del <meta>");
  });

  it("en ARCA NO deja la marca: ahí el script trabaja, no se anuncia", () => {
    const env = crearEntorno("serviciossegsoc.afip.gob.ar");
    correr(env);
    assert.equal(env.metas.length, 0);
  });
});

describe("puente WeProdu ↔ userscript — arranque", () => {
  /**
   * El test que atrapa el bug del sandbox.
   *
   * El evento se dispara en `document`, como lo hace la app. Si el script solo escuchara en `window`,
   * acá no pasaría nada: la cola quedaría vacía y en el navegador real el operador vería abrirse ARCA
   * sin que el script arranque nunca.
   */
  it("escucha `weprodu-os-start` en document y siembra la cola", () => {
    const env = crearEntorno("localhost");
    correr(env);

    env.document.dispatchEvent(
      new CustomEvent("weprodu-os-start", { detail: [{ cuil: "20-36397260-9", contractId: "c1" }] }),
    );

    assert.deepEqual(plano(env.almacen.get("os_orden")), ["20-36397260-9"], "la cola tiene que quedar sembrada en el almacén compartido");
    assert.equal(env.almacen.get("os_active"), true);
  });

  it("también escucha en window, para no romper si algún día no hay sandbox", () => {
    const env = crearEntorno("localhost");
    correr(env);
    env.window.dispatchEvent(new CustomEvent("weprodu-os-start", { detail: [{ cuil: "27-40073687-7", contractId: "c2" }] }));
    assert.deepEqual(plano(env.almacen.get("os_orden")), ["27-40073687-7"]);
  });

  it("descarta los CUIL que no tienen 11 dígitos", () => {
    const env = crearEntorno("localhost");
    correr(env);
    env.document.dispatchEvent(new CustomEvent("weprodu-os-start", { detail: [{ cuil: "123", contractId: "c1" }] }));
    assert.equal(env.almacen.get("os_active"), undefined, "sin CUIL válidos no se arranca una corrida");
  });
});

describe("puente WeProdu ↔ userscript — entrega", () => {
  it("entrega los resultados por document cuando la app avisa que está lista", () => {
    const env = crearEntorno("localhost");
    // Una corrida ya terminada en ARCA, esperando que alguien la levante.
    env.almacen.set("os_orden", ["20-36397260-9", "27-40073687-7"]);
    env.almacen.set("os_queue", [
      { cuil: "20-36397260-9", contractId: "c1" },
      { cuil: "27-40073687-7", contractId: "c2" },
    ]);
    env.almacen.set("os_hechos", { "20-36397260-9": "", "27-40073687-7": "901402" });
    env.almacen.set("os_errores", {});
    env.almacen.set("os_done", true);

    const recibidos: any[] = [];
    env.document.addEventListener("weprodu-os-results", (e: any) => recibidos.push(...e.detail));
    correr(env);

    assert.equal(recibidos.length, 2);
    // El vacío es una RESPUESTA —ARCA no tiene obra social para esa persona— y viaja como tal.
    assert.deepEqual(plano(recibidos[0]), { cuil: "20-36397260-9", rnos: "", contractId: "c1" });
    assert.deepEqual(plano(recibidos[1]), { cuil: "27-40073687-7", rnos: "901402", contractId: "c2" });
  });

  it("los que fallaron NO se entregan: un vacío se guardaría como validado", () => {
    const env = crearEntorno("localhost");
    env.almacen.set("os_orden", ["20-36397260-9"]);
    env.almacen.set("os_queue", [{ cuil: "20-36397260-9", contractId: "c1" }]);
    env.almacen.set("os_hechos", { "20-36397260-9": "" });
    env.almacen.set("os_errores", { "20-36397260-9": true });
    env.almacen.set("os_done", true);

    const recibidos: any[] = [];
    env.document.addEventListener("weprodu-os-results", (e: any) => recibidos.push(...e.detail));
    correr(env);

    assert.equal(recibidos.length, 0, "un error de consulta entregado como '' sellaría un dato falso e inmutable");
  });

  it("responde al handshake: si la app monta después, igual recibe", () => {
    const env = crearEntorno("localhost");
    correr(env); // el script arranca ANTES de que exista el listener (caso recarga)

    env.almacen.set("os_orden", ["27-40073687-7"]);
    env.almacen.set("os_queue", [{ cuil: "27-40073687-7", contractId: "c2" }]);
    env.almacen.set("os_hechos", { "27-40073687-7": "901402" });
    env.almacen.set("os_errores", {});
    env.almacen.set("os_done", true);

    const recibidos: any[] = [];
    env.document.addEventListener("weprodu-os-results", (e: any) => recibidos.push(...e.detail));
    env.document.dispatchEvent(new Event("weprodu-os-ready"));

    assert.equal(recibidos.length, 1, "sin el handshake, una tanda entera se pierde al recargar la pestaña");
  });
});

describe("puente WeProdu ↔ userscript — doble canal", () => {
  /**
   * El script emite por `document` y por `window` porque no sabe de qué lado del sandbox está la app.
   * La consecuencia es que la misma tanda llega DOS veces, y del otro lado eso serían dos corridas de
   * guardado. Este test fija que el script emite por los dos —lo que hace que llegue siempre— y deja
   * documentado por qué `useResultadosArca` deduplica por contenido.
   */
  it("emite la entrega por document Y por window", () => {
    const env = crearEntorno("localhost");
    env.almacen.set("os_orden", ["27-40073687-7"]);
    env.almacen.set("os_queue", [{ cuil: "27-40073687-7", contractId: "c2" }]);
    env.almacen.set("os_hechos", { "27-40073687-7": "901402" });
    env.almacen.set("os_errores", {});
    env.almacen.set("os_done", true);

    let porDocumento = 0;
    let porWindow = 0;
    env.document.addEventListener("weprodu-os-results", () => porDocumento++);
    env.window.addEventListener("weprodu-os-results", () => porWindow++);
    correr(env);

    assert.equal(porDocumento, 1, "el canal que sobrevive al sandbox");
    assert.equal(porWindow, 1, "el canal para cuando no hay sandbox");
  });
});
