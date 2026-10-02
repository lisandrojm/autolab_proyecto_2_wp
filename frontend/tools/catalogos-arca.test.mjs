/**
 * El lector de catálogos de ARCA solo LEE: ni un click propio.
 *
 *   node --test tools/catalogos-arca.test.mjs   (o `npm run test:arca:catalogos`)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATALOGOS, filasDeCatalogos } from "./catalogos-arca.mjs";

const CODIGO = readFileSync("tools/catalogos-arca.mjs", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("cero clicks: la única interacción es elegir la empleadora, y la hace el motor de obras sociales", () => {
  assert.doesNotMatch(CODIGO, /\.click\(|\.fill\(|\.press\(|\.check\(|selectOption\(|setInputFiles\(|dispatchEvent/);
  assert.match(CODIGO, /aceptarSelectorDeCuit\(page, cuit\)/);
});

test("no toca la grilla de altas ni lanza navegadores", () => {
  assert.doesNotMatch(CODIGO, /btnAceptar|btnReiniciar|btnNuevoCuil|Button_envio|chromium\.launch|connectOverCDP/);
});

test("la verificación del CUIT tira antes de leer", () => {
  // Se verifica en Registrar Nuevas Altas (donde está el encabezado), y antes de leer los catálogos.
  assert.ok(CODIGO.indexOf("includes(cuit)) throw") < CODIGO.indexOf("const globales"));
});

test("filasDeCatalogos: tabla, padre (convenio) y lo que faltó", () => {
  const { filas, faltaron } = filasDeCatalogos({
    l_CatCCT: [{ _text: "PEINADOR - GRUPO 7", _value: "035350", _valueToFilter: "0634/11" }],
    l_PD: [{ _text: "Actores", _value: "2455", _valueToFilter: "x" }],
  });
  assert.deepEqual(filas, [
    { tabla: "CATEGORIA_CCT", filtroPadre: "0634/11", codigo: "035350", descripcion: "PEINADOR - GRUPO 7" },
    { tabla: "PUESTO_DESEMPENADO", filtroPadre: "", codigo: "2455", descripcion: "Actores" },
  ]);
  assert.equal(faltaron.length, Object.keys(CATALOGOS).length - 2);
});
