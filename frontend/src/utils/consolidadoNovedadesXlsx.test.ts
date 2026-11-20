/** Las hojas del consolidado: reparto 50/100 con el glosario del navegador, importes, celdas vacías, orden. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hojasDelConsolidado, nombreDelConsolidado, repartoDeExtras } from "./consolidadoNovedadesXlsx";
import { DEFAULT_GLOSSARY } from "./overtimeUtils";
import type { ConsolidadoNovedades, FilaDetalleConsolidado } from "../api/request";

const detalle = (extra: Partial<FilaDetalleConsolidado>): FilaDetalleConsolidado => ({ claveResumen: "r1", fecha: "2026-11-06", dia: "Vie", feriado: "", colaborador: "Pérez, Ana", cuil: "20111111112", proyecto: "LN+", area: "Técnica", turno: "Mañana (06:00 - 12:00)", estado: "Presente", motivo: "", entradaPrevista: "06:00", salidaPrevista: "12:00", entradaReal: "", salidaReal: "", extras: null, reemplazo: "", parte: "DEM-REG-1", ...extra });
const consolidado = (extra: Partial<ConsolidadoNovedades> = {}): ConsolidadoNovedades => ({
  desde: "2026-11-01", hasta: "2026-11-30", proyectos: [{ id: "p", nombre: "LN+", cliente: "La Nación", centroCosto: "" }], feriados: [{ fecha: "2026-11-20", nombre: "Soberanía" }], motivos: ["Franco", "Vacaciones"],
  resumen: [
    { clave: "r1", legajo: "00028", colaborador: "Pérez, Ana", cuil: "20111111112", empresa: "2030 S.R.L.", tipo: "Plazo fijo 6x6", categoria: "Auxiliar", centroCosto: "", proyecto: "LN+", area: "Técnica", turno: "Mañana", desde: "2026-11-01", hasta: "2026-11-30", contratos: 1, jornadasTrabajadas: 7, jornadasPrevistas: 25, ausencias: 1, porMotivo: { Franco: 1, Vacaciones: 0, "Otro motivo": 0 }, diasSinParte: 2, valorJornada: 41326.86, sueldoMano: 1004242, valorHoraNoAplica: false, extrasCrudas: 1 },
    { clave: "r2", legajo: "", colaborador: "Gómez, Luis", cuil: "27222222223", empresa: "2030 S.R.L.", tipo: "Jornada", categoria: "Ayudante", centroCosto: "", proyecto: "LN+", area: "Técnica", turno: "Tarde", desde: "2026-11-01", hasta: "2026-11-23", contratos: 12, jornadasTrabajadas: 1, jornadasPrevistas: null, ausencias: 0, porMotivo: { Franco: 0, Vacaciones: 0, "Otro motivo": 0 }, diasSinParte: 9, valorJornada: 66686.15, sueldoMano: null, valorHoraNoAplica: true, extrasCrudas: 2 },
  ],
  detalle: [
    detalle({ extras: { total: 1, h50: 0, h100: 0, horarioEntrada: "06:00", horarioSalida: "12:00", feriado: false }, entradaReal: "05:30", salidaReal: "12:30" }),
    detalle({ fecha: "2026-11-20", dia: "Jue", feriado: "Soberanía", extras: { total: 1, h50: 1, h100: 0, horarioEntrada: "06:00", horarioSalida: "12:00", feriado: true }, entradaReal: "12:00", salidaReal: "13:00" }),
    detalle({ claveResumen: "r2", colaborador: "Gómez, Luis", estado: "Ausente", motivo: "Franco" }),
  ],
  partes: [{ parte: "DEM-REG-1", fecha: "2026-11-06", proyecto: "LN+", area: "", turno: "", responsable: "Supervisora, Una", presentes: 3, ausentes: 1, comentario: "Hola" }],
  revisar: [],
  totales: { resumen: 2, detalle: 3, partes: 1, revisar: 0 },
  exportadoPor: "Quien Exporta",
  ...extra,
});

test("el reparto es el del reporte: 05:30-12:30 sobre 06:00-12:00 un viernes = media al 100% y media al 50%; feriado = todo al 100% aunque haya reparto guardado", () => {
  const [a, b] = consolidado().detalle;
  assert.deepEqual(repartoDeExtras(a, DEFAULT_GLOSSARY), { h50: 0.5, h100: 0.5 });
  assert.deepEqual(repartoDeExtras(b, DEFAULT_GLOSSARY), { h50: 0, h100: 1 });
  assert.equal(repartoDeExtras(detalle({}), DEFAULT_GLOSSARY), null);
});

test("seis hojas en orden; las de datos son tablas con encabezado; el resumen suma las horas y calcula valor hora e importes; jornada = valor hora vacío", () => {
  const hojas = hojasDelConsolidado(consolidado(), DEFAULT_GLOSSARY, { exportadoPor: "", exportadoEl: "20/11/2026 15:00" });
  assert.deepEqual(hojas.map((h) => h.nombre), ["Información", "Resumen por persona", "Detalle diario", "Partes", "A revisar", "Glosario"]);
  assert.deepEqual(hojas.map((h) => !!h.tabla), [false, true, true, true, true, false]);
  const resumen = hojas[1];
  const col = (t: string) => resumen.columnas.findIndex((c) => c.titulo === t);
  assert.ok(col("Franco") > 0 && col("Otro motivo") > col("Vacaciones"), "una columna por motivo del catálogo más Otro motivo");
  const perez = resumen.filas[0];
  assert.equal(perez[col("Hs extras 50%")], 0.5);
  assert.equal(perez[col("Hs extras 100%")], 1.5);
  assert.equal(perez[col("Hs extras total")], 2);
  assert.equal(perez[col("Valor hora")], 6694.95);
  assert.equal(perez[col("Importe extras 50%")], 5021.21);
  assert.equal(perez[col("Importe extras 100%")], 20084.85);
  assert.equal(perez[col("Importe extras total")], 25106.06);
  assert.equal(perez[col("Franco")], 1);
  const gomez = resumen.filas[1];
  assert.equal(gomez[col("Legajo")], null, "sin legajo = vacío, no «-»");
  assert.equal(gomez[col("Jornadas previstas")], null);
  assert.equal(gomez[col("Valor hora")], null);
  assert.equal(gomez[col("Importe extras total")], null);
  assert.equal(gomez[col("Contratos")], 12);
});

test("el detalle lleva fecha ISO, horas previstas y reales por separado y el reparto por fila; A revisar vacía lo dice; la información cuenta las filas", () => {
  const hojas = hojasDelConsolidado(consolidado(), DEFAULT_GLOSSARY, { exportadoPor: "", exportadoEl: "20/11/2026 15:00" });
  const det = hojas[2];
  const col = (t: string) => det.columnas.findIndex((c) => c.titulo === t);
  assert.deepEqual(["Entrada prevista", "Salida prevista", "Entrada real", "Salida real"].map(col).every((i) => i > 0), true);
  const f = det.filas[0];
  assert.equal(f[col("Fecha")], "2026-11-06");
  assert.equal(det.columnas[col("Fecha")].tipo, "fecha");
  assert.equal(f[col("Entrada prevista")], "06:00");
  assert.equal(f[col("Entrada real")], "05:30");
  assert.equal(f[col("Hs 50%")], 0.5);
  assert.equal(f[col("Hs 100%")], 0.5);
  assert.equal(det.filas[1][col("Feriado")], "Sí: Soberanía");
  assert.equal(det.filas[2][col("Hs extras total")], null, "sin extras = vacío");
  assert.equal(det.filas[2][col("Motivo")], "Franco");
  const revisar = hojas[4];
  assert.equal(revisar.filas.length, 0);
  assert.equal(revisar.vacioDice, "No hay nada para revisar en este período.");
  const info = hojas[0];
  assert.ok(info.filas.some((r) => r[0] === "Exportado por" && r[1] === "Quien Exporta"));
  assert.ok(info.filas.some((r) => r[0] === "Detalle diario" && r[1] === 3));
  assert.ok(hojas[5].filas.some((r) => String(r[0]).startsWith("TURNOS QUE CRUZAN MEDIANOCHE")));
  assert.equal(nombreDelConsolidado(consolidado()), "consolidado_novedades_LN+_2026-11-01_a_2026-11-30.xlsx");
});
