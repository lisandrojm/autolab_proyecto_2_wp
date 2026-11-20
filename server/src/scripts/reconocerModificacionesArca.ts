/**
 * RECONOCIMIENTO DE SÓLO LECTURA de Relaciones Laborales → Modificaciones (`Modificaciones.aspx`), la
 * pantalla con los tres íconos por relación: modificar, registrar la baja y anular. Nunca fue visitada
 * por el código: no hay fixture ni selector. Este script mira y guarda; no escribe nada en ARCA.
 *
 * LO QUE HACE, en orden:
 *   1. entra con el usuario delegado y elige la empleadora (`aceptarSelectorDeCuit`);
 *   2. pasa por Registrar Nuevas Altas (ir derecho a otra pantalla desde el selector tira la pestaña);
 *   3. abre Modificaciones y guarda la pantalla; lista los catálogos `window.l_*` que publica (ahí
 *      puede estar el de situaciones de baja);
 *   4. si la pantalla tiene un campo de CUIL y un botón que diga Continuar/Buscar/Consultar, busca
 *      cada CUIL pedido (una búsqueda: no modifica nada) y guarda el resultado con los controles de
 *      SU fila (ids, `onclick`, `href`, `title`, `alt`, `src` de cada ícono);
 *   5. con `ABRIR=modificar,baja` aprieta ESOS íconos en la fila del CUIL para ver el formulario que
 *      abren, guarda la pantalla con sus campos y las opciones de cada `select`, y vuelve. Son
 *      formularios: necesitan datos antes de confirmar, así que abrirlos no registra nada.
 *
 * LO QUE NO HACE NUNCA:
 *   · apretar el ícono de ANULAR: puede actuar con una sola confirmación, y la confirmación es un
 *     diálogo del navegador que acá se rechaza, pero no se prueba. `ABRIR=anular` tira.
 *   · apretar un botón que diga aceptar, confirmar, enviar, registrar, grabar, guardar, eliminar o
 *     borrar, ni ningún botón DENTRO de los formularios que abre.
 *   · aceptar un diálogo: todos se rechazan (`dialog.dismiss`) y quedan anotados.
 *
 * La salida va a `SALIDA` (por defecto una carpeta temporal), NO al repo: la pantalla trae nombres.
 * Los CUIL/CUIT salen tapados; los nombres se revisan a mano antes de convertir nada en fixture.
 *
 * Uso (desde server/):
 *
 *   ./node_modules/.bin/dotenv -e .env.production -v TENANT=<slug o id> -v EMPRESA_CUIT=<cuit> \
 *     -v UP=<userProjectId>:<contractIndex>[,<otro>:<idx>] [-v ABRIR=modificar,baja] [-v SALIDA=<carpeta>] \
 *     -- tsx src/scripts/reconocerModificacionesArca.ts
 *
 *   UP      los contratos cuyo CUIL se busca (el CUIL se lee de la base y no se imprime entero).
 *   CUIL    alternativa a UP: CUIL de 11 dígitos, separados por coma.
 *   ABRIR   qué íconos abrir en la fila del CUIL: `modificar`, `baja` (nunca `anular`). Sin esto sólo lista.
 */
import mongoose from "mongoose";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "playwright-core";
import { Tenant } from "../models/Tenant.js";
import { abrirSesionArca, credencialesDe, guardarSesion } from "../services/arca/navegador.js";
import { MOTOR, MOTOR_ALTAS } from "../services/arca/motor.js";

const SALIDA = resolve(process.env.SALIDA || resolve(tmpdir(), "reconocer-modificaciones"));
const TAPAR_CUIT = /(?<!\d)\d{2}-?\d{8}-?\d(?!\d)/g;
const RUTA = "Contribuyente/RelacionLaboral/Modificaciones.aspx";
/** Lo que este script no aprieta jamás, por rótulo, en ninguna pantalla. */
const PROHIBIDO = /acept|confirm|enviar|registr|grabar|guardar|elimin|borrar|anul|reinici/i;
const ICONOS_PERMITIDOS = new Set(["modificar", "baja"]);

let paso = 0;
const soloDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Guarda la pantalla: HTML con los CUIT tapados y un JSON con lo que hace falta para escribir selectores. */
async function foto(page: Page, motor: any, nombre: string): Promise<any> {
  const datos = await page.evaluate(() => {
    // Sin funciones con nombre acá adentro (ni `const f = () => …`): tsx les agrega un `__name` que en el navegador no existe.
    return {
      url: location.pathname,
      accion: document.querySelector("form#aspnetForm")?.getAttribute("action") || "",
      ids: Array.from(document.querySelectorAll("[id^='ctl00_']")).map((e) => e.id),
      botones: Array.from(document.querySelectorAll("input[type=submit], input[type=button], input[type=image], button, a[href^='javascript:']"))
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => ({ id: el.id, tag: el.tagName.toLowerCase(), tipo: (el as HTMLInputElement).type || "", rotulo: ((el as HTMLInputElement).value || el.getAttribute("title") || el.getAttribute("alt") || el.textContent || "").trim().slice(0, 80), href: el.getAttribute("href") || "", onclick: (el.getAttribute("onclick") || "").slice(0, 200), src: (el.getAttribute("src") || "").slice(0, 120) })),
      // También los ocultos del autocompletar (`*_AutocompleteValue`): ahí viaja el CÓDIGO que ARCA lee.
      ocultos: Array.from(document.querySelectorAll("input[type=hidden][id*='Autocomplete'], input[type=hidden][id*='ContentPlaceHolder1']")).map((el) => ({ id: el.id, valor: String((el as HTMLInputElement).value || "").slice(0, 120) })),
      campos: Array.from(document.querySelectorAll("input[type=text], input[type=radio], input[type=checkbox], select, textarea"))
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => ({
          id: el.id,
          tag: el.tagName.toLowerCase(),
          tipo: (el as HTMLInputElement).type || "",
          maxlength: el.getAttribute("maxlength") || "",
          // Lo que el formulario trae precargado (las fechas, la retribución, el texto del autocompletar).
          valor: el.tagName === "SELECT" ? (el as HTMLSelectElement).value : (el as HTMLInputElement).type === "checkbox" || (el as HTMLInputElement).type === "radio" ? String((el as HTMLInputElement).checked) : String((el as HTMLInputElement).value || "").replace(/(?<!\d)\d{2}-?\d{8}-?\d(?!\d)/g, "XXXXXXXXXXX").slice(0, 120),
          // Las opciones de cada select: de acá puede salir el catálogo de situaciones de baja.
          opciones: el.tagName === "SELECT" ? Array.from((el as HTMLSelectElement).options).map((o) => ({ value: o.value, texto: (o.textContent || "").trim().slice(0, 120) })) : undefined,
          // El rótulo más cercano: la celda del control, o la de al lado.
          rotulo: (((el.closest("td") as HTMLElement | null)?.previousElementSibling as HTMLElement | null)?.innerText || (el.closest("tr") as HTMLElement | null)?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 120),
        })),
      enlaces: Array.from(document.querySelectorAll("a[href]"))
        .map((a) => ({ texto: (a.textContent || "").trim().slice(0, 60), href: a.getAttribute("href") || "" }))
        .filter((a) => a.texto && !a.href.startsWith("#")),
      // Los catálogos que publica la página (`window.l_*`): nombre, cantidad y una muestra.
      catalogos: Object.keys(window)
        .filter((k) => /^l_/.test(k) && Array.isArray((window as any)[k]))
        // Entero si es chico (una tabla de motivos se siembra desde acá); si no, una muestra.
        .map((k) => ({ nombre: k, filas: (window as any)[k].length, muestra: (window as any)[k].slice(0, (window as any)[k].length <= 200 ? 200 : 5) })),
      texto: (document.body?.innerText || "").slice(0, 12000),
    };
  });
  paso++;
  const base = resolve(SALIDA, `${String(paso).padStart(2, "0")}-${nombre}`);
  writeFileSync(`${base}.html`, await motor.htmlAnonimo(page));
  writeFileSync(`${base}.json`, JSON.stringify({ ...datos, texto: datos.texto.replace(TAPAR_CUIT, "XXXXXXXXXXX") }, null, 2));
  console.log(`· ${String(paso).padStart(2, "0")}-${nombre}: action «${datos.accion}», ${datos.botones.length} botones, ${datos.campos.length} campos, catálogos: ${datos.catalogos.map((c: any) => `${c.nombre}(${c.filas})`).join(" ") || "ninguno"}`);
  return datos;
}

/** Espera a que cambie el texto del body respecto de `antes` (los botones de ARCA son postbacks sin evento de carga). */
async function esperarCambio(page: Page, antes: string, ms = 25_000): Promise<boolean> {
  const hasta = Date.now() + ms;
  for (;;) {
    const ahora = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    if (ahora !== antes) return true;
    if (Date.now() > hasta) return false;
    await esperar(150);
  }
}

/** Los controles de la fila (o filas) que contienen ese CUIL. Cada uno con lo que lo identifica. */
async function controlesDeLaFila(page: Page, cuil: string) {
  return page.evaluate((c) => {
    const filas = Array.from(document.querySelectorAll("tr")).filter((tr) => (tr.textContent || "").replace(/\D/g, "").includes(c) && !tr.querySelector("tr"));
    return filas.map((tr) => ({
      // Entera: la «Fecha de Inicio» va en la columna derecha, que en el texto viene DESPUÉS de toda la izquierda.
      texto: (tr.innerText || "").replace(/\s+/g, " ").trim().slice(0, 4000),
      controles: Array.from(tr.querySelectorAll("input[type=image], input[type=submit], input[type=button], button, a, img")).map((el, i) => ({
        i,
        id: el.id,
        tag: el.tagName.toLowerCase(),
        tipo: (el as HTMLInputElement).type || "",
        title: el.getAttribute("title") || "",
        alt: el.getAttribute("alt") || "",
        src: (el.getAttribute("src") || "").slice(0, 160),
        href: (el.getAttribute("href") || "").slice(0, 200),
        onclick: (el.getAttribute("onclick") || "").slice(0, 200),
        texto: (el.textContent || "").trim().slice(0, 60),
        visible: (el as HTMLElement).offsetParent !== null,
        // ARCA deshabilita el ícono cuando la operación no corresponde a esa relación (`disabled`, clase ImgDisabled, imagen `_off`).
        deshabilitado: (el as HTMLInputElement).disabled === true || /ImgDisabled/.test(el.className || "") || /_off\.gif$/i.test(el.getAttribute("src") || ""),
      })),
    }));
  }, cuil);
}

async function main() {
  const tenantRef = process.env.TENANT || "";
  const cuit = soloDigitos(process.env.EMPRESA_CUIT);
  if (!tenantRef || cuit.length !== 11) throw new Error("Faltan TENANT y EMPRESA_CUIT (11 dígitos).");
  const abrir = String(process.env.ABRIR || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const a of abrir) if (!ICONOS_PERMITIDOS.has(a)) throw new Error(`ABRIR=${a} no está permitido. Este script abre sólo «modificar» y «baja»; «anular» se releva con una persona mirando.`);

  mkdirSync(SALIDA, { recursive: true });
  await mongoose.connect(process.env.MONGO_URI!, { dbName: process.env.MONGO_DB_NAME });
  const db = mongoose.connection.db!;
  const tenant: any = mongoose.isValidObjectId(tenantRef) ? await Tenant.findById(tenantRef).lean() : await Tenant.findOne({ slug: tenantRef }).lean();
  if (!tenant) throw new Error(`No encontré el tenant ${tenantRef}`);

  // Los CUIL a buscar: de los contratos pedidos (sin imprimirlos enteros) o de CUIL=.
  const cuils: string[] = [];
  /** cuil → "dd/mm/aaaa" de inicio del contrato pedido: la fila que se abre es la de ESA relación. */
  const inicioDe = new Map<string, string>();
  for (const ref of String(process.env.UP || "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [id, idx] = ref.split(":");
    // Mongo no proyecta `contracts.N.campo`: se trae la fecha de todos y se toma la de la posición acá.
    const up: any = await db.collection("users_&_projects").findOne({ _id: new mongoose.Types.ObjectId(id) }, { projection: { userId: 1, "contracts.fecha_alta_contrato": 1 } });
    const u: any = up ? await db.collection("users").findOne({ _id: up.userId }, { projection: { "metadata.cuit": 1 } }) : null;
    const c = soloDigitos(u?.metadata?.cuit);
    if (c.length === 11) {
      cuils.push(c);
      const alta = String(up?.contracts?.[Number(idx)]?.fecha_alta_contrato || "").slice(0, 10);
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(alta);
      if (m) inicioDe.set(c, `${m[3]}/${m[2]}/${m[1]}`);
    } else console.log(`  (el contrato ${ref} no tiene una persona con CUIL de 11 dígitos)`);
  }
  for (const c of String(process.env.CUIL || "").split(",").map(soloDigitos).filter((c) => c.length === 11)) cuils.push(c);
  console.log(`CUIL a buscar: ${cuils.length} (${cuils.map((c) => `…${c.slice(-4)}`).join(", ") || "ninguno: sólo se mira la pantalla"})`);

  const cred = await credencialesDe(String(tenant._id));
  if (!cred) throw new Error("El tenant no tiene configurado el usuario de Simplificación Registral.");
  const sesion = await abrirSesionArca(String(tenant._id), cred);
  const page = sesion.page;
  const dialogos: string[] = [];
  // Cualquier diálogo se RECHAZA y queda anotado: acá no se confirma nada.
  page.on("dialog", (d) => {
    dialogos.push(`${d.type()}: ${d.message()}`);
    console.log(`  ⚠ ARCA preguntó «${d.message()}» y se respondió que no`);
    void d.dismiss().catch(() => {});
  });
  try {
    const { aceptarSelectorDeCuit } = (await import(pathToFileURL(MOTOR).href)) as any;
    const motor = (await import(pathToFileURL(MOTOR_ALTAS).href)) as any;
    if (!(await aceptarSelectorDeCuit(page, cuit))) throw new Error(`No pude elegir la empleadora ${cuit}.`);
    await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});
    await esperar(1500);
    const base = page.url().split("/app/")[0];

    // Por Registrar Nuevas Altas primero: desde el selector, ir derecho a otra pantalla tira la pestaña.
    await page.goto(`${base}/app/Contribuyente/RelacionLaboral/Altas.aspx`, { waitUntil: "domcontentloaded" });
    await esperar(1500);
    const enCuits = await motor.cuitsEnPantalla(page);
    if (!enCuits.includes(cuit)) throw new Error(`La pantalla no muestra el CUIT de la empleadora: no sigo.`);

    const irAModificaciones = async () => {
      await page.goto(`${base}/app/${RUTA}`, { waitUntil: "domcontentloaded" });
      await esperar(1500);
    };
    await irAModificaciones();
    const inicial = await foto(page, motor, "modificaciones");
    const accion = String(inicial.accion || "");
    if (!/Modificaciones\.aspx/i.test(accion) && !/Modificaciones\.aspx/i.test(String(inicial.url || ""))) {
      console.log(`  La pantalla no es Modificaciones (action «${accion}», url «${inicial.url}»). Guardé lo que había y corto.`);
      return;
    }

    // ¿Hay búsqueda por CUIL? Un campo cuyo id o rótulo diga CUIL y un botón que diga Continuar/Buscar/Consultar.
    const campoCuil = (inicial.campos as any[]).find((c) => c.tag === "input" && c.tipo === "text" && /cuil/i.test(`${c.id} ${c.rotulo}`));
    const botonBuscar = (inicial.botones as any[]).find((b) => /continuar|buscar|consultar/i.test(b.rotulo) && !PROHIBIDO.test(b.rotulo));
    console.log(`  búsqueda: campo ${campoCuil ? campoCuil.id : "—"} · botón ${botonBuscar ? `${botonBuscar.id} «${botonBuscar.rotulo}»` : "—"}`);

    const buscar = async (c: string): Promise<boolean> => {
      if (!campoCuil || !botonBuscar) return false;
      const campo = page.locator(`[id="${campoCuil.id}"]`);
      const btn = page.locator(`[id="${botonBuscar.id}"]`);
      if ((await campo.count()) !== 1 || (await btn.count()) !== 1) return false;
      // Si hay un radio «por CUIL», se marca (como en Consultas).
      for (const r of (inicial.campos as any[]).filter((x) => x.tipo === "radio" && /cuil/i.test(x.rotulo))) await page.locator(`[id="${r.id}"]`).check().catch(() => {});
      await campo.fill(c);
      const antes = await page.evaluate(() => document.body?.innerText || "");
      await btn.click();
      const cambio = await esperarCambio(page, antes);
      await esperar(800);
      return cambio;
    };

    for (const c of cuils) {
      const sufijo = c.slice(-4);
      if (campoCuil && botonBuscar) {
        // El resultado reemplaza al formulario: para buscar otro CUIL se vuelve a la pantalla de búsqueda.
        await irAModificaciones();
        const ok = await buscar(c);
        console.log(`  CUIL …${sufijo}: ${ok ? "la pantalla cambió después de buscar" : "la pantalla NO cambió después de buscar"}`);
      }
      await foto(page, motor, `resultado-${sufijo}`);
      const filas = await controlesDeLaFila(page, c);
      writeFileSync(resolve(SALIDA, `fila-${sufijo}.json`), JSON.stringify(filas.map((f) => ({ ...f, texto: f.texto.replace(TAPAR_CUIT, "XXXXXXXXXXX") })), null, 2));
      console.log(`  filas con ese CUIL: ${filas.length}; controles: ${filas.map((f) => f.controles.filter((x) => x.visible).map((x) => `${x.tag}#${x.id || "?"}[${x.title || x.alt || x.texto || x.src.split("/").pop()}]`).join(" ")).join(" | ")}`);

      // Abrir los íconos pedidos (sólo modificar y baja), uno por vez, volviendo a la búsqueda entre uno y otro.
      for (const op of abrir) {
        // La fila de la relación que empieza cuando el contrato (una persona puede tener decenas), y en ella el
        // ícono por su nombre exacto. Deshabilitado = ARCA no ofrece esa operación para esa relación: no se toca.
        const inicio = inicioDe.get(c);
        const filasDeLaRelacion = inicio ? filas.filter((f) => new RegExp(`Fecha de Inicio:?\\s*${inicio.replace(/\//g, "[/.-]")}`, "i").test(f.texto)) : filas;
        const sufijoIcono = op === "modificar" ? "_img_modif" : "_img_baja";
        const candidatos = filasDeLaRelacion.flatMap((f) => f.controles).filter((x) => x.visible && x.id.endsWith(sufijoIcono));
        const habilitados = candidatos.filter((x) => !x.deshabilitado);
        if (candidatos.length !== 1) {
          console.log(`  ${op}: no hay UNA fila con inicio ${inicio || "?"} para …${sufijo} (hay ${filasDeLaRelacion.length} filas, ${candidatos.length} íconos); no aprieto nada.`);
          continue;
        }
        if (habilitados.length !== 1) {
          console.log(`  ${op}: ARCA tiene el ícono deshabilitado para la relación de …${sufijo} que empieza el ${inicio}; no se puede abrir.`);
          continue;
        }
        const icono = habilitados[0];
        const actual = await page.evaluate(() => document.querySelector("form#aspnetForm")?.getAttribute("action") || "");
        if (!/Modificaciones\.aspx/i.test(actual)) {
          console.log(`  ${op}: la pantalla ya no es Modificaciones (${actual}); no aprieto nada.`);
          continue;
        }
        const antes = await page.evaluate(() => document.body?.innerText || "");
        const dialogosAntes = dialogos.length;
        await page.locator(`[id="${icono.id}"]`).click();
        const cambio = await esperarCambio(page, antes);
        // El formulario se dibuja por partes (Server.Transfer): se espera a que aparezcan sus controles, hasta 25 s.
        const hasta = Date.now() + 25_000;
        while (Date.now() < hasta && (await page.locator("[id^='ctl00_ContentPlaceHolder1_']").count().catch(() => 0)) === 0) await esperar(300);
        await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});
        await esperar(1500);
        console.log(`  ${op} de …${sufijo}: ${cambio ? "abrió algo" : "la pantalla no cambió"}${dialogos.length > dialogosAntes ? ` · diálogos: ${dialogos.slice(dialogosAntes).join(" / ")}` : ""}`);
        await foto(page, motor, `form-${op}-${sufijo}`);
        // Se vuelve por URL, sin apretar «Volver» ni nada del formulario, y se repite la búsqueda.
        await irAModificaciones();
        if (campoCuil && botonBuscar) await buscar(c);
      }
    }
    writeFileSync(resolve(SALIDA, "dialogos.json"), JSON.stringify(dialogos, null, 2));
    await guardarSesion(String(tenant._id), sesion.ctx).catch(() => {});
    console.log(`\nListo. Salida en ${SALIDA}`);
  } finally {
    await sesion.browser.close().catch(() => {});
    await mongoose.disconnect();
  }
}

main().catch(async (e) => {
  console.error("Error:", e?.message || e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
