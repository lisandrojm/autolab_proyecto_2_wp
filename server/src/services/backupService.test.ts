import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BYTES_POR_TANDA, elegirParaBorrar, loteParaColeccion, nombreDeCarpeta } from "./backupService.js";

/**
 * QUÉ SE BORRA DE LA CARPETA DE BACKUPS.
 *
 * Es la única parte del job que DESTRUYE algo, así que se prueba aparte de todo lo que necesita red o
 * base. Un error acá no se ve hasta el día que hace falta restaurar y el archivo no está.
 *
 * Run with:
 *   npx tsx --test src/services/backupService.test.ts
 *   – o –
 *   npm run test:backup
 */

const carpeta = (name: string) => ({ tag: "folder", name });
/** 20 backups, del más viejo al más nuevo por nombre. */
const veinte = Array.from({ length: 20 }, (_, i) => carpeta(`weprodu_production_integration_2026_09_${String(i + 1).padStart(2, "0")}_03-00`));

describe("elegirParaBorrar — retención de los backups", () => {
  it("con menos de los que se retienen, no borra nada", () => {
    assert.deepEqual(elegirParaBorrar(veinte.slice(0, 14), "weprodu_production_integration"), []);
    assert.deepEqual(elegirParaBorrar([], "weprodu_production_integration"), []);
  });

  it("con 20 borra 6, y son los MÁS VIEJOS", () => {
    const borrar = elegirParaBorrar(veinte, "weprodu_production_integration");
    assert.equal(borrar.length, 6);
    // Los seis primeros días del mes son los más viejos; el 07 en adelante se conserva.
    assert.deepEqual(
      borrar.map((b) => b.name),
      veinte.slice(0, 6).map((b) => b.name).reverse(),
    );
  });

  it("reconoce también las carpetas del nombre VIEJO, o no se limpiarían nunca", () => {
    // Las creadas antes del cambio de formato llevan el nombre completo de la base y guiones en la fecha.
    const viejas = Array.from({ length: 20 }, (_, i) => carpeta(`weprodu_production_integration_2026-09-${String(i + 1).padStart(2, "0")}_0300`));
    assert.equal(elegirParaBorrar(viejas, "weprodu_production_integration").length, 6);
  });

  it("no toca archivos de otra base ni cosas que alguien haya dejado en la carpeta", () => {
    const mezcla = [...veinte, carpeta("otra_base_2026_09_01_03-00"), carpeta("Notas viejas"), { tag: "file", name: "weprodu_production_integration_2026_01_01_03-00" }];
    const borrar = elegirParaBorrar(mezcla, "weprodu_production_integration");
    assert.equal(borrar.length, 6);
    assert.ok(borrar.every((b) => b.name.startsWith("weprodu_production_integration_")));
    // Un ARCHIVO suelto con nombre de backup no se borra: cada backup es una carpeta.
    assert.ok(!borrar.some((b: any) => b.tag === "file"));
  });

  it("el orden sale del NOMBRE, no del orden en que Dropbox devolvió la lista", () => {
    const desordenados = [...veinte].sort(() => 0.5 - Math.random());
    const borrar = elegirParaBorrar(desordenados, "weprodu_production_integration").map((b) => b.name).sort();
    assert.deepEqual(borrar, veinte.slice(0, 6).map((b) => b.name).sort());
  });
});

describe("nombreDeCarpeta", () => {
  it("ordena alfabéticamente igual que cronológicamente, que es de lo que depende la retención", () => {
    const enero = nombreDeCarpeta("db", new Date(2026, 0, 2, 3, 0));
    const octubre = nombreDeCarpeta("db", new Date(2026, 9, 2, 3, 0));
    const mismoDiaMasTarde = nombreDeCarpeta("db", new Date(2026, 0, 2, 15, 0));
    assert.ok(enero < octubre, `${enero} debería ordenar antes que ${octubre}`);
    assert.ok(enero < mismoDiaMasTarde, `${enero} debería ordenar antes que ${mismoDiaMasTarde}`);
    assert.match(enero, /^db_2026_01_02_03-00$/);
  });
});

describe("loteParaColeccion: tandas por peso (la copia cortaba por timeout desde el 21/10/2026)", () => {
  it("users_&_projects (10,6 KB promedio) ya no pide 500 de una: ~70, unos 750 KB", () => {
    const n = loteParaColeccion(10.6 * 1024);
    assert.equal(n, 70);
    assert.ok(n * 10.6 * 1024 <= BYTES_POR_TANDA);
  });
  it("documentos enormes (recibos_sueldo_lotes, 279 KB) van de a 2", () => {
    assert.equal(loteParaColeccion(279 * 1024), 2);
  });
  it("documentos chicos siguen con el tope de 500, y uno más grande que la tanda va de a 1", () => {
    assert.equal(loteParaColeccion(400), 500);
    assert.equal(loteParaColeccion(5 * 1024 * 1024), 1);
  });
  it("sin estadísticas, una tanda prudente", () => {
    assert.equal(loteParaColeccion(undefined), 50);
    assert.equal(loteParaColeccion(0), 50);
  });
});
