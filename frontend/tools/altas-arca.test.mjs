/**
 * Las garantías del motor que PRESENTA altas en ARCA. Si alguno de estos falla, no se toca el test:
 * se mira qué cambió en el motor.
 *
 *   node --test tools/altas-arca.test.mjs     (o `npm run test:arca:altas`)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { BOTONES, POR_RELEVAR, PREFIJO, boton, pantallaAltas } from "./altas-arca.mjs";

const FUENTE = readFileSync("tools/altas-arca.mjs", "utf8");
// Sin comentarios: un `/* … */` que no empieza cada línea con `*` engañaba al filtro por línea.
const CODIGO = FUENTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const cuerpo = (nombre) => {
  const i = CODIGO.indexOf(`function ${nombre}(`);
  assert.ok(i >= 0, `no encuentro la función ${nombre}`);
  const j = CODIGO.indexOf("\n}\n", i);
  return CODIGO.slice(i, j);
};

// ------------------------------------------------------------------ los clicks
test("hay EXACTAMENTE tres clicks y los tres son `btn.click()`: apretar, enviarNovedad, aceptarGrilla", () => {
  const sospechosas = CODIGO.split("\n").filter((l) => /\.click\(/.test(l));
  for (const l of sospechosas) assert.match(l, /^\s*await btn\.click\(\);\s*$/, `click fuera de las guardas:\n  ${l.trim()}`);
  assert.equal(sospechosas.length, 3);
  assert.match(cuerpo("apretar"), /btn\.click\(\)/);
  assert.match(cuerpo("enviarNovedad"), /btn\.click\(\)/);
  assert.match(cuerpo("aceptarGrilla"), /btn\.click\(\)/);
});

test("los dos irreversibles NO están en la lista blanca de `apretar`", () => {
  const ids = Object.values(BOTONES).map((b) => `${b.id}@${b.pantalla}`);
  assert.ok(!ids.includes("Button_envio@carga_masiva_principal"));
  assert.ok(!ids.includes("btnAceptar@altas"), "el Aceptar de la GRILLA registra: no puede estar en BOTONES");
  // El btnAceptar que sí está es el del PEGADO, en otra pantalla.
  assert.equal(BOTONES.aceptar_pegado.pantalla, "archivo_altas");
});

test("nunca Reiniciar, nunca borrar filas, nunca por posición", () => {
  assert.doesNotMatch(CODIGO, /btnReiniciar|Button_borrar|Button_edit/);
  assert.doesNotMatch(CODIGO, /\.nth\(|\.first\(\)|\.last\(\)/);
  assert.doesNotMatch(CODIGO, /Promise\.all/);
});

test("no lanza navegadores ni toca claves: la sesión la trae el servidor", () => {
  assert.doesNotMatch(CODIGO, /chromium\.launch|connectOverCDP|from ["']playwright/);
  // «clave fiscal» SÍ aparece: es el texto con el que ARCA avisa que se cayó la sesión, y se detecta.
  // Lo que no puede haber es escribir una contraseña.
  assert.doesNotMatch(CODIGO, /password|credencial|claveEnc|decryptSecret/i);
});

test("ningún reintento alrededor de los irreversibles", () => {
  for (const f of ["enviarNovedad", "aceptarGrilla"]) {
    const c = cuerpo(f);
    assert.doesNotMatch(c, /for\s*\(|while\s*\(|retry|reintent/i, `${f} no puede reintentar`);
  }
});

// ------------------------------------------------------------------ el orden de las guardas
test("CUIT verificado antes de la primera escritura, y el modo en seco antes del irreversible", () => {
  for (const [f, irreversible] of [
    ["cargaMasiva", "enviarNovedad("],
    ["altasMasivas", "aceptarGrilla("],
  ]) {
    const c = cuerpo(f);
    const iCuit = c.indexOf("entrarComo(");
    const iPrimera = c.indexOf("apretar(");
    const iSeco = c.indexOf("if (enSeco)");
    const iIrr = c.indexOf(irreversible);
    assert.ok(iCuit >= 0 && iCuit < iPrimera, `${f}: la empleadora se verifica antes de apretar nada`);
    assert.ok(iSeco >= 0 && iSeco < iIrr, `${f}: el modo en seco corta antes de ${irreversible}`);
    assert.ok(c.lastIndexOf("cortar(señal", iIrr) > iSeco, `${f}: «Detener» se mira una última vez antes de ${irreversible}`);
    assert.ok(c.indexOf("cortar(señal", iIrr) < 0, `${f}: después de ${irreversible} «Detener» ya no corta`);
  }
  // El de Altas Masivas corta en seco ANTES del pegado→grilla: no deja filas en la grilla de ARCA.
  const am = cuerpo("altasMasivas");
  assert.ok(am.indexOf("if (enSeco)") < am.indexOf('apretar(page, "aceptar_pegado")'));
  // La grilla se exige vacía antes de pegar, y con los CUIL exactos antes de aceptar.
  assert.ok(am.indexOf("previas.length > 0") < am.indexOf('apretar(page, "altas_masivas")'));
  assert.ok(am.indexOf("sobran.length > 0 || faltan.length > 0") < am.indexOf("aceptarGrilla("));
});

test("la verificación de CUIT tira, no devuelve false", () => {
  const c = cuerpo("entrarComo");
  assert.match(c, /if \(!enPantalla\.includes\(cuit\)\) throw/);
});

// ------------------------------------------------------------------ boton()
const paginaFalsa = (pantalla) => {
  const pedidos = [];
  const accion = { carga_masiva_principal: "./CargaMasiva_principal.aspx", altas: "./Altas.aspx", archivo_altas: "./ArchivoAltas.aspx" }[pantalla] || "./Otra.aspx";
  const ids = { carga_masiva_principal: [PREFIJO + "lblEstado"], altas: [PREFIJO + "btnArchivoAltas"], archivo_altas: [PREFIJO + "txtRegistrosAltas"] }[pantalla] || [];
  return {
    pedidos,
    evaluate: async () => ({ accion, ids, texto: "" }),
    locator: (sel) => {
      pedidos.push(sel);
      return { count: async () => 1, click: async () => {} };
    },
  };
};

test("boton() rechaza claves fuera de la lista sin tocar la página", async () => {
  const p = paginaFalsa("altas");
  await assert.rejects(boton(p, "enviar"), /no aprieta/);
  await assert.rejects(boton(p, "aceptar_grilla"), /no aprieta/);
  await assert.rejects(boton(p, "reiniciar"), /no aprieta/);
  assert.equal(p.pedidos.length, 0);
});

test("boton() tira si la pantalla no es la del botón (el Aceptar del pegado NO se aprieta en la grilla)", async () => {
  const p = paginaFalsa("altas");
  await assert.rejects(boton(p, "aceptar_pegado"), /pantalla es altas/);
  assert.equal(p.pedidos.length, 0);
  const q = paginaFalsa("archivo_altas");
  await boton(q, "aceptar_pegado");
  assert.deepEqual(q.pedidos, [`[id="${PREFIJO}btnAceptar"]`]);
});

test("lo no relevado tira en vez de adivinar", async () => {
  assert.equal(BOTONES.cargar.id, POR_RELEVAR);
  await assert.rejects(boton(paginaFalsa("otra"), "cargar"), /todavía no se relevó/);
});

// ------------------------------------------------------------------ pantallaAltas (puro)
test("pantallaAltas reconoce por el formulario, no por la URL", () => {
  // La barra dice Altas.aspx pero el formulario es el del pegado (Server.Transfer).
  assert.equal(pantallaAltas({ accion: "./ArchivoAltas.aspx", ids: [PREFIJO + "txtRegistrosAltas", PREFIJO + "btnAceptar"] }), "archivo_altas");
  assert.equal(pantallaAltas({ accion: "./Altas.aspx", ids: [PREFIJO + "InputCuil_txtCuil", PREFIJO + "btnArchivoAltas", PREFIJO + "btnAceptar"] }), "altas");
  assert.equal(pantallaAltas({ accion: "./CargaMasiva.aspx", ids: [PREFIJO + "listaNovedades_ctl00_Button_nuevo"] }), "carga_masiva_listado");
  assert.equal(pantallaAltas({ accion: "./CargaMasiva_principal.aspx", ids: [PREFIJO + "lblEstado", PREFIJO + "Button_envio"] }), "carga_masiva_principal");
  assert.equal(pantallaAltas({ accion: "./CargaMasiva_rel_abm.aspx", ids: [PREFIJO + "Button3"] }), "carga_masiva_rel_abm");
  assert.equal(pantallaAltas({ accion: "../login/IndexContribuyente.aspx", ids: [] }), "selector_cuit");
  assert.equal(pantallaAltas({ accion: "./Altas.aspx", ids: [] }), "otra", "sin sus controles no se da por buena");
  assert.equal(pantallaAltas({ accion: "./Altas.aspx", ids: [], texto: "Su sesión ha finalizado" }), "sin_sesion");
});

test("pantallaAltas contra los fixtures del reconocimiento (si ya se corrió)", () => {
  const dir = "../server/src/services/arca/fixtures";
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const fx = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    const p = pantallaAltas({ accion: fx.accion, ids: fx.ids });
    // Cada fixture se nombra con el action: el clasificador no puede decir «otra» de una pantalla conocida.
    if (/ArchivoAltas|CargaMasiva|(^|-)Altas/.test(f)) assert.notEqual(p, "otra", `${f} no se reconoce`);
  }
});
