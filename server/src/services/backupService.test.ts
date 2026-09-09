import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { elegirParaBorrar, nombreDeCarpeta } from "./backupService.js";

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
const veinte = Array.from({ length: 20 }, (_, i) => carpeta(`weprodu_production_integration_2026-09-${String(i + 1).padStart(2, "0")}_0300`));

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

  it("no toca archivos de otra base ni cosas que alguien haya dejado en la carpeta", () => {
    const mezcla = [...veinte, carpeta("otra_base_2026-09-01_0300"), carpeta("Notas viejas"), { tag: "file", name: "weprodu_production_integration_2026-01-01_0300" }];
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
    assert.match(enero, /^db_2026-01-02_0300$/);
  });
});
