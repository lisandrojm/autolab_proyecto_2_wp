/**
 * Las garantías del motor que PRESENTA altas en ARCA. Si alguno de estos falla, no se toca el test:
 * se mira qué cambió en el motor.
 *
 *   node --test tools/altas-arca.test.mjs     (o `npm run test:arca:altas`)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { BOTONES, POR_RELEVAR, PREFIJO, TOPE_PEGADO, altaEnConsulta, boton, pantallaAltas, registroRechazadoDelPegado, topeDelPegado } from "./altas-arca.mjs";

// Con fin de línea normalizado: en un checkout de Windows (autocrlf) el archivo llega con CRLF, y los
// tests que recortan la fuente por un marcador con salto de línea no lo encontraban.
const FUENTE = readFileSync("tools/altas-arca.mjs", "utf8").replace(/\r\n/g, "\n");
// Sin comentarios: un `/* … */` que no empieza cada línea con `*` engañaba al filtro por línea.
const CODIGO = FUENTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const cuerpo = (nombre) => {
  const i = CODIGO.indexOf(`function ${nombre}(`);
  assert.ok(i >= 0, `no encuentro la función ${nombre}`);
  const j = CODIGO.indexOf("\n}\n", i);
  return CODIGO.slice(i, j);
};

// ------------------------------------------------------------------ los clicks
test("hay EXACTAMENTE cuatro clicks y son `btn.click()`: apretar, enviarNovedad, aceptarGrilla, quitarFila", () => {
  const sospechosas = CODIGO.split("\n").filter((l) => /\.click\(/.test(l));
  for (const l of sospechosas) assert.match(l, /^\s*await btn\.click\(\);\s*$/, `click fuera de las guardas:\n  ${l.trim()}`);
  assert.equal(sospechosas.length, 4);
  assert.match(cuerpo("apretar"), /btn\.click\(\)/);
  assert.match(cuerpo("enviarNovedad"), /btn\.click\(\)/);
  assert.match(cuerpo("aceptarGrilla"), /btn\.click\(\)/);
  assert.match(cuerpo("quitarFila"), /btn\.click\(\)/);
});

test("quitarFila solo borra una fila NUESTRA, buscada por su CUIL, y solo en la grilla", () => {
  const c = cuerpo("quitarFila");
  // Las tres guardas van ANTES del click: el CUIL es del lote, la pantalla es la grilla, la fila es una sola.
  const iClick = c.indexOf("btn.click()");
  assert.ok(c.indexOf("if (!delLote.includes(cuil)) throw") >= 0 && c.indexOf("if (!delLote.includes(cuil)) throw") < iClick);
  assert.ok(c.indexOf('!== "altas") throw') >= 0 && c.indexOf('!== "altas") throw') < iClick);
  assert.ok(c.indexOf("idsCuil.length !== 1) throw") >= 0 && c.indexOf("idsCuil.length !== 1) throw") < iClick);
  // El «Borrar» de fila no se nombra en ningún otro lado del motor.
  assert.equal(CODIGO.split("_RAR_Eliminar").length - 1, 1);
  assert.ok(c.includes("_RAR_Eliminar"));
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
    const iCuit = c.indexOf("verificarEmpleadora(");
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
  assert.ok(am.indexOf("if (sobran.length > 0)") >= 0 && am.indexOf("if (sobran.length > 0)") < am.indexOf("aceptarGrilla("));
  // Por tandas: el tope de la pantalla se lee antes de pegar, y el contrato se marca antes del Aceptar.
  assert.ok(am.indexOf("topeDelPegado(") >= 0 && am.indexOf("topeDelPegado(") < am.indexOf("area.fill(texto)"));
  assert.ok(am.indexOf("await antesDeAceptar(aPresentar)") >= 0 && am.indexOf("await antesDeAceptar(aPresentar)") < am.indexOf("aceptarGrilla("));
  // UN solo Aceptar de la grilla por tanda: el bucle del pegado no lo alcanza.
  assert.equal(am.split("aceptarGrilla(").length - 1, 1);
  assert.ok(am.indexOf("for (;;)") < am.indexOf("aceptarGrilla(") && am.indexOf("break;") < am.indexOf("aceptarGrilla("));
});

test("leer el tope y consultar no presentan nada: ni Aceptar de la grilla, ni Enviar, ni pegado", () => {
  for (const f of ["leerTopeAltasMasivas", "consultarAltaPorCuil"]) {
    const c = cuerpo(f);
    assert.doesNotMatch(c, /aceptarGrilla\(|enviarNovedad\(|aceptar_pegado|quitarFila\(/, `${f} solo lee`);
  }
  assert.doesNotMatch(cuerpo("leerTopeAltasMasivas"), /\.fill\(/, "leer el tope no escribe en el cuadro");
});

test("la verificación de CUIT tira, no devuelve false", () => {
  const c = cuerpo("verificarEmpleadora");
  assert.match(c, /if \(!enPantalla\.includes\(cuit\)\) throw/);
  // Elegir la empleadora pasa SIEMPRE por el selector, aunque la página ya esté adentro con otra.
  assert.match(cuerpo("entrarComo"), /aceptarSelectorDeCuit\(page, cuit\)/);
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

// ------------------------------------------------------------------ por tandas (puro)

test("topeDelPegado lee el tope de la pantalla real del pegado, y null si no lo dice", () => {
  const fx = JSON.parse(readFileSync("../server/src/services/arca/fixtures/02-ArchivoAltas.json", "utf8"));
  assert.equal(topeDelPegado(fx.texto), 9);
  assert.equal(topeDelPegado("Ingrese el texto correspondiente a los registros (máximo 5 registros)"), 5);
  assert.equal(topeDelPegado("Ingrese el texto correspondiente a los registros"), null);
  assert.equal(topeDelPegado("maximo 0 registros"), null);
  assert.equal(TOPE_PEGADO, 9);
});

test("registroRechazadoDelPegado: solo si ARCA dice cuál (por CUIL o por número); si no, -1", () => {
  const regs = ["20111111112" + "0".repeat(74), "27222222223" + "0".repeat(74), "20333333334" + "0".repeat(74)];
  assert.equal(registroRechazadoDelPegado("Error: el CUIL 27-22222222-3 no es válido", regs), 1);
  assert.equal(registroRechazadoDelPegado("Error en el registro 3: fecha inválida", regs), 2);
  assert.equal(registroRechazadoDelPegado("Error en la línea Nro. 1", regs), 0);
  assert.equal(registroRechazadoDelPegado("El formato del texto es incorrecto", regs), -1);
  assert.equal(registroRechazadoDelPegado("Error en el registro 7", regs), -1, "un número fuera del lote no elige a nadie");
  assert.equal(registroRechazadoDelPegado("Errores en 20111111112 y 27222222223", regs), -1, "dos CUIL: no se elige uno");
});

test("altaEnConsulta afirma solo lo positivo: true con CUIL y fecha en pantalla, y nunca false", () => {
  const pantalla = "CONSULTAS DE RELACIONES LABORALES\n20-11111111-2 PERSONA 1\nFecha de inicio 05/10/2026 Alta";
  assert.equal(altaEnConsulta(pantalla, "20111111112", "05102026"), true);
  assert.equal(altaEnConsulta(pantalla, "20111111112", "06102026"), null, "otra fecha: no se afirma nada");
  assert.equal(altaEnConsulta(pantalla, "27222222223", "05102026"), null);
  assert.equal(altaEnConsulta("No se encontraron registros", "20111111112", "05102026"), null, "no verla NO es «no está»");
  assert.equal(altaEnConsulta(pantalla, "20111111112", ""), null);
});

test("las pantallas relevadas: grilla con una fila, pegado y formulario de Consultas", () => {
  const fx = (f) => JSON.parse(readFileSync(`../server/src/services/arca/fixtures/${f}`, "utf8"));
  const altas = fx("01-Altas-con-una-fila.json");
  assert.equal(pantallaAltas(altas), "altas");
  // El «Borrar» de fila y el CUIL de la fila existen con los ids que usa quitarFila.
  assert.ok(altas.ids.some((id) => /rptRegistrosAlta_ctl\d+_RAR_lblCuil$/.test(id)));
  assert.ok(altas.botones.some((b) => /rptRegistrosAlta_ctl\d+_RAR_Eliminar$/.test(b.id) && b.rotulo === "Borrar"));
  const pegado = fx("02-ArchivoAltas.json");
  assert.equal(pantallaAltas(pegado), "archivo_altas");
  assert.ok(pegado.botones.some((b) => b.id === PREFIJO + BOTONES.volver_del_pegado.id));
  const consulta = fx("03-Consulta.json");
  assert.equal(pantallaAltas(consulta), "consulta");
  assert.ok(consulta.botones.some((b) => b.id === PREFIJO + BOTONES.consulta_continuar.id));
  assert.ok(consulta.ids.includes(PREFIJO + "rb1") && consulta.ids.includes(PREFIJO + "inputCuil_txtCuil"));
  // Sin el criterio por CUIL (la pantalla de resultado) ya no es el formulario.
  assert.equal(pantallaAltas({ accion: "./Consulta.aspx", ids: [PREFIJO + "btnVolver"] }), "otra");
});
