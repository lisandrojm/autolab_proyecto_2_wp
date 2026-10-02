/**
 * RECONOCIMIENTO DE LAS PANTALLAS DE ALTAS DE ARCA — con alguien mirando, un paso por vez.
 *
 * Para qué: las corridas automáticas de altas (Carga Masiva y Altas Masivas) tienen pantallas que
 * nunca se relevaron —el `input type=file`, el botón «Cargar», los mensajes de validación, la grilla
 * después del pegado—. Los selectores no se adivinan: se miran. Este script abre un Chromium VISIBLE
 * con la sesión del usuario delegado, y en cada pantalla:
 *
 *   1. guarda un FIXTURE anonimizado en `src/services/arca/fixtures/NN-<pantalla>.html` y un
 *      `NN-<pantalla>.json` con el `action` del formulario y los controles (id, tipo, value), que es
 *      lo que necesitan los clasificadores puros y sus tests;
 *   2. lista los botones de la pantalla, numerados;
 *   3. espera que la persona elija qué hacer.
 *
 * LO QUE NO HACE NUNCA, aunque se lo pidan:
 *   · apretar «Enviar» de Carga Masiva (`Button_envio`) ni el «Aceptar» de la grilla de Altas.aspx
 *     (`btnAceptar` en la pantalla de altas): esos dos presentan altas ante ARCA y no se deshacen;
 *   · apretar «Reiniciar» de la grilla (borraría filas que cargó otra persona);
 *   · cualquier botón cuyo rótulo hable de enviar, confirmar o registrar.
 * Los que crean algo en ARCA sin presentarlo —«Nuevo» (crea una novedad en borrador) y el «Aceptar»
 * del pegado (que debería solo pasar los registros a la grilla)— piden escribir SI.
 *
 * Uso (desde server/, en una máquina con pantalla):
 *
 *   ./node_modules/.bin/dotenv -e .env.production -v TENANT=<slug o id> -v EMPRESA_CUIT=30717068374 -- \
 *     tsx src/scripts/reconocerAltasArca.ts
 *
 * Comandos en cada pantalla:
 *   <n>            apretar el botón n de la lista
 *   ir carga       ir a Relaciones Laborales → Carga Masiva (listado de novedades)
 *   ir altas       ir a Relaciones Laborales → Registrar Nuevas Altas
 *   archivo <ruta> cargar ese archivo en el input type=file de la pantalla
 *   texto <ruta>   pegar el contenido de ese archivo en el textarea de la pantalla
 *   foto           volver a guardar el fixture de la pantalla actual (sin hacer nada)
 *   salir          cerrar
 *
 * ⚠ Los fixtures salen anonimizados (CUIL/CUIT, nombres en grillas, VIEWSTATE), pero REVISALOS antes
 * de commitearlos: la anonimización es por patrón y una pantalla nueva puede traer un dato que no
 * matchee.
 */
import mongoose from "mongoose";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import type { Page } from "playwright-core";
import { Tenant } from "../models/Tenant.js";
import { abrirSesionArca, credencialesDe } from "../services/arca/navegador.js";
import { MOTOR } from "../services/arca/motor.js";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "../services/arca/fixtures");
const PREFIJO = "ctl00_ContentPlaceHolder1_";

/** Botones que este script no aprieta nunca. Ver el encabezado. */
const PROHIBIDOS_POR_ID = [/Button_envio$/i, /btnReiniciar$/i];
const PROHIBIDOS_POR_ROTULO = /enviar|confirm|registrar|reiniciar|eliminar|borrar/i;

interface Control {
  n: number;
  id: string;
  tag: string;
  tipo: string;
  rotulo: string;
}

/** El `action` del formulario: con `Server.Transfer` la URL queda una pantalla atrás, el action no. */
async function accionDelForm(page: Page): Promise<string> {
  return page.evaluate(() => (document.querySelector("form#aspnetForm") as HTMLFormElement | null)?.getAttribute("action") || "");
}

async function controles(page: Page): Promise<Control[]> {
  const crudos = await page.evaluate(() =>
    Array.from(document.querySelectorAll("input[type=submit], input[type=button], input[type=image], button, a[href^='javascript:__doPostBack']"))
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({
        id: el.id || "",
        tag: el.tagName.toLowerCase(),
        tipo: (el as HTMLInputElement).type || "",
        rotulo: ((el as HTMLInputElement).value || el.getAttribute("title") || el.getAttribute("alt") || el.textContent || "").trim().slice(0, 60),
      })),
  );
  return crudos.map((c, i) => ({ n: i + 1, ...c }));
}

/**
 * El HTML de la pantalla, anonimizado DENTRO del navegador sobre una copia del documento: CUIL/CUIT
 * de 11 dígitos → 20000000001…, nombres en celdas de grillas → PERSONA N, y sin VIEWSTATE.
 */
async function htmlAnonimo(page: Page): Promise<string> {
  return page.evaluate(() => {
    const copia = document.documentElement.cloneNode(true) as HTMLElement;
    for (const id of ["__VIEWSTATE", "__EVENTVALIDATION", "__VIEWSTATEGENERATOR", "__PREVIOUSPAGE"]) {
      const el = copia.querySelector(`#${id}`) as HTMLInputElement | null;
      if (el) el.setAttribute("value", "");
    }
    const cuits = new Map<string, string>();
    const reemplazarCuit = (t: string) =>
      t.replace(/(?<!\d)(\d{2})-?(\d{8})-?(\d)(?!\d)/g, (m) => {
        const limpio = m.replace(/\D/g, "");
        if (!cuits.has(limpio)) cuits.set(limpio, `2000000${String(cuits.size + 1).padStart(4, "0")}`);
        return cuits.get(limpio)!;
      });
    const nombres = new Map<string, string>();
    const PARECE_NOMBRE = /^[A-ZÁÉÍÓÚÑÜ' .]{3,}(?:,?\s+[A-ZÁÉÍÓÚÑÜ' .]{2,})+$/;
    const walker = document.createTreeWalker(copia, NodeFilter.SHOW_TEXT);
    const nodos: Text[] = [];
    while (walker.nextNode()) nodos.push(walker.currentNode as Text);
    for (const n of nodos) {
      let t = reemplazarCuit(n.nodeValue || "");
      const recortado = t.trim();
      // Solo dentro de celdas de una tabla con varias filas: el encabezado del empleador (razón
      // social) no es un dato personal y sirve para reconocer la pantalla.
      const celda = n.parentElement?.closest("td");
      const tabla = celda?.closest("table");
      if (celda && tabla && tabla.querySelectorAll("tr").length > 1 && PARECE_NOMBRE.test(recortado) && !/S\.?\s?R\.?\s?L|S\.?\s?A\.?$/i.test(recortado)) {
        if (!nombres.has(recortado)) nombres.set(recortado, `PERSONA ${nombres.size + 1}`);
        t = t.replace(recortado, nombres.get(recortado)!);
      }
      n.nodeValue = t;
    }
    for (const el of Array.from(copia.querySelectorAll("input[value], textarea, option"))) {
      const v = el.getAttribute("value");
      if (v) el.setAttribute("value", reemplazarCuit(v));
      if (el.tagName === "TEXTAREA" || el.tagName === "OPTION") el.textContent = reemplazarCuit(el.textContent || "");
    }
    return "<!doctype html>\n" + copia.outerHTML;
  });
}

let paso = 0;
async function foto(page: Page): Promise<{ accion: string; ctrls: Control[] }> {
  const accion = await accionDelForm(page);
  const ctrls = await controles(page);
  const ids = await page.evaluate(() => Array.from(document.querySelectorAll("[id]")).map((e) => e.id).filter((id) => id.startsWith("ctl00_")));
  const nombre = (accion.split("?")[0].split("/").pop() || "pantalla").replace(/\.aspx$/i, "") || "pantalla";
  paso++;
  const base = resolve(FIXTURES, `${String(paso).padStart(2, "0")}-${nombre}`);
  mkdirSync(FIXTURES, { recursive: true });
  writeFileSync(`${base}.html`, await htmlAnonimo(page));
  writeFileSync(`${base}.json`, JSON.stringify({ accion, ids, botones: ctrls.map(({ n: _n, ...c }) => c) }, null, 2));
  console.log(`\n── Pantalla: ${accion || "(sin form aspnetForm)"}   → fixture ${base.split("/").slice(-1)[0]}.html/.json`);
  const etiquetas = await page.evaluate((pref) => ["lblTitle", "lblEstado", "lblErrors", "lblMensaje"].map((k) => [k, (document.getElementById(pref + k)?.textContent || "").trim()]).filter(([, v]) => v), PREFIJO);
  for (const [k, v] of etiquetas) console.log(`   ${k}: ${v}`);
  for (const c of ctrls) console.log(`   [${c.n}] ${c.tag}${c.tipo ? `/${c.tipo}` : ""}  ${c.id.replace(PREFIJO, "…")}  «${c.rotulo}»`);
  return { accion, ctrls };
}

async function main() {
  const tenantRef = process.env.TENANT || "";
  const cuit = String(process.env.EMPRESA_CUIT || "").replace(/\D/g, "");
  if (!tenantRef || cuit.length !== 11) throw new Error("Faltan TENANT y EMPRESA_CUIT (11 dígitos).");
  await mongoose.connect(process.env.MONGO_URI!, { dbName: process.env.MONGO_DB_NAME });
  const tenant: any = mongoose.isValidObjectId(tenantRef) ? await Tenant.findById(tenantRef).lean() : await Tenant.findOne({ slug: tenantRef }).lean();
  if (!tenant) throw new Error(`No encontré el tenant ${tenantRef}`);
  const cred = await credencialesDe(String(tenant._id));
  if (!cred) throw new Error("El tenant no tiene configurado el usuario de Simplificación Registral.");

  const sesion = await abrirSesionArca(String(tenant._id), cred, { visible: true });
  const page = sesion.page;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const { aceptarSelectorDeCuit } = (await import(MOTOR)) as any;
    await aceptarSelectorDeCuit(page, cuit);
    const base = page.url().split("/app/")[0];
    console.log(`\nEmpleadora ${cuit} elegida. Escribí «ir carga» o «ir altas» para empezar.`);

    let { accion, ctrls } = await foto(page);
    for (;;) {
      const linea = (await rl.question("\n> ")).trim();
      if (!linea) continue;
      if (linea === "salir") break;
      if (linea === "foto") {
        ({ accion, ctrls } = await foto(page));
        continue;
      }
      if (linea === "ir carga" || linea === "ir altas") {
        await page.goto(`${base}/app/Contribuyente/RelacionLaboral/${linea === "ir carga" ? "CargaMasiva.aspx" : "Altas.aspx"}`, { waitUntil: "domcontentloaded" });
        ({ accion, ctrls } = await foto(page));
        continue;
      }
      if (linea.startsWith("archivo ")) {
        const ruta = linea.slice(8).trim();
        const input = page.locator("input[type=file]");
        if ((await input.count()) !== 1) {
          console.log(`Hay ${await input.count()} input type=file en esta pantalla; esperaba 1.`);
          continue;
        }
        await input.setInputFiles(ruta);
        console.log("Archivo puesto en el input (todavía no se apretó ningún botón).");
        continue;
      }
      if (linea.startsWith("texto ")) {
        const ruta = linea.slice(6).trim();
        const areas = page.locator("textarea");
        if ((await areas.count()) !== 1) {
          console.log(`Hay ${await areas.count()} textarea en esta pantalla; esperaba 1.`);
          continue;
        }
        await areas.fill(readFileSync(ruta, "latin1").replace(/\r?\n$/, ""));
        console.log("Texto pegado en el textarea (todavía no se apretó ningún botón).");
        continue;
      }
      const n = Number(linea);
      const c = ctrls.find((x) => x.n === n);
      if (!c) {
        console.log("No entendí. Número de botón, «ir carga», «ir altas», «archivo <ruta>», «texto <ruta>», «foto» o «salir».");
        continue;
      }
      // El «Aceptar» de la pantalla de ALTAS (la grilla) registra: se reconoce por el action, no por el id solo.
      const esAceptarGrilla = /btnAceptar$/i.test(c.id) && /\/Altas\.aspx/i.test(accion) && !/ArchivoAltas/i.test(accion);
      if (PROHIBIDOS_POR_ID.some((r) => r.test(c.id)) || esAceptarGrilla || PROHIBIDOS_POR_ROTULO.test(c.rotulo)) {
        console.log(`✋ «${c.rotulo}» (${c.id}) presenta, borra o confirma algo en ARCA. Este script no lo aprieta.`);
        continue;
      }
      const creaAlgo = /Button_nuevo$/i.test(c.id) || (/btnAceptar$/i.test(c.id) && /ArchivoAltas/i.test(accion));
      if (creaAlgo) {
        const ok = (await rl.question(`«${c.rotulo}» crea algo en ARCA (una novedad en borrador / pasa el texto a la grilla). Escribí SI para apretarlo: `)).trim();
        if (ok !== "SI") continue;
      }
      const antes = accion;
      await page.locator(`[id="${c.id}"]`).click();
      // Postback completo o parcial: se espera a que cambie el action o pase un rato, lo que llegue primero.
      const hasta = Date.now() + 25_000;
      while (Date.now() < hasta) {
        await page.waitForTimeout(400);
        const ahora = await accionDelForm(page).catch(() => "");
        if (ahora && ahora !== antes) break;
      }
      await page.waitForTimeout(800);
      ({ accion, ctrls } = await foto(page));
    }
  } finally {
    rl.close();
    await sesion.browser.close().catch(() => {});
    await mongoose.disconnect();
  }
}

main().catch(async (e) => {
  console.error("Error:", e?.message || e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
