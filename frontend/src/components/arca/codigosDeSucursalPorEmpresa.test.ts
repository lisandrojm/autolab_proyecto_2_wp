/**
 * Las dos pantallas donde se ve el código de sucursal lo muestran POR EMPRESA.
 *
 * No hay DOM en estos tests, así que se verifica lo que no puede romperse sin que se note: que las
 * pantallas resuelven con la función compartida y que la ficha no pierde el código al guardar.
 *
 *   npx tsx --test src/components/arca/codigosDeSucursalPorEmpresa.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const leer = (rel: string) => readFileSync(resolve(SRC, rel), "utf8");

describe("el código de sucursal se ve por empresa", () => {
  it("/arca/sucursales muestra el código de cada empresa, no uno solo por domicilio", () => {
    const pagina = leer("pages/ArcaSucursalesPage.tsx");
    assert.match(pagina, /<CodigosDeSucursalPorEmpresa sucursalId=\{s\._id\} codigoDelCatalogo=\{s\.codigo\} empresas=\{empresas\} \/>/);
    assert.match(pagina, /Código por empresa/);
    const celda = leer("components/arca/CodigosDeSucursalPorEmpresa.tsx");
    assert.match(celda, /codigoDeSucursalParaEmpresa\(e\.sucursalActividades, sucursalId, codigoDelCatalogo\)/);
    // La que todavía usa el del catálogo se marca: no es su código confirmado.
    assert.match(celda, /del catálogo/);
  });

  it("la ficha de la empresa edita el código y lo guarda con la fila, junto a las actividades y el origen", () => {
    const ficha = leer("pages/empresa/EmpresaArcaPages.tsx");
    assert.match(ficha, /const \[codigosPorSucursal, setCodigosPorSucursal\]/);
    assert.match(ficha, /return \{ sucursalId, actividades, \.\.\.\(codigo \? \{ codigo \} : \{\}\), \.\.\.\(origen \? \{ origen \} : \{\}\) \};/);
    // Tocar una fila la marca «a mano»; la que no se tocó conserva lo que tenía (p. ej. «arca»).
    assert.match(ficha, /const origen = tocada \? 'manual' : previa\?\.origen;/);
    // El botón de guardar se enciende también al cambiar un código.
    assert.match(ficha, /\|\| !codigosIguales\(codigosPorSucursal, mapaCodigos\(empresa\)\)/);
  });
});
