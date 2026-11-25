/*
  El cliente del tango-connector, sin red: el transporte se inyecta y se mira qué URL y qué headers
  arma, cómo lee el sobre de Tango y cómo convierte cada rechazo en una explicación que diga a dónde
  ir. Se corre con `npm run test:tango`.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { configDelEntorno, ErrorConnector, explicarFalla, mensajesDe, TangoApi, type RespuestaHttp, type Transporte } from "./tangoApi.js";
import { parsearEmpresasExtra } from "./centrosCostoSync.js";

const CONFIG = { url: "https://connector.test/v1", apiKey: "k-secreta", tenant: "servertango", timeoutMs: 1234 };

/** Un transporte que contesta siempre lo mismo y anota lo que le pidieron. */
function transporteFijo(respuestas: Array<RespuestaHttp | Error>) {
  const pedidos: Array<{ url: string; headers: Record<string, string>; timeoutMs: number }> = [];
  const transporte: Transporte = async (url, headers, timeoutMs) => {
    pedidos.push({ url, headers, timeoutMs });
    const r = respuestas.length > 1 ? respuestas.shift()! : respuestas[0];
    if (r instanceof Error) throw r;
    return r;
  };
  return { transporte, pedidos };
}

const sobre = { succeeded: true, value: { COD_TIPO_AUXILIAR: "CC", AUXILIAR: [] } };

test("configDelEntorno: sin URL o sin key no hay connector; con las dos, tenant y timeout por defecto", () => {
  assert.equal(configDelEntorno({}), null);
  assert.equal(configDelEntorno({ TANGO_CONNECTOR_URL: "https://x/v1" }), null);
  assert.equal(configDelEntorno({ TANGO_CONNECTOR_API_KEY: "k" }), null);
  assert.deepEqual(configDelEntorno({ TANGO_CONNECTOR_URL: "https://x/v1/", TANGO_CONNECTOR_API_KEY: " k " }), { url: "https://x/v1", apiKey: "k", tenant: "servertango", timeoutMs: 30000 });
  assert.deepEqual(configDelEntorno({ TANGO_CONNECTOR_URL: "https://x/v1", TANGO_CONNECTOR_API_KEY: "k", TANGO_CONNECTOR_TENANT: "otro", TANGO_API_TIMEOUT: "5000" }), { url: "https://x/v1", apiKey: "k", tenant: "otro", timeoutMs: 5000 });
});

test("getRegistro arma la URL del connector con tenant y Company ID, manda la key en X-Api-Key y devuelve el sobre tal cual", async () => {
  const { transporte, pedidos } = transporteFijo([{ status: 200, origen: "tango", cuerpo: sobre }]);
  const api = new TangoApi(transporte, () => CONFIG);
  const r = await api.getRegistro(1656, 1, "3");
  assert.deepEqual(r, sobre);
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].url, "https://connector.test/v1/tango/servertango/3/GetById?process=1656&id=1");
  assert.equal(pedidos[0].headers["X-Api-Key"], "k-secreta");
  assert.equal(pedidos[0].timeoutMs, 1234);
});

test("un succeeded:false de Tango (HTTP 200) llega como sobre: lo interpreta quien pidió", async () => {
  const rechazo = { succeeded: false, message: "Error", exceptionInfo: { messages: ["Registro inexistente"] } };
  const api = new TangoApi(transporteFijo([{ status: 200, origen: "tango", cuerpo: rechazo }]).transporte, () => CONFIG);
  assert.deepEqual(await api.getRegistro(1656, 1, "3"), rechazo);
});

test("sin configuración, getRegistro falla antes de pedir nada", async () => {
  const { transporte, pedidos } = transporteFijo([{ status: 200, origen: "tango", cuerpo: sobre }]);
  const api = new TangoApi(transporte, () => null);
  await assert.rejects(() => api.getRegistro(1656, 1, "3"), /TANGO_CONNECTOR_URL y TANGO_CONNECTOR_API_KEY/);
  assert.equal(pedidos.length, 0);
});

test("un rechazo del connector sale como ErrorConnector con su estado, su origen y el detalle de exceptionInfo.messages", async () => {
  const cuerpo = { succeeded: false, message: "La API key no tiene acceso a servertango/9", exceptionInfo: { title: "x", messages: ["La API key no tiene acceso a servertango/9"] } };
  const { transporte, pedidos } = transporteFijo([{ status: 403, origen: "connector", cuerpo }]);
  const api = new TangoApi(transporte, () => CONFIG);
  await assert.rejects(
    () => api.getRegistro(1656, 1, "9"),
    (e: unknown) => e instanceof ErrorConnector && e.origen === "connector" && e.status === 403 && e.destino === "servertango/9" && e.mensajes[0] === "La API key no tiene acceso a servertango/9" && !e.reintentable,
  );
  // Un 4xx es un rechazo: no se reintenta.
  assert.equal(pedidos.length, 1);
});

test("502 (túnel caído) se reintenta una vez y después se explica como túnel", async () => {
  const cuerpo = { succeeded: false, message: "No se pudo conectar con Tango", exceptionInfo: { messages: ["No se pudo conectar con Tango", "El túnel o el servidor Tango no responden"] } };
  const { transporte, pedidos } = transporteFijo([{ status: 502, origen: "connector", cuerpo }, { status: 502, origen: "connector", cuerpo }]);
  const api = new TangoApi(transporte, () => CONFIG);
  let error: unknown;
  try {
    await api.getRegistro(1656, 1, "3");
  } catch (e) {
    error = e;
  }
  assert.ok(error instanceof ErrorConnector && error.reintentable);
  assert.equal(pedidos.length, 2);
  assert.match(explicarFalla(error), /túnel del lado de Tango/);
});

test("si el segundo intento sale bien, el reintento es invisible", async () => {
  const { transporte, pedidos } = transporteFijo([new Error("socket hang up"), { status: 200, origen: "tango", cuerpo: sobre }]);
  const api = new TangoApi(transporte, () => CONFIG);
  assert.deepEqual(await api.getRegistro(1656, 1, "3"), sobre);
  assert.equal(pedidos.length, 2);
});

test("explicarFalla manda a cada responsable: key, permisos, empresa no registrada, red, Tango", () => {
  const con = (status: number, origen: "connector" | "tango" | "red", mensajes: string[]) => new ErrorConnector(origen, status, mensajes, "servertango/9", false);
  assert.match(explicarFalla(con(401, "connector", ["API key inválida o inactiva"])), /TANGO_CONNECTOR_API_KEY/);
  assert.match(explicarFalla(con(403, "connector", ["La API key no puede usar GetById en el proceso 1656"])), /1656:GetById/);
  assert.match(explicarFalla(con(404, "connector", ["Empresa no registrada: servertango/9"])), /empresa:crear/);
  assert.match(explicarFalla(con(504, "connector", ["Tango no respondió a tiempo"])), /no respondió a tiempo/);
  assert.match(explicarFalla(con(0, "red", ["No se pudo conectar con el connector: ENOTFOUND"])), /TANGO_CONNECTOR_URL/);
  assert.match(explicarFalla(con(401, "tango", ["Unauthorized"])), /token de la empresa en el connector/);
  assert.match(explicarFalla(new Error("algo raro")), /algo raro/);
});

test("mensajesDe prefiere el detalle y no repite", () => {
  assert.deepEqual(mensajesDe({ message: "Error", exceptionInfo: { messages: ["Error", "Detalle"] } }), ["Error", "Detalle"]);
  assert.deepEqual(mensajesDe({ message: "Solo message" }), ["Solo message"]);
  assert.deepEqual(mensajesDe({ title: "Unauthorized", detail: "token" }), ["Unauthorized", "token"]);
  assert.deepEqual(mensajesDe("texto"), []);
  assert.deepEqual(mensajesDe(null), []);
});

test("quienSoy pega a /meta/yo con la key", async () => {
  const yo = { plataforma: "weprodu", prefijo: "abc", permisos: { empresas: ["servertango/3"], procesos: { "1656": ["GetById"] } } };
  const { transporte, pedidos } = transporteFijo([{ status: 200, origen: "connector", cuerpo: yo }]);
  const api = new TangoApi(transporte, () => CONFIG);
  assert.deepEqual(await api.quienSoy(), yo);
  assert.equal(pedidos[0].url, "https://connector.test/v1/meta/yo");
  assert.equal(pedidos[0].headers["X-Api-Key"], "k-secreta");
});

test("TANGO_EMPRESAS_EXTRA: ids con o sin nombre, con «:» o «=», sin repetir ni basura", () => {
  assert.deepEqual(parsearEmpresasExtra(undefined), []);
  assert.deepEqual(parsearEmpresasExtra("9"), [{ id: "9" }]);
  assert.deepEqual(parsearEmpresasExtra(" 9:FZERO CORP , 15, x, 9 "), [{ id: "9", nombre: "FZERO CORP" }, { id: "15" }]);
  assert.deepEqual(parsearEmpresasExtra("9=FZERO CORP"), [{ id: "9", nombre: "FZERO CORP" }]);
});
