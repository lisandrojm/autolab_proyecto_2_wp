/**
 * Las garantías del motor que da de BAJA, MODIFICA y ANULA relaciones laborales en ARCA. Si alguno de estos
 * falla, no se toca el test: se mira qué cambió en el motor.
 *
 *   node --test tools/modificaciones-arca.test.mjs     (o `npm run test:arca:modificaciones`)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { BOTONES, ICONOS, CAMPOS_BAJA, CAMPOS_MODIFICACION, acuseEnTexto, apretarIcono, boton, elegirRelacion, fechaArca, importeArca, paginasDelPaginador, pantallaModificaciones, relacionDeTarjeta, relacionesDelListado } from "./modificaciones-arca.mjs";
import { PREFIJO, POR_RELEVAR } from "./altas-arca.mjs";

const FUENTE = readFileSync("tools/modificaciones-arca.mjs", "utf8").replace(/\r\n/g, "\n");
const CODIGO = FUENTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const cuerpo = (nombre) => {
  const i = CODIGO.indexOf(`function ${nombre}(`);
  assert.ok(i >= 0, `no encuentro la función ${nombre}`);
  const j = CODIGO.indexOf("\n}\n", i);
  return CODIGO.slice(i, j);
};
const fixture = (n) => {
  const ruta = `../server/src/services/arca/fixtures/${n}`;
  return existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : null;
};

// ------------------------------------------------------------------ los clicks
test("hay EXACTAMENTE cinco clicks y son `btn.click()`: apretar, apretarIcono, irAPaginaDelListado, confirmarBaja, confirmarModificacion", () => {
  const sospechosas = CODIGO.split("\n").filter((l) => /\.click\(/.test(l));
  for (const l of sospechosas) assert.match(l, /^\s*await btn\.click\(\);\s*$/, `click fuera de las guardas:\n  ${l.trim()}`);
  assert.equal(sospechosas.length, 5);
  for (const f of ["apretar", "apretarIcono", "irAPaginaDelListado", "confirmarBaja", "confirmarModificacion"]) assert.match(cuerpo(f), /btn\.click\(\)/, `${f} tiene su click`);
});

test("los dos «Confirmar» NO están en la lista blanca de `apretar`, y «anular» es el único ícono irreversible", () => {
  const ids = Object.values(BOTONES).map((b) => `${b.id}@${b.pantalla}`);
  assert.ok(!ids.includes("btnConfirmar@registra_baja"));
  assert.ok(!ids.includes("btnConfirmar@modifica_alta"));
  assert.ok(!Object.values(BOTONES).some((b) => b.id === "btnConfirmar"), "ningún Confirmar en BOTONES");
  assert.deepEqual(Object.entries(ICONOS).filter(([, i]) => i.irreversible).map(([k]) => k), ["anular"]);
  assert.equal(ICONOS.anular.abre, POR_RELEVAR, "la pantalla posterior a anular no se relevó: queda declarado");
});

test("nunca Reiniciar, nunca por posición, nunca en paralelo; no lanza navegadores ni toca claves", () => {
  assert.doesNotMatch(CODIGO, /btnReiniciar|Button_borrar|Button_edit|_RAR_Eliminar/);
  assert.doesNotMatch(CODIGO, /\.nth\(|\.first\(\)|\.last\(\)/);
  assert.doesNotMatch(CODIGO, /Promise\.all/);
  assert.doesNotMatch(CODIGO, /chromium\.launch|connectOverCDP|from ["']playwright/);
  assert.doesNotMatch(CODIGO, /password|credencial|claveEnc|decryptSecret/i);
  // Los botones de altas no se nombran: este motor no presenta altas.
  assert.doesNotMatch(CODIGO, /Button_envio|btnArchivoAltas|txtRegistrosAltas|aceptarGrilla|enviarNovedad/);
});

test("ningún reintento alrededor de los irreversibles", () => {
  for (const f of ["confirmarBaja", "confirmarModificacion", "apretarIcono"]) {
    assert.doesNotMatch(cuerpo(f), /for\s*\(|while\s*\(|retry|reintent/i, `${f} no puede reintentar`);
  }
});

// ------------------------------------------------------------------ el orden de las guardas
test("baja y modificación: leer la relación → ícono habilitado → formulario → seco → Detener → rastro → UN Confirmar", () => {
  for (const [f, confirmar] of [
    ["registrarBaja", "confirmarBaja("],
    ["modificarRelacion", "confirmarModificacion("],
  ]) {
    const c = cuerpo(f);
    const iLeer = c.indexOf("await leerRelacion(");
    const iHabilitado = c.indexOf(".habilitado)");
    const iIcono = c.indexOf("await apretarIcono(");
    const iSeco = c.indexOf("if (enSeco)");
    const iRastro = c.indexOf("await antesDeConfirmar(");
    const iConf = c.indexOf(confirmar);
    assert.ok(iLeer >= 0 && iLeer < iIcono, `${f}: primero se lee la relación`);
    assert.ok(iHabilitado >= 0 && iHabilitado < iIcono, `${f}: el ícono deshabilitado se informa antes de apretar`);
    assert.ok(iIcono < iSeco && iSeco < iConf, `${f}: el modo en seco corta antes de ${confirmar}`);
    assert.ok(c.lastIndexOf("cortar(señal", iConf) > iSeco, `${f}: «Detener» se mira una última vez antes de ${confirmar}`);
    assert.ok(c.indexOf("cortar(señal", iConf) < 0, `${f}: después de ${confirmar} «Detener» ya no corta`);
    assert.ok(iRastro >= 0 && iRastro < iConf, `${f}: el servidor deja el rastro antes de ${confirmar}`);
    assert.equal(c.split(confirmar).length - 1, 1, `${f}: un solo ${confirmar}`);
    // En seco se sale con «Cancelar»: nada queda en ARCA.
    assert.ok(c.indexOf('apretar(page, "cancelar_') > iSeco && c.indexOf('apretar(page, "cancelar_') < iConf, `${f}: en seco se cancela el formulario`);
    // El resultado se lee del listado, no se supone.
    assert.ok(c.indexOf("yaAdentro: true") > iConf, `${f}: después de confirmar se relee el listado`);
  }
});

test("anulación: leer → habilitado → seco (sin apretar) → Detener → rastro → el ícono, una sola vez, y aceptando sólo SU diálogo", () => {
  const c = cuerpo("anularRelacion");
  const iLeer = c.indexOf("await leerRelacion(");
  const iHabilitado = c.indexOf("anular?.habilitado");
  const iSeco = c.indexOf("if (enSeco)");
  const iRastro = c.indexOf("await antesDeConfirmar(");
  const iFlag = c.indexOf("estado.irreversible = true");
  const iIcono = c.indexOf('await apretarIcono(page, "anular"');
  assert.ok(iLeer >= 0 && iLeer < iHabilitado && iHabilitado < iSeco && iSeco < iRastro && iRastro < iFlag && iFlag < iIcono);
  assert.ok(c.lastIndexOf("cortar(señal", iIcono) > iSeco && c.indexOf("cortar(señal", iIcono) < 0);
  assert.equal(c.split("apretarIcono(").length - 1, 1, "un solo apretarIcono en la anulación");
  assert.ok(c.indexOf("yaAdentro: true") > iIcono, "después de anular se relee el listado");
  // La pantalla desconocida se guarda y no se toca: ninguna otra acción después del ícono.
  assert.ok(c.indexOf("apretar(", iIcono) < 0 || c.indexOf("apretar(", iIcono) === c.indexOf("apretarIcono(", iIcono), "después del ícono no se aprieta nada más");
  // En apretarIcono, el diálogo se acepta sólo si el ícono es irreversible y el flag está puesto.
  const ai = cuerpo("apretarIcono");
  assert.ok(ai.indexOf("if (def.irreversible) estado.aceptarDialogo = true") < ai.indexOf("btn.click()"));
  assert.ok(ai.indexOf("def.irreversible && estado?.irreversible !== true) throw") < ai.indexOf("btn.click()"));
  assert.ok(ai.indexOf("if (!icono.habilitado) throw") < ai.indexOf("btn.click()"));
  assert.ok(ai.indexOf('!== "modificaciones_listado") throw') < ai.indexOf("btn.click()"));
});

test("leer la relación sólo lee: busca por CUIL y no abre formularios ni confirma", () => {
  const c = cuerpo("leerRelacion");
  assert.doesNotMatch(c, /apretarIcono\(|confirmarBaja\(|confirmarModificacion\(|completar/);
  assert.match(c, /apretar\(page, "buscar"\)/);
  assert.equal((c.match(/\.fill\(/g) || []).length, 1, "lo único que escribe es el CUIL de la búsqueda");
  // Las fechas de las tarjetas se exigen enteras: la de inicio va al final del texto.
  assert.match(cuerpo("filasDelListado"), /slice\(0, 6000\)/);
});

test("la verificación de CUIT es la del motor de altas (tira, no devuelve false) y se hace antes de buscar", () => {
  const c = cuerpo("leerRelacion");
  assert.ok(c.indexOf("await verificarEmpleadora(") < c.indexOf('apretar(page, "buscar")'));
});

// ------------------------------------------------------------------ boton()
const paginaFalsa = (pantalla) => {
  const pedidos = [];
  const accion = { modificaciones_busqueda: "./Modificaciones.aspx", modificaciones_listado: "./Modificaciones.aspx", registra_baja: "RegistraBaja.aspx?idx=0&NP=1", modifica_alta: "ModificaAlta.aspx?idx=0&NP=1" }[pantalla] || "./Otra.aspx";
  const ids = {
    modificaciones_busqueda: [PREFIJO + "inputCuil_txtCuil", PREFIJO + "btnContinuar"],
    modificaciones_listado: [PREFIJO + "rptRelaciones_ctl01_imgEmpleado", PREFIJO + "btnVolver"],
    registra_baja: [PREFIJO + "InputFechaFin_txtFecha", PREFIJO + "PredictCodeSitB_AutocompleteText", PREFIJO + "btnConfirmar"],
    modifica_alta: [PREFIJO + "InputFechaInicio_txtFecha", PREFIJO + "btnConfirmar"],
  }[pantalla] || [];
  return {
    pedidos,
    evaluate: async () => ({ accion, ids, texto: "" }),
    locator: (sel) => {
      pedidos.push(sel);
      return { count: async () => 1, click: async () => {}, isDisabled: async () => false };
    },
  };
};

test("boton() rechaza claves fuera de la lista sin tocar la página", async () => {
  const p = paginaFalsa("registra_baja");
  await assert.rejects(boton(p, "confirmar"), /no aprieta/);
  await assert.rejects(boton(p, "btnConfirmar"), /no aprieta/);
  assert.equal(p.pedidos.length, 0);
});

test("boton() tira si la pantalla no es la del botón (Cancelar de la baja no se aprieta en el listado)", async () => {
  await assert.rejects(boton(paginaFalsa("modificaciones_listado"), "cancelar_baja"), /No aprieto a ciegas/);
  const ok = await boton(paginaFalsa("registra_baja"), "cancelar_baja");
  assert.ok(ok);
});

test("apretarIcono() exige el listado, el id del ícono pedido, que esté habilitado y, en anular, el aviso previo", async () => {
  const rel = (hab) => ({ iconos: { baja: { id: PREFIJO + "rptRelaciones_ctl01_img_baja", habilitado: hab }, anular: { id: PREFIJO + "rptRelaciones_ctl01_img_anul", habilitado: true } } });
  await assert.rejects(apretarIcono(paginaFalsa("modificaciones_listado"), "baja", rel(false), {}), /deshabilitado/);
  await assert.rejects(apretarIcono(paginaFalsa("registra_baja"), "baja", rel(true), {}), /No aprieto a ciegas/);
  await assert.rejects(apretarIcono(paginaFalsa("modificaciones_listado"), "baja", { iconos: { baja: { id: PREFIJO + "rptRelaciones_ctl01_img_anul", habilitado: true } } }, {}), /no trae el ícono/);
  await assert.rejects(apretarIcono(paginaFalsa("modificaciones_listado"), "anular", rel(true), { irreversible: false }), /no se deshace/);
  await assert.rejects(apretarIcono(paginaFalsa("modificaciones_listado"), "reiniciar", rel(true), {}), /No existe/);
  const estado = { irreversible: true, aceptarDialogo: false };
  await apretarIcono(paginaFalsa("modificaciones_listado"), "anular", rel(true), estado);
  assert.equal(estado.aceptarDialogo, true, "el diálogo de ESTE click se acepta");
});

// ------------------------------------------------------------------ pantallas (puro, contra los fixtures)
test("pantallaModificaciones reconoce por el formulario y los ids, no por la URL", () => {
  assert.equal(pantallaModificaciones({ accion: "./Modificaciones.aspx", ids: [PREFIJO + "inputCuil_txtCuil", PREFIJO + "btnContinuar"] }), "modificaciones_busqueda");
  assert.equal(pantallaModificaciones({ accion: "./Modificaciones.aspx", ids: [PREFIJO + "rptRelaciones_ctl03_img_baja"] }), "modificaciones_listado");
  // Server.Transfer: la URL sigue en Modificaciones, el action dice RegistraBaja.
  assert.equal(pantallaModificaciones({ accion: "RegistraBaja.aspx?idx=0&NP=1", ids: [PREFIJO + "InputFechaFin_txtFecha", PREFIJO + "PredictCodeSitB_AutocompleteText"] }), "registra_baja");
  assert.equal(pantallaModificaciones({ accion: "ModificaAlta.aspx?idx=0&NP=1", ids: [PREFIJO + "InputFechaInicio_txtFecha", PREFIJO + "btnConfirmar"] }), "modifica_alta");
  assert.equal(pantallaModificaciones({ accion: "./Altas.aspx", ids: [PREFIJO + "btnArchivoAltas"] }), "otra");
  assert.equal(pantallaModificaciones({ accion: "./ErrorPage.aspx", texto: "No se encontraron datos para la busqueda" }), "sin_datos");
  assert.equal(pantallaModificaciones({ accion: "./Modificaciones.aspx", texto: "Su tiempo de sesión ha finalizado" }), "sin_sesion");
  assert.equal(pantallaModificaciones({ accion: "./login/IndexContribuyente.aspx" }), "selector_cuit");
});

test("las pantallas relevadas (fixtures 04 a 07) se reconocen", () => {
  const esperadas = { "04-Modificaciones.json": "modificaciones_busqueda", "05-Modificaciones-resultado.json": "modificaciones_listado", "06-ModificaAlta.json": "modifica_alta", "07-RegistraBaja.json": "registra_baja" };
  for (const [n, pantalla] of Object.entries(esperadas)) {
    const f = fixture(n);
    assert.ok(f, `falta el fixture ${n}`);
    assert.equal(pantallaModificaciones(f), pantalla, n);
    assert.equal(f.pantalla, pantalla);
  }
  // Los campos del formulario de baja y de modificación son los que el motor escribe.
  const baja = fixture("07-RegistraBaja.json");
  for (const d of Object.values(CAMPOS_BAJA)) assert.ok(baja.ids.includes(PREFIJO + (d.tipo === "autocompletar" ? `${d.id}_AutocompleteText` : d.id)), `baja: ${d.id}`);
  assert.ok(baja.botones.some((b) => b.id === PREFIJO + "btnConfirmar") && baja.botones.some((b) => b.id === PREFIJO + "btnCancelar"));
  const mod = fixture("06-ModificaAlta.json");
  for (const d of Object.values(CAMPOS_MODIFICACION)) {
    assert.ok(mod.ids.includes(PREFIJO + (d.tipo === "autocompletar" ? `${d.id}_AutocompleteText` : d.id)), `modificación: ${d.id}`);
    if (d.tipo === "autocompletar") assert.ok(mod.ocultos.some((o) => o.id === PREFIJO + `${d.id}_AutocompleteValue`), `modificación: oculto de ${d.id}`);
  }
  // El catálogo de motivos de baja viene con la pantalla y es el que se siembra.
  const cat = fixture("catalogos-RegistraBaja.json");
  assert.ok(cat.l_SBV.length >= 30 && cat.l_SBV.some((x) => x.codigo === "99") && cat.l_SBV.some((x) => x.codigo === "21"));
});

// ------------------------------------------------------------------ lectores (puro)
const TARJETA =
  "Empleado: XXXXXXXXXXX - APELLIDO NOMBRE Obra Social: 120900 - O.S.DEL PERSONAL DE TELEVISION Mod. Contrato: 022 - A TIEMPO COMPLETO DETERMINADO (CONTRATO A PLAZO FIJO) Sucursal: 00001 - RUIZ HUIDOBRO 4365 COD. POSTAL 1430, CIUDAD AUTONOMA BUENOS AIRES Actividad: 591110 - PRODUCCIÓN DE FILMES Y VIDEOCINTAS Convenio: 0634/11 - TELEVISIÔN - SINDICATO Categoria: 035326 - CARACTERIZADOR - GRUPO 6 Puesto: 4132 - EMPLEADOS DE SERVICIOS DE APOYO A LA PRODUCCIÓN Tipo Servicio: 000 - SERVICIOS COMUNES CONTINUOS Retr. pactada: 1340020,20 Mod. Liq: 1 - MES Trab. agrop.: NO Fecha de Inicio: 19/11/2026 C.A.T.: 04303933291555147941 19/11/2026 00:06:07hs: Fecha de Fin: 30/11/2026 Sit.Revista: 01 - ACTIVO Lic. COVID Dto. 332 Art. 3b / Tipo de Contrato CCG: Sin Lic. COVID / No asociado a CCG";
const TARJETA_CERRADA = TARJETA.replace("C.A.T.: 04303933291555147941 19/11/2026 00:06:07hs:", "C.A.T.: 84159424720265031873 12/01/2026 11:39:03hs: C.B.T.: 06139369796638553288 21/01/2026 01:21:21hs:").replace("Fecha de Inicio: 19/11/2026", "Fecha de Inicio: 12/01/2026").replace("Fecha de Fin: 30/11/2026", "Fecha de Fin: 20/01/2026").replace("Sit.Revista: 01 - ACTIVO", "Sit.Revista: 99 - VENCIMIENTO DE CONTRATO A PLAZO FIJO O DETERMINADO, A TIEMPO COMPLETO O PARCIAL");

test("relacionDeTarjeta lee fechas (ISO), claves (sólo los 20 dígitos) y códigos de una tarjeta del listado", () => {
  const r = relacionDeTarjeta(TARJETA);
  assert.equal(r.inicio, "2026-11-19");
  assert.equal(r.fin, "2026-11-30");
  assert.equal(r.cat, "04303933291555147941");
  assert.equal(r.cbt, "");
  assert.deepEqual([r.sitRevista, r.obraSocial, r.modalidad, r.sucursal, r.actividad, r.convenio, r.categoria, r.puesto, r.tipoServicio, r.retribucion, r.modLiq], ["01", "120900", "022", "00001", "591110", "0634/11", "035326", "4132", "000", "1340020,20", "1"]);
  const c = relacionDeTarjeta(TARJETA_CERRADA);
  assert.deepEqual([c.inicio, c.fin, c.cat, c.cbt, c.sitRevista], ["2026-01-12", "2026-01-20", "84159424720265031873", "06139369796638553288", "99"]);
  assert.equal(relacionDeTarjeta("Empleado: XXXXXXXXXXX sin fechas").inicio, "");
});

test("relacionesDelListado contra el fixture real: la relación abierta tiene modificar y baja habilitados y anular no; las cerradas, nada", () => {
  const f = fixture("05-Modificaciones-resultado.json");
  const rels = relacionesDelListado(f.iconosPorFila);
  assert.ok(rels.length >= 2);
  const abierta = rels.find((r) => r.inicio === "2026-11-19");
  assert.ok(abierta, "la relación del 19/11 está");
  assert.equal(abierta.fin, "2026-11-30");
  assert.deepEqual([abierta.iconos.modificar.habilitado, abierta.iconos.baja.habilitado, abierta.iconos.anular.habilitado], [true, true, false]);
  assert.ok(abierta.iconos.baja.id.endsWith("_img_baja"));
  const cerrada = rels.find((r) => r.cbt);
  assert.ok(cerrada, "hay una relación con C.B.T.");
  assert.deepEqual([cerrada.iconos.modificar.habilitado, cerrada.iconos.baja.habilitado, cerrada.iconos.anular.habilitado], [false, false, false]);
});

test("elegirRelacion: por fecha de inicio; varias con el mismo inicio se desempatan por fin o por ser iguales; distintas, ambigua", () => {
  const a = { inicio: "2026-11-19", fin: "2026-11-30", cat: "1" };
  const b = { inicio: "2026-01-12", fin: "2026-01-20", cat: "2" };
  assert.equal(elegirRelacion([b, a], { fechaInicio: "2026-11-19" }).relacion, a);
  assert.equal(elegirRelacion([b, a], { fechaInicio: "2026-11-19T00:00:00.000Z" }).relacion, a, "tolera la fecha ISO completa");
  const r = elegirRelacion([b], { fechaInicio: "2026-11-19" });
  assert.deepEqual([r.ok, r.motivo], [false, "sin_relacion"]);
  assert.match(r.detalle, /19\/11\/2026/);
  assert.match(r.detalle, /inicio 12\/01\/2026, fin 20\/01\/2026/);
  const a2 = { inicio: "2026-11-19", fin: "2026-12-15", cat: "3" };
  assert.equal(elegirRelacion([a, a2], { fechaInicio: "2026-11-19", fechaFin: "2026-12-15" }).relacion, a2);
  assert.equal(elegirRelacion([a, { ...a }], { fechaInicio: "2026-11-19" }).relacion, a, "iguales: la primera");
  const amb = elegirRelacion([a, a2], { fechaInicio: "2026-11-19" });
  assert.deepEqual([amb.ok, amb.motivo], [false, "ambigua"]);
  assert.equal(elegirRelacion([a], { fechaInicio: "" }).motivo, "sin_fecha");
});

test("acuseEnTexto saca la C.B.T., la C.A.T. o el número de transacción si la pantalla los muestra", () => {
  assert.deepEqual(acuseEnTexto("Baja registrada. C.B.T.: 06139369796638553288 21/01/2026"), { cbt: "06139369796638553288" });
  assert.deepEqual(acuseEnTexto("Clave de Baja Temprana Nº 06139369796638553288"), { cbt: "06139369796638553288" });
  assert.deepEqual(acuseEnTexto("C.A.T.: 04303933291555147941 Transacción Nro: 123456"), { cat: "04303933291555147941", nroTransaccion: "123456" });
  assert.deepEqual(acuseEnTexto("nada"), {});
});

test("fechas e importes como los escribe ARCA; el paginador por el texto de sus links", () => {
  assert.equal(fechaArca("2026-11-30"), "30/11/2026");
  assert.equal(fechaArca("2026-11-30T03:00:00.000Z"), "30/11/2026");
  assert.equal(fechaArca("30/11/2026"), "");
  assert.equal(importeArca(1340020.2), "1340020,20");
  assert.equal(importeArca("56132.58"), "56132,58");
  assert.equal(importeArca(-1), "");
  assert.deepEqual(paginasDelPaginador(["[-1]", "1", "2", "[+1]"]), [1, 2]);
});
