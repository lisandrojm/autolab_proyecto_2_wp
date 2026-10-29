import { test } from "node:test";
import assert from "node:assert/strict";
import { armarPlanilla, nombreDelArchivo, rangoDelMes, SolicitudJornada } from "./planillaJornaleros.js";

const sol = (o: Partial<SolicitudJornada>): SolicitudJornada => ({
  id: "s1",
  personaId: "p1",
  legajo: "00028",
  apellido: "Aguirre",
  nombre: "Daniel Alejandro",
  rol: "Asistente de Cámara",
  categoriaNumero: 10,
  categoriaNombre: "Ayudante General de Técnica",
  dailyRate: 66686.148148,
  fechas: ["2026-10-05"],
  ...o,
});

test("una fila del Reporte por fecha, con el neto = dailyRate × 0,81 al centavo, ordenadas por persona y fecha", () => {
  const p = armarPlanilla("2026-10", [sol({ id: "b", apellido: "Zalazar", nombre: "Luciano", fechas: ["2026-10-09"] }), sol({ fechas: ["2026-10-12", "2026-10-03"] })]);
  assert.deepEqual(
    p.reporte.map((f) => [f.clave, f.fecha, f.sueldoJornada]),
    [
      ["Aguirre Daniel Alejandro", "2026-10-03", 54015.78],
      ["Aguirre Daniel Alejandro", "2026-10-12", 54015.78],
      ["Zalazar Luciano", "2026-10-09", 54015.78],
    ],
  );
  assert.deepEqual(p.totales, { contratos: 2, jornadas: 3, personas: 2, netoPactado: 162047.34 });
});

test("LIQUIDACION: una fila por persona y categoría; los contratos son solicitudes distintas", () => {
  const p = armarPlanilla("2026-10", [
    sol({ id: "a", fechas: ["2026-10-01", "2026-10-02"] }),
    sol({ id: "b", fechas: ["2026-10-03"] }),
    sol({ id: "c", categoriaNumero: 8, categoriaNombre: "Conductor de Cámaras", dailyRate: 77834.9, fechas: ["2026-10-04"] }),
  ]);
  assert.deepEqual(
    p.liquidacion.map((l) => [l.clave, l.categoriaNumero, l.contratos, l.jornadas]),
    [
      ["Aguirre Daniel Alejandro", 8, 1, 1],
      ["Aguirre Daniel Alejandro", 10, 2, 3],
    ],
  );
});

test("escala: jornal = dailyRate ÷ 1,1; básico + Sattsaid = jornal × 22 ÷ 1,5, repartido con el % del grupo", () => {
  const [e] = armarPlanilla("2026-09", [sol({})]).escala;
  assert.equal(e.numero, 10);
  assert.equal(e.jornal.toFixed(2), "60623.77");
  assert.equal((e.basico + e.sattsaid).toFixed(2), ((e.jornal * 22) / 1.5).toFixed(2));
  assert.equal((e.sattsaid / e.basico).toFixed(4), "0.2100");
});

test("la escala ignora $0 y los montos de prueba, y avisa", () => {
  const p = armarPlanilla("2026-10", [sol({}), sol({ id: "x", apellido: "Veliz", dailyRate: 123456.79 }), sol({ id: "y", apellido: "Pérez", dailyRate: 0 })]);
  assert.equal(p.escala[0].jornal.toFixed(2), "60623.77");
  assert.ok(p.advertencias.some((a) => a.startsWith("Veliz") && a.includes("de prueba")));
  assert.ok(p.advertencias.some((a) => a.startsWith("Pérez") && a.includes("$0")));
});

test("avisa sin legajo (una sola vez por persona) y fechas fuera del mes", () => {
  const p = armarPlanilla("2026-10", [sol({ legajo: "" }), sol({ id: "2", legajo: "", fechas: ["2026-11-02"] })]);
  assert.equal(p.advertencias.filter((a) => a.includes("legajo")).length, 1);
  assert.ok(p.advertencias.some((a) => a.includes("2026-11-02") && a.includes("fuera del mes")));
  assert.equal(p.reporte[0].legajo, "");
});

test("el Resumen toma hasta 9 categorías por nombre, de mayor a menor neto, y avisa si quedan afuera", () => {
  const sols = Array.from({ length: 11 }, (_, i) => sol({ id: String(i), categoriaNombre: `Cat ${i}`, categoriaNumero: 10, fechas: Array.from({ length: i + 1 }, (_, d) => `2026-10-${String(d + 1).padStart(2, "0")}`) }));
  const p = armarPlanilla("2026-10", sols);
  assert.equal(p.categoriasResumen.length, 9);
  assert.equal(p.categoriasResumen[0].nombre, "Cat 10");
  assert.ok(p.advertencias.some((a) => a.includes("Cat 1,") && a.includes("Cat 0")));
});

test("mes y nombre de archivo", () => {
  assert.deepEqual(rangoDelMes("2026-02"), { desde: "2026-02-01", hasta: "2026-02-28" });
  assert.equal(nombreDelArchivo("2026-10"), "JORNALEROS_OCTUBRE_2026.xlsx");
});
