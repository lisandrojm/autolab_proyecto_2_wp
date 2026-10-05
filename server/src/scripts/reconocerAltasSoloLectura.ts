/**
 * RECONOCIMIENTO DE SÓLO LECTURA de las pantallas de altas de ARCA, sin nadie tipeando.
 *
 * Para qué: la corrida de Altas Masivas por tandas necesita saber cosas que el motor nunca miró —el
 * texto del tope del pegado («máximo N registros»), cómo es Relaciones Laborales → Consultas, qué
 * enlaces tiene el menú—. `reconocerAltasArca.ts` lo hace con una persona eligiendo botones; este
 * recorre una lista fija de pantallas y guarda lo que ve.
 *
 * LO ÚNICO QUE APRIETA es «Altas Masivas» (abre el cuadro del pegado; no escribe nada), y por la
 * lista blanca del motor (`boton()`), que tira si la pantalla no es la suya. No llena campos salvo
 * que se pida una consulta (`CONSULTA_CUIL`), que es una búsqueda: no modifica nada en el organismo.
 * Nunca «Aceptar», nunca «Reiniciar», nunca «Enviar».
 *
 * La salida va a `SALIDA` (por defecto una carpeta temporal), NO al repo: el HTML se guarda con los
 * CUIL/CUIT tapados, pero una pantalla de consulta trae nombres. Se revisa a mano antes de convertir
 * nada en fixture.
 *
 * Uso (desde server/):
 *
 *   ./node_modules/.bin/dotenv -e .env.production -v TENANT=<slug o id> -v EMPRESA_CUIT=30717068374 \
 *     -v SALIDA=<carpeta> [-v VISITAR=<ruta1.aspx,ruta2.aspx>] [-v PEGADO=1] -- tsx src/scripts/reconocerAltasSoloLectura.ts
 *
 *   VISITAR   rutas relativas a /app/ (además de Contribuyente/RelacionLaboral/Altas.aspx, que va siempre)
 *   PEGADO=1  abre «Altas Masivas» para leer el texto del tope, y vuelve sin pegar nada
 *   CONSULTA_CUIL=<cuil | grilla>  busca ese CUIL en Relaciones Laborales → Consultas (con el lector
 *             del motor) y guarda la pantalla de resultado. CONSULTA_FECHA=ddmmaaaa es la fecha de inicio
 *             que se espera ver.
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

const SALIDA = resolve(process.env.SALIDA || resolve(tmpdir(), "reconocer-altas"));
const TAPAR_CUIT = /(?<!\d)\d{2}-?\d{8}-?\d(?!\d)/g;

let paso = 0;
/** Guarda la pantalla: HTML con los CUIT tapados y un JSON con lo que sirve para escribir selectores. */
async function foto(page: Page, motor: any, nombre: string): Promise<void> {
  const datos = await page.evaluate(() => {
    // Sin funciones con nombre acá adentro: tsx les agrega un `__name` que en el navegador no existe.
    return {
      url: location.pathname,
      accion: document.querySelector("form#aspnetForm")?.getAttribute("action") || "",
      ids: Array.from(document.querySelectorAll("[id^='ctl00_']")).map((e) => e.id),
      botones: Array.from(document.querySelectorAll("input[type=submit], input[type=button], input[type=image], button, a[href^='javascript:']"))
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => ({ id: el.id, tag: el.tagName.toLowerCase(), tipo: (el as HTMLInputElement).type || "", rotulo: ((el as HTMLInputElement).value || el.getAttribute("title") || el.getAttribute("alt") || el.textContent || "").trim().slice(0, 80), href: el.getAttribute("href") || "" })),
      campos: Array.from(document.querySelectorAll("input[type=text], input[type=radio], input[type=checkbox], select, textarea"))
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => ({ id: el.id, tag: el.tagName.toLowerCase(), tipo: (el as HTMLInputElement).type || "", maxlength: el.getAttribute("maxlength") || "" })),
      // TODOS los enlaces, también los del menú desplegable (ocultos): de acá sale dónde queda Consultas.
      enlaces: Array.from(document.querySelectorAll("a[href]"))
        .map((a) => ({ texto: (a.textContent || "").trim().slice(0, 60), href: a.getAttribute("href") || "" }))
        .filter((a) => a.texto && !a.href.startsWith("#")),
      texto: (document.body?.innerText || "").slice(0, 8000),
    };
  });
  paso++;
  const base = resolve(SALIDA, `${String(paso).padStart(2, "0")}-${nombre}`);
  writeFileSync(`${base}.html`, await motor.htmlAnonimo(page));
  writeFileSync(`${base}.json`, JSON.stringify({ ...datos, texto: datos.texto.replace(TAPAR_CUIT, "XXXXXXXXXXX"), pantalla: motor.pantallaAltas(datos) }, null, 2));
  console.log(`· ${String(paso).padStart(2, "0")}-${nombre}: action «${datos.accion}», ${datos.botones.length} botones, ${datos.campos.length} campos`);
}

async function main() {
  const tenantRef = process.env.TENANT || "";
  const cuit = String(process.env.EMPRESA_CUIT || "").replace(/\D/g, "");
  if (!tenantRef || cuit.length !== 11) throw new Error("Faltan TENANT y EMPRESA_CUIT (11 dígitos).");
  mkdirSync(SALIDA, { recursive: true });
  await mongoose.connect(process.env.MONGO_URI!, { dbName: process.env.MONGO_DB_NAME });
  const tenant: any = mongoose.isValidObjectId(tenantRef) ? await Tenant.findById(tenantRef).lean() : await Tenant.findOne({ slug: tenantRef }).lean();
  if (!tenant) throw new Error(`No encontré el tenant ${tenantRef}`);
  const cred = await credencialesDe(String(tenant._id));
  if (!cred) throw new Error("El tenant no tiene configurado el usuario de Simplificación Registral.");
  const sesion = await abrirSesionArca(String(tenant._id), cred);
  const page = sesion.page;
  // Cualquier diálogo se rechaza: acá no se confirma nada.
  page.on("dialog", (d) => void d.dismiss().catch(() => {}));
  try {
    const { aceptarSelectorDeCuit } = (await import(pathToFileURL(MOTOR).href)) as any;
    const motor = (await import(pathToFileURL(MOTOR_ALTAS).href)) as any;
    if (!(await aceptarSelectorDeCuit(page, cuit))) throw new Error(`No pude elegir la empleadora ${cuit}.`);
    const base = page.url().split("/app/")[0];
    await foto(page, motor, "inicio");

    // SIN_ALTAS=1: va derecho a lo que se pida en VISITAR, sin pasar antes por Registrar Nuevas Altas
    // (para reproducir el recorrido de la descarga de constancias, que entra directo a Consultas).
    let enGrilla: string[] = [];
    if (process.env.SIN_ALTAS !== "1") {
      await page.goto(`${base}/app/Contribuyente/RelacionLaboral/Altas.aspx`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      await foto(page, motor, "altas");
      enGrilla = await motor.cuilsEnGrilla(page);
      console.log(`  grilla: ${enGrilla.length} CUIL`);
    }

    if (process.env.PEGADO === "1" && (await motor.pantallaActual(page)) === "altas") {
      await (await motor.boton(page, "altas_masivas")).click();
      await page.waitForTimeout(2500);
      await foto(page, motor, "pegado");
    }

    for (const ruta of String(process.env.VISITAR || "").split(",").map((r) => r.trim()).filter(Boolean)) {
      await page.goto(`${base}/app/${ruta.replace(/^\/+/, "")}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      await foto(page, motor, (ruta.split("/").pop() || "pantalla").replace(/\.aspx.*$/i, ""));
    }
    // Consulta por CUIL: una búsqueda, no modifica nada. «grilla» = el primer CUIL que ya está en la grilla.
    const pedido = String(process.env.CONSULTA_CUIL || "");
    const cuil = pedido === "grilla" ? enGrilla[0] || "" : pedido.replace(/\D/g, "");
    if (cuil.length === 11) {
      const r = await motor.consultarAltaPorCuil({ page, cuil, fechaInicio: String(process.env.CONSULTA_FECHA || "") });
      console.log(`  consulta: ${r.encontrada === true ? "el alta figura (CUIL y fecha en pantalla)" : "sin confirmar"}`);
      await foto(page, motor, "consulta-resultado");
    }
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
