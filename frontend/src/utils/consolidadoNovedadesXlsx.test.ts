/** Las hojas del Consolidado Empresas: hoja por empresa, reparto 50/100 con el glosario del navegador, importes, celdas vacías, orden. Personas ficticias. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLUMNAS_EMPRESA, diasDelMes, hojasDelConsolidado, mesDeLiquidacion, nombreDelConsolidado, repartoDeExtras } from "./consolidadoNovedadesXlsx";
import { periodoQueCierra, periodosDeLiquidacion } from "./periodoLiquidacion";
import { DEFAULT_GLOSSARY } from "./overtimeUtils";
import type { ConsolidadoNovedades, FilaDetalleConsolidado, FilaResumenConsolidado } from "../api/request";

const detalle = (extra: Partial<FilaDetalleConsolidado>): FilaDetalleConsolidado => ({
  claveResumen: "p1|LN|k1", fecha: "2026-11-06", dia: "Vie", feriado: "", colaborador: "Pérez, Ana", cuil: "20111111112", proyecto: "LN+", empresa: "2030 S.R.L.", area: "Técnica", turno: "Mañana (06:00 - 12:00)", estado: "Presente", motivo: "",
  entradaPrevista: "06:00", salidaPrevista: "12:00", entradaReal: "", salidaReal: "", extras: null, reemplazo: "", parte: "DEM-REG-1", ...extra,
});
const resumen = (extra: Partial<FilaResumenConsolidado>): FilaResumenConsolidado => ({
  clave: "p1|LN|k1", legajo: "00028", colaborador: "Pérez, Ana", cuil: "20111111112", empresa: "2030 S.R.L.", tipo: "Plazo fijo 6x6", categoria: "Auxiliar de Estudios", centroCosto: "426 - La Nacion", proyecto: "LN+", area: "Técnica", turno: "Mañana", desde: "2026-11-01", hasta: "2026-11-30",
  contratos: 1, jornadasTrabajadas: 2, jornadasPrevistas: 20, ausencias: 0, porMotivo: { Franco: 0, Vacaciones: 0, Enfermedad: 0, "Sin Goce de Sueldo": 0, "Otro motivo": 0 }, diasSinParte: 0, valorJornada: 41326.86, sueldoMano: 1004242.69, valorHoraNoAplica: false, extrasCrudas: 2,
  proyectoId: "LN", apellido: "Pérez", nombrePila: "Ana", grupo: 7, obraSocialCodigo: "120900", obraSocialOrigen: "convenio", esJornada: false, sinContrato: false, mensualizado: true, conAlgunParte: true, horasFeriado: 0, vacacionesCorridas: 0, reemplazos: 0, ...extra,
});
const consolidado = (extra: Partial<ConsolidadoNovedades> = {}): ConsolidadoNovedades => ({
  desde: "2026-11-01", hasta: "2026-11-30", proyectos: [{ id: "LN", nombre: "LN+", cliente: "La Nación", centroCosto: "426 - La Nacion", centroCostoCodigo: "426", centroCostoDescripcion: "La Nacion" }], feriados: [{ fecha: "2026-11-20", nombre: "Soberanía" }], motivos: ["Franco", "Vacaciones", "Enfermedad", "Sin Goce de Sueldo"],
  resumen: [
    resumen({ porMotivo: { Franco: 1, Vacaciones: 0, Enfermedad: 0, "Sin Goce de Sueldo": 0, "Otro motivo": 0 }, ausencias: 1, horasFeriado: 7, reemplazos: 1 }),
    // Jornalera: 12 contratos agrupados, sin legajo, valor hora no aplica. No va a la hoja por empresa.
    resumen({ clave: "p2|LN|J|3|e1|c2|66686.15", legajo: "", colaborador: "Gómez, Luis", cuil: "27222222223", tipo: "Servicios Jornada", categoria: "Ayudante", desde: "2026-11-01", hasta: "2026-11-23", contratos: 12, jornadasTrabajadas: 12, jornadasPrevistas: null, porMotivo: { Franco: 1, Vacaciones: 0, Enfermedad: 0, "Sin Goce de Sueldo": 0, "Otro motivo": 0 }, ausencias: 1, valorJornada: 66686.15, sueldoMano: 54015.78, valorHoraNoAplica: true, extrasCrudas: 0, proyectoId: "LN", apellido: "Gómez", nombrePila: "Luis", grupo: 10, esJornada: true, mensualizado: false }),
    // Mensualizada en FZERO con vacaciones corridas, enfermedad y una categoría fuera del catálogo.
    resumen({ clave: "p3|LN|k3", legajo: "00004", colaborador: "Supervisora, Una", cuil: "27333333334", empresa: "FZERO S.R.L", tipo: "Tiempo Indeterminado", categoria: "APUNTADOR", desde: "2026-05-01", hasta: "", porMotivo: { Franco: 2, Vacaciones: 6, Enfermedad: 2, "Sin Goce de Sueldo": 1, "Otro motivo": 0 }, ausencias: 11, vacacionesCorridas: 7, apellido: "Supervisora", nombrePila: "Una", grupo: null, obraSocialCodigo: "", obraSocialOrigen: "", extrasCrudas: 0 }),
    // Mensualizada de 2030 sin NINGÚN parte en el período: todo vacío por falta de datos, fila resaltada.
    resumen({ clave: "p4|LN|k4", legajo: "00099", colaborador: "Ausente, Nadie", cuil: "20444444445", apellido: "Ausente", nombrePila: "Nadie", jornadasTrabajadas: 0, jornadasPrevistas: 20, diasSinParte: 20, conAlgunParte: false, extrasCrudas: 0 }),
  ],
  detalle: [
    detalle({ extras: { total: 1, h50: 0, h100: 0, horarioEntrada: "06:00", horarioSalida: "12:00", feriado: false }, entradaReal: "05:30", salidaReal: "12:30", reemplazo: "Reemplaza a Gómez, Luis" }),
    detalle({ fecha: "2026-11-20", dia: "Vie", feriado: "Soberanía", extras: { total: 1, h50: 1, h100: 0, horarioEntrada: "06:00", horarioSalida: "12:00", feriado: true }, entradaReal: "05:30", salidaReal: "12:30" }),
    detalle({ fecha: "2026-11-07", dia: "Sáb", estado: "Ausente", motivo: "Franco" }),
    detalle({ claveResumen: "p2|LN|J|3|e1|c2|66686.15", colaborador: "Gómez, Luis", cuil: "27222222223", estado: "Ausente", motivo: "Franco" }),
    detalle({ claveResumen: "p3|LN|k3", colaborador: "Supervisora, Una", cuil: "27333333334", empresa: "FZERO S.R.L", fecha: "2026-11-10", dia: "Mar", estado: "Ausente", motivo: "Compensatorios" }),
    detalle({ claveResumen: "p3|LN|k3", colaborador: "Supervisora, Una", cuil: "27333333334", empresa: "FZERO S.R.L", fecha: "2026-11-20", dia: "Vie", feriado: "Soberanía", estado: "Ausente", motivo: "Franco" }),
  ],
  partes: [{ parte: "DEM-REG-1", fecha: "2026-11-06", proyecto: "LN+", area: "", turno: "", responsable: "Supervisora, Una", presentes: 3, ausentes: 1, comentario: "Hola" }],
  revisar: [],
  totales: { resumen: 3, detalle: 6, partes: 1, revisar: 0 },
  exportadoPor: "Quien Exporta",
  ...extra,
});
const info = { exportadoPor: "", exportadoEl: "20/11/2026 15:00" };
const columna = (h: { columnas: { titulo: string }[] }) => (t: string) => h.columnas.findIndex((c) => c.titulo === t);

test("el reparto es el del reporte: 05:30-12:30 sobre 06:00-12:00 un viernes = media al 100% y media al 50%; feriado = todo al 100% aunque haya reparto guardado", () => {
  const [a, b] = consolidado().detalle;
  assert.deepEqual(repartoDeExtras(a, DEFAULT_GLOSSARY), { h50: 0.5, h100: 0.5 });
  assert.deepEqual(repartoDeExtras(b, DEFAULT_GLOSSARY), { h50: 0, h100: 1 });
  assert.equal(repartoDeExtras(detalle({}), DEFAULT_GLOSSARY), null);
});

test("las hojas, en orden: Información, una por empresa (SIN EMPRESA al final), control, compensatorios, feriados, las de siempre y el glosario", () => {
  const hojas = hojasDelConsolidado(consolidado(), DEFAULT_GLOSSARY, info);
  assert.deepEqual(hojas.map((h) => h.nombre), ["Información", "12-2026 - 2030 S.R.L.", "12-2026 - FZERO S.R.L", "Novedades por persona", "Compensatorios", "Compensatorios calendario", "Compensatorios detalle", "Feriados", "Feriados detalle", "Resumen por persona", "Detalle diario", "Partes", "A revisar", "Glosario"]);
  assert.ok(hojas.slice(1, 13).every((h) => h.tabla), "todas las de datos son tablas");
  assert.equal(hojas[0].tabla, undefined);
  assert.equal(nombreDelConsolidado(consolidado()), "consolidado_empresas_LN+_2026-11-01_a_2026-11-30.xlsx");
  const sinEmpresa = hojasDelConsolidado(consolidado({ resumen: [resumen({ empresa: "" }), resumen({ clave: "p3|LN|k3", empresa: "ZZZ S.A." })] }), DEFAULT_GLOSSARY, info);
  assert.deepEqual(sinEmpresa.slice(1, 3).map((h) => h.nombre), ["12-2026 - ZZZ S.A.", "12-2026 - SIN EMPRESA"]);
});

test("la hoja por empresa: las 34 columnas en su orden, una fila por persona, sólo mensualizados, vacías las que son de liquidaciones, Feriado y Vacaciones corridas llenas", () => {
  const hojas = hojasDelConsolidado(consolidado(), DEFAULT_GLOSSARY, info);
  const h2030 = hojas[1], fzero = hojas[2];
  assert.deepEqual(h2030.columnas.map((c) => c.titulo), COLUMNAS_EMPRESA.map((c) => c.titulo));
  assert.equal(COLUMNAS_EMPRESA.length, 35, "las 34 de la planilla más «Días sin parte en el período»");
  assert.equal(h2030.filas.length, 2, "la jornalera no va; la persona sin partes sí");
  const col = columna(h2030);
  const perez = h2030.filas[0];
  assert.equal(perez[col("Días sin parte en el período")], 0);
  const nadie = h2030.filas[1];
  assert.equal(nadie[col("Leg")], 99);
  assert.equal(nadie[col("Días sin parte en el período")], 20);
  assert.equal(nadie[col("Horas Extras 100% (0016)")], 0);
  assert.deepEqual(h2030.filasResaltadas, [1], "sin ningún parte = fila entera resaltada");
  assert.ok(hojas[0].filas[1][0] === "1 persona de este archivo no tiene ningún parte en el período. Sus novedades están vacías porque no hay datos, no porque no haya novedades. Su fila va resaltada en la hoja de su empresa. Ver A revisar.", "el aviso va arriba de todo en Información");
  assert.equal(perez[col("Mes")], 202612);
  assert.equal(perez[col("CC")], 426);
  assert.equal(perez[col("Descripción")], "La Nacion");
  assert.equal(perez[col("Leg")], 28, "legajo como número, sin ceros");
  assert.equal(perez[col("Apellido")], "Pérez");
  assert.equal(perez[col("Nombre")], "Ana");
  assert.equal(perez[col("Cuil")], "20111111112");
  assert.equal(perez[col("ALTA")], "2026-11-01");
  assert.equal(perez[col("BAJA")], "2026-11-30");
  assert.equal(perez[col("Código")], "120900");
  assert.equal(perez[col("Grupo")], 7);
  assert.equal(perez[col("Tarea")], "Auxiliar de Estudios / N* 7");
  assert.equal(perez[col("Afiliado Sindical")], null, "vacía por decisión");
  assert.equal(perez[col("Días del Mes (0001)")], 30);
  assert.equal(perez[col("Inasistencias (0011)")], null, "vacía por decisión");
  assert.equal(perez[col("Horas Extras 50% (0015)")], 0.5);
  assert.equal(perez[col("Horas Extras 100% (0016)")], 1.5);
  assert.equal(perez[col("Feriado (0017)")], 7);
  assert.equal(perez[col("Licencia Enfermedad (0012)")], 0);
  assert.equal(perez[col("Lic. Vacaciones")], 0);
  assert.equal(perez[col("Remplazos Inasistencias")], 1);
  for (const t of ["Fondo Medicamentos", "TURISMO", "Días del SAC (0501)", "Adicional F (0019)", "Plus Nocturno", "Adicional H (0601)", "Adicional (0008)", "ART", "Día del Gremio", "Adelantos Sueldo (0018)", "NETO Pactado", "NOVEDAD MENSUAL (0099)"]) assert.equal(perez[col(t)], null, `${t} va vacía`);
  const una = fzero.filas[0];
  assert.equal(una[col("BAJA")], null, "contrato abierto = BAJA vacía");
  assert.equal(una[col("Código")], null, "sin obra social resuelta = vacía");
  assert.equal(una[col("Grupo")], null);
  assert.equal(una[col("Tarea")], "APUNTADOR", "sin grupo: la categoría sola");
  assert.equal(una[col("Lic. Vacaciones")], 7, "días corridos, no los 6 con motivo");
  assert.equal(una[col("Licencia Enfermedad (0012)")], 2);
  assert.equal(una[col("Lic. Sin Goce de Sueldo")], 1);
  assert.equal(una[col("Días del Mes (0001)")], 30);
});

test("dos contratos mensuales seguidos de la misma persona y empresa son UNA fila: ALTA/BAJA del que rige, novedades sumadas, Días del Mes por la unión", () => {
  const c = consolidado({ resumen: [resumen({ clave: "p1|LN|k0", desde: "2026-10-01", hasta: "2026-11-15", horasFeriado: 0, reemplazos: 0, porMotivo: { Franco: 0, Vacaciones: 0, Enfermedad: 1, "Sin Goce de Sueldo": 0, "Otro motivo": 0 } }), resumen({ clave: "p1|LN|k1", desde: "2026-11-16", hasta: "2026-11-30", porMotivo: { Franco: 0, Vacaciones: 0, Enfermedad: 1, "Sin Goce de Sueldo": 0, "Otro motivo": 0 } })] });
  const h = hojasDelConsolidado(c, DEFAULT_GLOSSARY, info)[1];
  const col = columna(h);
  assert.equal(h.filas.length, 1);
  assert.equal(h.filas[0][col("ALTA")], "2026-11-16");
  assert.equal(h.filas[0][col("Licencia Enfermedad (0012)")], 2);
  assert.equal(h.filas[0][col("Días del Mes (0001)")], 30);
  assert.equal(diasDelMes("2026-11-30", [{ desde: "2026-11-16", hasta: "2026-11-30" }]), 15);
  assert.equal(diasDelMes("2026-10-20", [{ desde: "2026-10-01", hasta: "2026-12-31" }]), 30, "entró el 01/10: el mes de sueldo (octubre) entero");
  assert.equal(diasDelMes("2026-10-20", [{ desde: "2026-06-01", hasta: "2026-09-30" }]), 0, "terminó antes del mes de sueldo");
});

test("novedades por persona, compensatorios y feriados salen del detalle; el detalle lleva la empresa", () => {
  const hojas = hojasDelConsolidado(consolidado(), DEFAULT_GLOSSARY, info);
  const control = hojas[3];
  const col = columna(control);
  assert.equal(control.filas.length, 3);
  const perez = control.filas.find((f) => f[1] === "Pérez, Ana")!;
  assert.equal(perez[col("Presente")], 2);
  assert.equal(perez[col("Franco")], 1);
  assert.equal(perez[col("Total días")], 3);
  assert.equal(perez[col("HE 50%")], 0.5);
  assert.equal(perez[col("HE 100%")], 1.5);
  assert.equal(perez[col("Días con HE")], 2);
  const comp = hojas[4];
  assert.equal(comp.filas.length, 1);
  assert.equal(comp.filas[0][columna(comp)("Fechas")], "Ma 10/11");
  assert.equal(comp.filas[0][columna(comp)("Control")], null);
  const cal = hojas[5];
  assert.equal(cal.columnas.length, 32, "Empleado + 30 días + Total");
  assert.equal(cal.filas[0][columna(cal)("Ma 10/11")], 1);
  assert.equal(cal.filas[0][columna(cal)("Total")], 1);
  const fer = hojas[7];
  const fc = columna(fer);
  assert.equal(fer.filas.length, 1);
  assert.equal(fer.filas[0][fc("Presentes")], 1);
  assert.equal(fer.filas[0][fc("Ausentes")], 1);
  assert.equal(fer.filas[0][fc("% asistencia")], 50);
  assert.equal(fer.filas[0][fc("Hs trabajadas")], 7);
  assert.equal(fer.filas[0][fc("Hs extras")], 1);
  const ferDet = hojas[8];
  assert.equal(ferDet.filas.length, 2);
  const det = hojas[10];
  const dc = columna(det);
  assert.equal(det.filas[0][dc("Empresa del contrato")], "2030 S.R.L.");
  assert.equal(det.filas[0][dc("Fecha")], "2026-11-06");
  assert.equal(det.filas[0][dc("Hs 50%")], 0.5);
  assert.equal(det.filas[0][dc("Hs 100%")], 0.5);
  assert.equal(det.filas[1][dc("Feriado")], "Sí: Soberanía");
  assert.equal(det.filas[2][dc("Hs extras total")], null, "sin extras = vacío");
  const res = hojas[9];
  const rc = columna(res);
  // El resumen respeta el orden del server: Pérez, Gómez (jornada), Supervisora.
  assert.equal(res.filas[0][rc("Valor hora")], 6694.95);
  assert.equal(res.filas[0][rc("Importe extras total")], 25106.06);
  assert.equal(res.filas[1][rc("Valor hora")], null, "jornada = valor hora vacío");
  assert.equal(res.filas[1][rc("Contratos")], 12);
  const infoHoja = hojas[0];
  assert.ok(infoHoja.filas.some((r) => r[0] === "Exportado por" && r[1] === "Quien Exporta"));
  assert.ok(infoHoja.filas.some((r) => r[0] === "12-2026 - 2030 S.R.L." && r[1] === 2));
  assert.ok(infoHoja.filas.some((r) => String(r[0]).startsWith("CLAVE DE CRUCE")));
  assert.ok(hojas[13].filas.some((r) => String(r[0]).startsWith("FERIADO (0017)")));
});

test("mes de liquidación = el siguiente al cierre; los períodos van del 21 al 20 y dicen el rango literal", () => {
  assert.deepEqual(mesDeLiquidacion("2026-10-20"), { etiqueta: "11-2026", aaaamm: 202611 });
  assert.deepEqual(mesDeLiquidacion("2026-12-20"), { etiqueta: "01-2027", aaaamm: 202701 });
  assert.deepEqual(periodoQueCierra(2026, 10), { desde: "2026-09-21", hasta: "2026-10-20", etiqueta: "21/09/2026 al 20/10/2026" });
  assert.deepEqual(periodoQueCierra(2027, 1), { desde: "2026-12-21", hasta: "2027-01-20", etiqueta: "21/12/2026 al 20/01/2027" });
  // El 20/11 inclusive todavía no cerró el período de noviembre: el primero ofrecido es el que cerró el 20/10.
  assert.equal(periodosDeLiquidacion(new Date(2026, 10, 20), 3)[0].hasta, "2026-10-20");
  assert.equal(periodosDeLiquidacion(new Date(2026, 10, 21), 3)[0].hasta, "2026-11-20");
  assert.equal(periodosDeLiquidacion(new Date(2026, 10, 21), 14).length, 14);
});
