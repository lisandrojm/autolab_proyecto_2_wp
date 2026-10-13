/**
 *   node --test tools/consulta-relaciones-arca.test.mjs
 *
 * La parte pura del motor de Consultas (qué devolvió ARCA, cómo se escribe el período, qué páginas
 * ofrece el paginador) y la garantía de que el motor NO toca los botones que presentan altas.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { filasDelTxt, indiceDeSiguiente, paginasDelPaginador, resultadoDeConsulta, textoPeriodo } from "./consulta-relaciones-arca.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));

describe("qué devolvió ARCA después de «Continuar»", () => {
  it("«No se encontraron datos» es cero movimientos, no un error", () => {
    assert.equal(resultadoDeConsulta({ accion: "./ErrorPage.aspx", texto: "No se encontraron datos para la busqueda" }), "sin_datos");
  });
  it("la sesión caída se reconoce por el texto o por FinSession", () => {
    assert.equal(resultadoDeConsulta({ texto: "Su sesión ha finalizado" }), "sin_sesion");
    assert.equal(resultadoDeConsulta({ url: "https://x/app/FinSession.aspx" }), "sin_sesion");
  });
  it("hay listado si está el link al TXT o si hay CUIL en pantalla", () => {
    assert.equal(resultadoDeConsulta({ hrefs: ["ArchivoConsultaRel.aspx"] }), "listado");
    assert.equal(resultadoDeConsulta({ cuils: 3 }), "listado");
  });
  it("ErrorPage sin el texto de «sin datos» es un error de ARCA", () => {
    assert.equal(resultadoDeConsulta({ url: "https://x/app/ErrorPage.aspx", texto: "Ha ocurrido un error" }), "error_arca");
  });
  it("cualquier otra cosa es desconocida", () => assert.equal(resultadoDeConsulta({ texto: "Bienvenido" }), "desconocido"));
});

describe("el período", () => {
  it("MM/AAAA si el campo admite 7, MMAAAA si admite 6", () => {
    assert.equal(textoPeriodo("2026-10", "7"), "10/2026");
    assert.equal(textoPeriodo("2026-10", null), "10/2026");
    assert.equal(textoPeriodo("2026-10", "6"), "102026");
  });
  it("un mes mal escrito tira", () => assert.throws(() => textoPeriodo("10/2026", null)));
});

describe("el paginador", () => {
  it("saca los números de los Page$N, sin repetir y ordenados", () => {
    const hrefs = ["javascript:__doPostBack('ctl00$ContentPlaceHolder1$gv','Page$3')", "javascript:__doPostBack('ctl00$ContentPlaceHolder1$gv','Page$2')", "javascript:__doPostBack('ctl00$ContentPlaceHolder1$gv','Page$3')", "Consulta.aspx"];
    assert.deepEqual(paginasDelPaginador(hrefs), [2, 3]);
  });
  it("sin paginador, nada", () => assert.deepEqual(paginasDelPaginador(["Consulta.aspx", ""]), []));
  it("«Siguiente» se reconoce por Page$Next o por lo que dice, y no si está deshabilitado", () => {
    assert.equal(indiceDeSiguiente([{ texto: "Volver" }, { href: "javascript:__doPostBack('gv','Page$Next')", texto: "" }]), 1);
    assert.equal(indiceDeSiguiente([{ texto: "Volver" }, { value: "Siguiente" }]), 1);
    assert.equal(indiceDeSiguiente([{ texto: " > " }]), 0);
    assert.equal(indiceDeSiguiente([{ texto: "»", disabled: true }, { texto: "Imprimir" }]), -1);
    assert.equal(indiceDeSiguiente([{ texto: "Siguiente paso" }]), -1);
  });
  it("cuenta las filas de un TXT por el CUIL del principio", () => {
    assert.equal(filasDelTxt(Buffer.from("CUIL  APELLIDO\r\n20111111111 A\r\n27222222222 B\r\n", "latin1")), 2);
  });
});

describe("el motor sólo lee", () => {
  it("no nombra los botones que presentan altas ni los de carga masiva", () => {
    const fuente = readFileSync(resolve(AQUI, "consulta-relaciones-arca.mjs"), "utf8");
    for (const prohibido of ["Button_envio", "btnAceptar", "aceptarGrilla", "enviarNovedad", "rel_new", "btnArchivoAltas"]) {
      assert.ok(!fuente.includes(prohibido), `el motor de Consultas no debería mencionar «${prohibido}»`);
    }
  });
});
