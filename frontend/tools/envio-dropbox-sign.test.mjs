/**
 * Las garantías del motor que ENVÍA A LA FIRMA en Dropbox Sign (patrón `altas-arca.test.mjs`).
 *
 *   node --test tools/envio-dropbox-sign.test.mjs     (o `npm run test:dropbox-sign`)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BOTONES, IRREVERSIBLE } from "./envio-dropbox-sign.mjs";

const FUENTE = readFileSync("tools/envio-dropbox-sign.mjs", "utf8").replace(/\r\n/g, "\n");
const CODIGO = FUENTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const cuerpo = (nombre) => {
  const i = CODIGO.indexOf(`function ${nombre}(`);
  assert.ok(i >= 0, `no encuentro la función ${nombre}`);
  const j = CODIGO.indexOf("\n}\n", i);
  return CODIGO.slice(i, j);
};

test("hay EXACTAMENTE dos clicks y son `btn.click()`: apretar (lista blanca) y enviarParaFirmar (irreversible)", () => {
  const clicks = CODIGO.split("\n").filter((l) => /\.click\(/.test(l));
  for (const l of clicks) assert.match(l, /^\s*await btn\.click\(\);\s*$/, `click fuera de las guardas:\n  ${l.trim()}`);
  assert.equal(clicks.length, 2);
  assert.match(cuerpo("apretar"), /btn\.click\(\)/);
  assert.match(cuerpo("enviarParaFirmar"), /btn\.click\(\)/);
});

test("la lista blanca no incluye nada destructivo ni el irreversible", () => {
  for (const [clave, def] of Object.entries(BOTONES)) {
    const n = def.nombre ? def.nombre.source : def.css;
    assert.doesNotMatch(n, /eliminar|borrar|cancelar plan|configuraci[oó]n de cuenta|enviar para firmar/i, clave);
  }
  assert.ok(!Object.values(BOTONES).some((b) => b.nombre && b.nombre.source === IRREVERSIBLE.nombre.source), "«Enviar para firmar» no puede estar en BOTONES");
  // `apretar` sólo acepta claves de la lista blanca.
  assert.match(cuerpo("apretar"), /ubicar\(page, clave\)/);
  assert.match(cuerpo("ubicar"), /if \(!def\) throw/);
});

test("el guard, el modo seco y el último «Detener» van ANTES del irreversible, y después no hay reintentos", () => {
  const c = cuerpo("enviarDocumento");
  const iGuard = c.indexOf("guard({");
  const iSeco = c.indexOf("if (enSeco)");
  const iCortar = c.lastIndexOf("cortar(señal");
  const iAviso = c.indexOf("antesDelIrreversible()");
  const iIrr = c.indexOf("enviarParaFirmar(page)");
  assert.ok(iGuard >= 0 && iGuard < iSeco, "el guard corre antes del modo seco");
  assert.ok(iSeco < iCortar && iCortar < iAviso && iAviso < iIrr, "seco → último Detener → aviso irreversible → click");
  assert.ok(c.indexOf("cortar(señal", iIrr) < 0, "después del irreversible «Detener» ya no corta");
  assert.equal(c.split("enviarParaFirmar(page)").length - 1, 1, "un solo «Enviar para firmar» por documento");
  assert.doesNotMatch(cuerpo("enviarParaFirmar"), /for\s*\(|while\s*\(|retry|reintent/i);
  // Sin colocación conocida se devuelve requiere_revision antes de tocar nada.
  assert.ok(c.indexOf('if (!colocacion) return { resultado: "requiere_revision"') < c.indexOf("page.goto("));
});

test("no lanza navegadores ni toca credenciales: la sesión la trae el servidor", () => {
  assert.doesNotMatch(CODIGO, /chromium\.launch|connectOverCDP|from ["']playwright/);
  assert.doesNotMatch(CODIGO, /password|credencial|claveEnc|decryptSecret|loginPassword/i);
});

test("el título y el CC se escriben por `name` y el documento se carga por input[type=file], no por el chooser de Dropbox", () => {
  const c = cuerpo("enviarDocumento");
  assert.ok(c.includes('escribir(page, "document.title", archivo)'));
  assert.ok(c.includes('escribir(page, "ccRecipients.0.email", cc)'));
  assert.ok(c.includes('escribir(page, "recipients.0.name", firmante.nombre)'));
  assert.ok(c.includes('escribir(page, "recipients.0.email", firmante.email)'));
  assert.ok(c.includes("setInputFiles(rutaPdf)"));
  assert.doesNotMatch(c, /dropbox\.com\/chooser|frameLocator/);
});

test("la verificación del campo de firma va antes del Siguiente de revisión, y si falla no se envía", () => {
  const c = cuerpo("enviarDocumento");
  const iVerif = c.indexOf("camposDeFirma(page, firmante.nombre)");
  const iSinColocar = c.indexOf("if (!colocado)");
  const iIrr = c.indexOf("enviarParaFirmar(page)");
  assert.ok(iVerif >= 0 && iVerif < iSinColocar && iSinColocar < iIrr);
  assert.ok(c.slice(iSinColocar, iIrr).includes('resultado: "requiere_revision"'));
});
