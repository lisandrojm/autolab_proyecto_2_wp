/**
 * Las garantías del motor que PRESENTA altas en ARCA. Si alguno de estos falla, no se toca el test:
 * se mira qué cambió en el motor.
 *
 *   node --test tools/altas-arca.test.mjs     (o `npm run test:arca:altas`)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { BOTONES, POR_RELEVAR, PREFIJO, TOPE_PEGADO, altaEnConsulta, boton, elegirEnResultadoDeConsulta, fechaEnTexto, motivoDelRechazo, pantallaAltas, registroRechazadoDelPegado, topeDelPegado } from "./altas-arca.mjs";

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
test("hay EXACTAMENTE cinco clicks y son `btn.click()`: apretar, enviarNovedad, aceptarGrilla, quitarFila, imprimirConstancia", () => {
  const sospechosas = CODIGO.split("\n").filter((l) => /\.click\(/.test(l));
  for (const l of sospechosas) assert.match(l, /^\s*await btn\.click\(\);\s*$/, `click fuera de las guardas:\n  ${l.trim()}`);
  assert.equal(sospechosas.length, 5);
  assert.match(cuerpo("imprimirConstancia"), /btn\.click\(\)/);
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
  // Por el selector de CUIT se entra una sola vez por sesión: volver a él desde adentro la cierra (FinSession).
  assert.ok(am.includes('yaAdentro ? page.url().split("/app/")[0] : await entrarComo(page, empresaCuit)'));
  for (const f of ["consultarAltaPorCuil", "buscarEnConsultas", "descargarConstanciaDeAlta"]) assert.equal(cuerpo(f).includes("entrarComo("), false, `${f} no vuelve al selector`);
  // UN solo Aceptar de la grilla por tanda: el bucle del pegado no lo alcanza.
  assert.equal(am.split("aceptarGrilla(").length - 1, 1);
  assert.ok(am.indexOf("for (;;)") < am.indexOf("aceptarGrilla(") && am.indexOf("break;") < am.indexOf("aceptarGrilla("));
});

test("leer el tope y consultar no presentan nada: ni Aceptar de la grilla, ni Enviar, ni pegado", () => {
  for (const f of ["leerTopeAltasMasivas", "consultarAltaPorCuil", "buscarEnConsultas", "descargarConstanciaDeAlta", "imprimirConstancia", "entrarARelacionesLaborales"]) {
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

// ------------------------------------------------------------------ la constancia (puro)

test("la impresora solo se aprieta en Consultas, nunca en la grilla de altas, y sobre un control único", () => {
  const c = cuerpo("imprimirConstancia");
  const iClick = c.indexOf("btn.click()");
  assert.ok(c.indexOf("Consulta") >= 0 && c.indexOf("no se aprieta la impresora") < iClick);
  assert.ok(c.indexOf('=== "altas") throw') >= 0 && c.indexOf('=== "altas") throw') < iClick);
  assert.ok(c.indexOf("!== 1) throw") >= 0 && c.indexOf("!== 1) throw") < iClick);
});

test("elegirEnResultadoDeConsulta: la casilla de la relación por su fecha, y UNA impresora; si no, no elige", () => {
  const casillas = [
    { id: "chkTodos", fila: "CUIL Apellido y nombre Inicio Cese" },
    { id: "grid_ctl02_chk", fila: "20-11111111-2 PEREZ JUAN 01/10/2026 31/10/2026" },
    { id: "grid_ctl03_chk", fila: "20-11111111-2 PEREZ JUAN 19/04/2026 19/04/2026" },
  ];
  const controles = [
    { id: "btnVolver", tag: "input", pista: "btnVolver Volver" },
    { id: "btnBajar", tag: "input", pista: "btnBajar Bajar archivo" },
    { id: "imgPrint", tag: "input", pista: "imgPrint ../images/ico_imprimir.gif Imprimir" },
  ];
  assert.deepEqual(elegirEnResultadoDeConsulta({ casillas, controles, fecha: "01/10/2026" }), { ok: true, casilla: "grid_ctl02_chk", impresora: "imgPrint" });
  // «Bajar archivo» es el TXT: no se nombra como impresora y no se elige.
  assert.equal(elegirEnResultadoDeConsulta({ casillas, controles: controles.slice(0, 2), fecha: "01/10/2026" }).motivo, "sin_impresora");
  // Sin relación con esa fecha, o con dos, no se tilda ninguna.
  assert.equal(elegirEnResultadoDeConsulta({ casillas, controles, fecha: "05/10/2026" }).motivo, "sin_relacion");
  assert.equal(elegirEnResultadoDeConsulta({ casillas: [...casillas, { id: "grid_ctl04_chk", fila: "otra 01/10/2026" }], controles, fecha: "01/10/2026" }).motivo, "ambigua");
  // Dos controles que se nombran impresora: no se adivina cuál.
  assert.equal(elegirEnResultadoDeConsulta({ casillas, controles: [...controles, { id: "lnkImprimirTodo", tag: "a", pista: "lnkImprimirTodo Imprimir" }], fecha: "01/10/2026" }).motivo, "sin_impresora");
  // La imagen dentro de su botón: vale el botón.
  assert.equal(elegirEnResultadoDeConsulta({ casillas, controles: [...controles, { id: "imgAdentro", tag: "img", pista: "ico_imprimir.gif" }], fecha: "01/10/2026" }).impresora, "imgPrint");
});

test("fechaEnTexto tolera cómo escriba la fecha la grilla, y no confunde otra", () => {
  for (const fila of ["Inicio 01/10/2026 Cese 31/10/2026", "1/10/2026", "01-10-2026", "01.10.2026", "2026-10-01 00:00"]) assert.equal(fechaEnTexto(fila, "01/10/2026"), true, fila);
  for (const fila of ["11/10/2026", "01/10/20261", "31/10/2026", "21/10/2026", "01/11/2026", ""]) assert.equal(fechaEnTexto(fila, "01/10/2026"), false, fila);
  assert.equal(fechaEnTexto("01/10/2026", "no es fecha"), false);
});

test("cuando no hay una sola relación, el detalle dice qué traía cada fila", () => {
  const r = elegirEnResultadoDeConsulta({ casillas: [{ id: "a", fila: "PEREZ 19/04/2026 19/04/2026" }, { id: "todos", fila: "" }], controles: [], fecha: "01/10/2026" });
  assert.equal(r.motivo, "sin_relacion");
  assert.match(r.detalle, /Filas: \[PEREZ 19\/04\/2026 19\/04\/2026\] \[sin texto\]/);
});

test("la tarjeta de la relación se reconoce por su «Fecha de Inicio», no por el fin ni por la fecha del C.A.T.", () => {
  // Como la pantalla real: una tarjeta por relación, con las tres fechas.
  const tarjeta = (inicio, cat, fin) => `Empleado: 20-11111111-2 - PEREZ JUAN Retr. pactada: 1239805,93 Fecha de Inicio: ${inicio} C.A.T.: 26391939579227495223 ${cat} 21:15:14hs: Fecha de Fin: ${fin} Sit.Revista: 01 - ACTIVO`;
  const controles = [{ id: "imgPrint", tag: "input", pista: "imgPrint Imprimir" }];
  const casillas = [
    { id: "todos", fila: "" },
    { id: "r1", fila: tarjeta("01/10/2026", "04/10/2026", "31/10/2026") },
    // Otra relación que TERMINA el 01/10/2026 y otra enviada ese día: no son la del alta.
    { id: "r2", fila: tarjeta("15/09/2026", "14/09/2026", "01/10/2026") },
    { id: "r3", fila: tarjeta("19/04/2026", "01/10/2026", "19/04/2026") },
  ];
  assert.deepEqual(elegirEnResultadoDeConsulta({ casillas, controles, fecha: "01/10/2026" }), { ok: true, casilla: "r1", impresora: "imgPrint" });
});

test("la tarjeta real trae la fecha de inicio pasados los 400 caracteres: se lee entera y el aviso muestra las fechas", () => {
  // El texto de una tarjeta como sale de la pantalla: toda la columna izquierda y después la derecha.
  const tarjeta = (inicio, fin) =>
    "Empleado: 20-11111111-2 - PEREZ JUAN Obra Social: 120900 - O.S.DEL PERSONAL DE TELEVISION Mod. Contrato: 022 - A TIEMPO COMPLETO DETERMINADO (CONTRATO A PLAZO FIJO) " +
    "Sucursal: 00001 - RUIZ HUIDOBRO 4365 COD. POSTAL 1430, CIUDAD AUTONOMA BUENOS AIRES Actividad: 591110 - PRODUCCIÓN DE FILMES Y VIDEOCINTAS " +
    "Convenio: 0634/11 - TELEVISIÔN - SINDICATO ARGENTINO DE TELEVISION C/ CAMARA ARGENTINA DE PRODUCTORAS INDEPENDIENTES DE TELEVISION (C.A.P.I.T) " +
    "Categoria: 035358 - ASISTENTE DE CAMARA ESPECIALIZADO / GRIP - GRUPO 7 Puesto: 4132 - EMPLEADOS DE SERVICIOS DE APOYO A LA PRODUCCIÓN Tipo Servicio: 000 - SERVICIOS COMUNES CONTINUOS " +
    `Retr. pactada: 1239805,93 Mod. Liq: 1 - MES Trab. agrop.: NO Fecha de Inicio: ${inicio} C.A.T.: 26391939579227495223 04/10/2026 21:15:14hs: Fecha de Fin: ${fin} Sit.Revista: 01 - ACTIVO`;
  assert.ok(tarjeta("01/10/2026", "31/10/2026").indexOf("Fecha de Inicio") > 400, "en la pantalla real la fecha queda después del carácter 400");
  const controles = [{ id: "imgPrint", tag: "input", pista: "imgPrint Imprimir" }];
  const casillas = [{ id: "todos", fila: "" }, { id: "r1", fila: tarjeta("19/04/2026", "19/04/2026") }, { id: "r2", fila: tarjeta("01/10/2026", "31/10/2026") }];
  assert.deepEqual(elegirEnResultadoDeConsulta({ casillas, controles, fecha: "01/10/2026" }), { ok: true, casilla: "r2", impresora: "imgPrint" });
  // Y si no está, el aviso dice las fechas de lo que sí había, no el principio de la tarjeta.
  const r = elegirEnResultadoDeConsulta({ casillas, controles, fecha: "05/10/2026" });
  assert.match(r.detalle, /Filas: \[sin texto\] \[inicio 19\/04\/2026, fin 19\/04\/2026\] \[inicio 01\/10\/2026, fin 31\/10\/2026\]/);
});

test("la búsqueda pide lo más nuevo primero, sin presentar nada", () => {
  const c = cuerpo("buscarEnConsultas");
  assert.match(c, /ddlCampoOrden/);
  assert.match(c, /ddlOrden/);
  assert.ok(c.indexOf("selectOption") < c.indexOf('apretar(page, "consulta_continuar")'));
});

test("motivoDelRechazo: lo que dijo ARCA en una ventana emergente manda", () => {
  assert.equal(motivoDelRechazo({ dialogos: ["El CUIL 27440427834 ya posee una relación laboral activa."], enRojo: ["Otro texto rojo"] }), "El CUIL 27440427834 ya posee una relación laboral activa.");
});

test("motivoDelRechazo: el texto en rojo, aunque no diga «error»", () => {
  const enRojo = ["Registro 1: La fecha de inicio es anterior a la permitida para la modalidad 022", "Registro 1: La fecha de inicio es anterior a la permitida para la modalidad 022 Volver"];
  assert.equal(motivoDelRechazo({ enRojo }), "Registro 1: La fecha de inicio es anterior a la permitida para la modalidad 022");
});

test("motivoDelRechazo: las instrucciones fijas en rojo no son el motivo", () => {
  const fija = "Debe ingresar un registro por línea (hasta 9).";
  assert.equal(motivoDelRechazo({ enRojo: [fija, "El código de obra social 120900 no existe"], antes: [fija] }), "El código de obra social 120900 no existe");
});

test("motivoDelRechazo: sin rojo, el renglón de la pantalla que explica el rechazo", () => {
  const texto = "Ingreso masivo de datos\nPegue los registros\nLa remuneración no corresponde a la categoría informada\nAceptar  Cancelar";
  assert.equal(motivoDelRechazo({ texto, antes: ["Ingreso masivo de datos", "Pegue los registros", "Aceptar  Cancelar"] }), "La remuneración no corresponde a la categoría informada");
});

test("motivoDelRechazo: si ARCA no dijo nada nuevo, se aclara que no mostró el motivo", () => {
  assert.match(motivoDelRechazo({ texto: "Ingreso masivo de datos", antes: ["Ingreso masivo de datos"] }), /no mostró el motivo/);
});
