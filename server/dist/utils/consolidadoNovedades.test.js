/** Consolidado de Novedades: las reglas confirmadas el 20/11/2026, sin base. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { consolidarNovedades } from "./consolidadoNovedades.js";
const P = { id: "p1", nombre: "LN+", centroCosto: "705" };
const persona = (id, nombre) => ({ id, nombre, apellido: nombre.split(", ")[0], nombrePila: nombre.split(", ")[1] || "", cuil: `20${id.padStart(9, "0")}`, legajo: `L${id}` });
const contrato = (personaId, key, alta, baja, extra = {}) => ({
    key, personaId, proyectoId: P.id, proyecto: P.nombre, centroCosto: P.centroCosto, alta, baja, tipo: "Plazo fijo 6x6", tipoId: "6", empresa: "2030 S.R.L.", empresaId: "e1", categoria: "Auxiliar", categoriaId: "c1", grupo: 4, obraSocialCodigo: "120900", obraSocialOrigen: "convenio", obraSocialSegunLiquidaciones: "", area: "Técnica", turno: "Mañana", horaInicio: "06:00", horaFin: "12:00", sueldoJornada: 41326.86, sueldoMano: 1004242, fechasTrabajadas: [], diasSemana: [1, 2, 3, 4, 5, 6], rotativo: false, ...extra,
});
const registro = (personaId, status, extra = {}) => ({ personaId, status, motivo: "", reemplazanteId: "", extras: 0, h50: 0, h100: 0, entradaReal: "", salidaReal: "", entradaPrevista: "06:00", salidaPrevista: "12:00", area: "Técnica", turno: "Mañana (06:00 - 12:00)", ...extra });
const parte = (numero, fecha, registros, extra = {}) => ({ numero, fecha, proyectoId: P.id, proyecto: P.nombre, area: "Técnica", turno: "Mañana", responsable: "Supervisora, Una", comentario: "", registros, ...extra });
// Lunes 02/11 a domingo 08/11 de 2026.
const base = (extra = {}) => ({ desde: "2026-11-02", hasta: "2026-11-08", personas: [persona("1", "Pérez, Ana"), persona("2", "Gómez, Luis")], contratos: [], partes: [], feriados: [], motivos: ["Franco", "Vacaciones"], ...extra });
test("un día sin parte: no le correspondía → nada; le correspondía → Falta parte en el detalle y agrupada por persona en A revisar", () => {
    const r = consolidarNovedades(base({ contratos: [contrato("1", "k1", "2026-11-01", "2026-11-30")], partes: [parte("DEM-1", "2026-11-02", [registro("1", "present")])] }));
    // Lun con parte; mar a sáb asignados sin parte; domingo no asignado.
    assert.deepEqual(r.detalle.map((d) => `${d.fecha} ${d.estado}`), ["2026-11-02 Presente", "2026-11-03 Falta parte", "2026-11-04 Falta parte", "2026-11-05 Falta parte", "2026-11-06 Falta parte", "2026-11-07 Falta parte"]);
    assert.deepEqual(r.revisar.map((x) => [x.tipo, x.fecha]), [["Falta parte", "03/11, 04/11, 05/11, 06/11, 07/11"]]);
    assert.equal(r.resumen.length, 1);
    assert.equal(r.resumen[0].jornadasPrevistas, 6);
    assert.equal(r.resumen[0].jornadasTrabajadas, 1);
    assert.equal(r.resumen[0].diasSinParte, 5);
    assert.equal(r.resumen[0].sueldoMano, 1004242);
    assert.equal(r.resumen[0].valorHoraNoAplica, false);
});
test("sin ningún parte en el período: nada en el detalle, UNA alerta; el resumen igual cuenta los días sin parte", () => {
    const r = consolidarNovedades(base({ contratos: [contrato("1", "k1", "2026-11-01", "2026-11-30")] }));
    assert.equal(r.detalle.length, 0);
    assert.deepEqual(r.revisar.map((x) => x.tipo), ["Sin ningún parte en el mes"]);
    assert.match(r.revisar[0].detalle, /6 día\(s\) asignados/);
    assert.equal(r.resumen[0].diasSinParte, 6);
});
test("contrato sin días o rotativo: no se infiere del turno; «Días no evaluables» y previstas vacías", () => {
    const r = consolidarNovedades(base({ contratos: [contrato("1", "k1", "2026-11-01", "2026-11-30", { diasSemana: [] }), contrato("2", "k2", "2026-11-01", "2026-11-30", { rotativo: true, diasSemana: [1, 2, 3, 4, 5, 6, 0] })], partes: [parte("DEM-1", "2026-11-02", [registro("1", "present"), registro("2", "absent", { motivo: "Franco" })])] }));
    assert.equal(r.detalle.length, 2);
    assert.deepEqual(r.revisar.map((x) => [x.tipo, x.colaborador]), [["Días no evaluables", "Gómez, Luis"], ["Días no evaluables", "Pérez, Ana"]]);
    assert.match(r.revisar[0].detalle, /días rotativos/);
    assert.match(r.revisar[1].detalle, /no tiene días asignados/);
    assert.deepEqual(r.resumen.map((f) => f.jornadasPrevistas), [null, null]);
});
test("parte de alguien sin contrato ese día: «Sin contrato vigente» con lo que dijo el parte; sin parte y sin contrato, nada", () => {
    const r = consolidarNovedades(base({ partes: [parte("DEM-1", "2026-11-02", [registro("2", "present", { extras: 1, entradaReal: "12:00", salidaReal: "13:00" })])] }));
    assert.equal(r.detalle.length, 1);
    assert.equal(r.detalle[0].estado, "Sin contrato vigente");
    assert.equal(r.detalle[0].motivo, "El parte dice Presente");
    assert.deepEqual(r.detalle[0].extras, { total: 1, h50: 0, h100: 0, horarioEntrada: "06:00", horarioSalida: "12:00", feriado: false });
    assert.deepEqual(r.revisar.map((x) => x.tipo), ["Sin contrato vigente"]);
    assert.equal(r.resumen[0].tipo, "Sin contrato vigente");
    assert.equal(r.resumen[0].jornadasPrevistas, null);
});
test("jornadas: una fila del resumen por persona, tipo, empresa, categoría y valor; previstas = fechas; valor hora no aplica y avisa sólo si hay extras", () => {
    const j = (key, fecha, extra = {}) => contrato("1", key, fecha, fecha, { tipo: "Jornada", tipoId: "9", fechasTrabajadas: [fecha], diasSemana: [], sueldoJornada: 66686.15, sueldoMano: 54016, ...extra });
    const r = consolidarNovedades(base({
        contratos: [j("j1", "2026-11-02"), j("j2", "2026-11-04"), j("j3", "2026-11-06"), j("j4", "2026-11-07", { sueldoJornada: 70000 })],
        partes: [parte("DEM-1", "2026-11-02", [registro("1", "present", { extras: 2, entradaReal: "12:00", salidaReal: "14:00" })]), parte("DEM-2", "2026-11-04", [registro("1", "absent", { motivo: "Vacaciones" })])],
    }));
    assert.equal(r.resumen.length, 2);
    const [a, b] = r.resumen;
    assert.equal(a.contratos, 3);
    assert.deepEqual([a.desde, a.hasta, a.jornadasPrevistas, a.jornadasTrabajadas, a.ausencias, a.diasSinParte, a.porMotivo.Vacaciones], ["2026-11-02", "2026-11-06", 3, 1, 1, 1, 1]);
    assert.equal(a.sueldoMano, null);
    assert.equal(a.valorHoraNoAplica, true);
    assert.equal(b.valorJornada, 70000);
    assert.deepEqual(r.revisar.map((x) => x.tipo), ["Falta parte", "Valor hora no disponible"]);
    assert.match(r.revisar[1].detalle, /2 h extra/);
    // Las fechas quedan en el detalle: el 06 asignado sin parte, el 07 también.
    assert.deepEqual(r.detalle.map((d) => `${d.fecha} ${d.estado}`), ["2026-11-02 Presente", "2026-11-04 Ausente", "2026-11-06 Falta parte", "2026-11-07 Falta parte"]);
});
test("duplicados exactos que tocan el período: se muestra uno y se avisa; una jornada no es duplicado", () => {
    const ti = { tipo: "Tiempo Indeterminado", tipoId: "1" };
    const r = consolidarNovedades(base({ contratos: [contrato("1", "k1", "2026-01-01", ""), contrato("1", "k2", "2026-01-01", "", ti), contrato("1", "k3", "2026-01-01", "", ti)], partes: [parte("DEM-1", "2026-11-02", [registro("1", "present")])] }));
    // k1 (6x6) y k2 (indeterminado) son distintos: dos filas; k3 repite a k2: se avisa y no se muestra.
    assert.deepEqual(r.resumen.map((f) => f.tipo).sort(), ["Plazo fijo 6x6", "Tiempo Indeterminado"]);
    assert.equal(r.revisar.filter((x) => x.tipo === "Contrato duplicado").length, 1);
    // Dos jornadas el mismo día no son duplicado.
    const j = (key) => contrato("1", key, "2026-11-02", "2026-11-02", { tipo: "Jornada", tipoId: "9", fechasTrabajadas: ["2026-11-02"], diasSemana: [] });
    assert.equal(consolidarNovedades(base({ contratos: [j("j1"), j("j2")], partes: [parte("DEM-1", "2026-11-02", [registro("1", "present")])] })).revisar.filter((x) => x.tipo === "Contrato duplicado").length, 0);
});
test("reemplazos, horas y área: reemplazado por / reemplaza a; salida anterior a la entrada salvo cruce de medianoche; extras sin horas; sin área", () => {
    const r = consolidarNovedades(base({
        contratos: [contrato("1", "k1", "2026-11-01", "2026-11-30")],
        partes: [parte("DEM-1", "2026-11-02", [
                registro("1", "absent", { motivo: "Franco", reemplazanteId: "2" }),
                registro("2", "present", { extras: 1, entradaReal: "23:00", salidaReal: "01:00", entradaPrevista: "18:00", salidaPrevista: "00:00", area: "" }),
            ], { area: "" })],
    }));
    const fila1 = r.detalle.find((d) => d.colaborador === "Pérez, Ana" && d.fecha === "2026-11-02");
    const fila2 = r.detalle.find((d) => d.colaborador === "Gómez, Luis");
    assert.equal(fila1.reemplazo, "Reemplazado por Gómez, Luis");
    assert.equal(fila2.reemplazo, "Reemplaza a Pérez, Ana");
    assert.deepEqual(r.revisar.map((x) => x.tipo), ["Sin contrato vigente", "Reemplazante sin contrato vigente", "Falta parte", "Sin área"]);
    const r2 = consolidarNovedades(base({ contratos: [contrato("1", "k1", "2026-11-01", "2026-11-30")], partes: [parte("DEM-1", "2026-11-02", [registro("1", "present", { extras: 1, entradaReal: "10:00", salidaReal: "09:00" }), registro("1", "present", { extras: 1 })])] }));
    assert.deepEqual(r2.revisar.map((x) => x.tipo).filter((t) => t !== "Falta parte").sort(), ["Extras sin entrada/salida", "Salida anterior a la entrada"]);
});
test("motivo fuera del catálogo («Otros Presentes»): Ausente en «Otro motivo» y una línea en A revisar con las fechas", () => {
    const r = consolidarNovedades(base({ contratos: [contrato("1", "k1", "2026-11-01", "2026-11-30")], partes: [parte("DEM-1", "2026-11-02", [registro("1", "absent", { motivo: "Otros Presentes" })]), parte("DEM-2", "2026-11-03", [registro("1", "absent", { motivo: "Otros Presentes" })])] }));
    assert.equal(r.resumen[0].ausencias, 2);
    assert.equal(r.resumen[0].porMotivo["Otro motivo"], 2);
    const m = r.revisar.find((x) => x.tipo === "Motivo fuera del catálogo");
    assert.equal(m.fecha, "02/11, 03/11");
    assert.match(m.detalle, /«Otros Presentes»/);
});
test("feriado, día no asignado y hoja de partes: el feriado viaja; presente en día no asignado lo dice; el parte sale una vez con su comentario", () => {
    const r = consolidarNovedades(base({
        feriados: [{ fecha: "2026-11-08", nombre: "Feriado de prueba" }],
        contratos: [contrato("1", "k1", "2026-11-01", "2026-11-30")],
        partes: [parte("DEM-1", "2026-11-08", [registro("1", "present", { extras: 1, entradaReal: "12:00", salidaReal: "13:00" })], { comentario: " Comentario del parte " })],
    }));
    const d = r.detalle.find((x) => x.fecha === "2026-11-08");
    assert.equal(d.feriado, "Feriado de prueba");
    assert.equal(d.motivo, "Día no asignado en el contrato");
    assert.equal(d.extras?.feriado, true);
    assert.deepEqual(r.partes, [{ parte: "DEM-1", fecha: "2026-11-08", proyecto: "LN+", area: "Técnica", turno: "Mañana", responsable: "Supervisora, Una", presentes: 1, ausentes: 0, comentario: "Comentario del parte" }]);
});
// --- Hoja por empresa (20/11/2026) ---
test("feriado: las horas trabajadas salen de las reales (o del turno), 0 si estuvo ausente; el detalle lleva la empresa", () => {
    const feriados = [{ fecha: "2026-11-04", nombre: "Feriado de prueba" }];
    const r = consolidarNovedades(base({ feriados, contratos: [contrato("1", "k1", "2026-11-01", "2026-11-30"), contrato("2", "k2", "2026-11-01", "2026-11-30")], partes: [
            parte("DEM-1", "2026-11-04", [registro("1", "present", { extras: 1, entradaReal: "05:30", salidaReal: "12:30" }), registro("2", "absent", { motivo: "Franco" })]),
            parte("DEM-2", "2026-11-05", [registro("1", "present"), registro("2", "present")]),
        ] }));
    const ana = r.resumen.find((f) => f.colaborador === "Pérez, Ana"), luis = r.resumen.find((f) => f.colaborador === "Gómez, Luis");
    assert.equal(ana.horasFeriado, 7, "05:30 a 12:30 el feriado");
    assert.equal(luis.horasFeriado, 0, "ausente el feriado");
    assert.equal(ana.apellido, "Pérez");
    assert.equal(ana.nombrePila, "Ana");
    assert.equal(ana.grupo, 4);
    assert.equal(ana.obraSocialCodigo, "120900");
    assert.equal(ana.esJornada, false);
    assert.equal(ana.sinContrato, false);
    assert.ok(r.detalle.every((d) => d.empresa === "2030 S.R.L."));
    // Sin horas reales: las del turno (06:00-12:00 = 6). Turno que cruza medianoche: 18:00-00:00 = 6.
    const r2 = consolidarNovedades(base({ feriados, contratos: [contrato("1", "k1", "2026-11-01", "2026-11-30")], partes: [parte("DEM-1", "2026-11-04", [registro("1", "present", { entradaPrevista: "18:00", salidaPrevista: "00:00" })])] }));
    assert.equal(r2.resumen[0].horasFeriado, 6);
});
test("vacaciones corridas: del primer al último día del tramo aunque haya un franco en el medio; un día trabajado corta el tramo", () => {
    // Lun 02 a dom 08: vacaciones 02, 03, 04 y 06, 07 con franco el 05 → un tramo de 6 corridos (02 al 07).
    const partesVac = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-06", "2026-11-07"].map((f, i) => parte(`DEM-${i}`, f, [registro("1", "absent", { motivo: "Vacaciones" })]));
    const r = consolidarNovedades(base({ contratos: [contrato("1", "k1", "2026-11-01", "2026-11-30")], partes: [...partesVac, parte("DEM-F", "2026-11-05", [registro("1", "absent", { motivo: "Franco" })])] }));
    assert.equal(r.resumen[0].porMotivo["Vacaciones"], 5);
    assert.equal(r.resumen[0].vacacionesCorridas, 6);
    // Si el 05 trabajó, son dos tramos: 3 + 2.
    const r2 = consolidarNovedades(base({ contratos: [contrato("1", "k1", "2026-11-01", "2026-11-30")], partes: [...partesVac, parte("DEM-F", "2026-11-05", [registro("1", "present")])] }));
    assert.equal(r2.resumen[0].vacacionesCorridas, 5);
});
test("reemplazos: cuenta los días en que la persona reemplaza a otra", () => {
    const r = consolidarNovedades(base({ contratos: [contrato("1", "k1", "2026-11-01", "2026-11-30"), contrato("2", "k2", "2026-11-01", "2026-11-30")], partes: [
            parte("DEM-1", "2026-11-02", [registro("1", "absent", { motivo: "Franco", reemplazanteId: "2" }), registro("2", "present")]),
            parte("DEM-2", "2026-11-03", [registro("1", "present"), registro("2", "present")]),
        ] }));
    assert.equal(r.resumen.find((f) => f.colaborador === "Gómez, Luis").reemplazos, 1);
    assert.equal(r.resumen.find((f) => f.colaborador === "Pérez, Ana").reemplazos, 0);
});
test("lo que a la hoja por empresa le falta del catálogo va a A revisar: contrato sin empresa, categoría sin grupo, obra social sin código, persona sin ficha", () => {
    const r = consolidarNovedades(base({
        contratos: [contrato("1", "k1", "2026-11-01", "2026-11-30", { empresa: "", grupo: null, obraSocialCodigo: "", obraSocialOrigen: "" }), contrato("2", "k2", "2026-11-01", "2026-11-30", { tipo: "Servicios Jornada", fechasTrabajadas: ["2026-11-03"], grupo: null, obraSocialCodigo: "" })],
        partes: [parte("DEM-1", "2026-11-02", [registro("1", "present"), registro("9", "present")])],
    }));
    const tipos = r.revisar.map((x) => `${x.tipo}|${x.colaborador}`);
    assert.ok(tipos.includes("Contrato sin empresa|Pérez, Ana"));
    assert.ok(tipos.includes("Categoría sin grupo|Pérez, Ana"));
    assert.ok(tipos.includes("Obra social sin código|Pérez, Ana"));
    assert.ok(!tipos.some((t) => t.startsWith("Categoría sin grupo|Gómez")), "las jornadas no van a la hoja por empresa: sin alerta");
    assert.ok(tipos.includes("Persona sin ficha|(persona 9)"));
    assert.equal(r.revisar[0].tipo, "Persona sin ficha", "primera en el orden");
});
test("conAlgunParte: quien no figura en ningún parte lo dice en el resumen (la hoja por empresa resalta la fila)", () => {
    const r = consolidarNovedades(base({ contratos: [contrato("1", "k1", "2026-11-01", "2026-11-30"), contrato("2", "k2", "2026-11-01", "2026-11-30")], partes: [parte("DEM-1", "2026-11-02", [registro("1", "present")])] }));
    assert.equal(r.resumen.find((f) => f.colaborador === "Pérez, Ana").conAlgunParte, true);
    assert.equal(r.resumen.find((f) => f.colaborador === "Gómez, Luis").conAlgunParte, false);
    assert.equal(r.resumen.find((f) => f.colaborador === "Gómez, Luis").diasSinParte, 6);
});
test("obra social: si liquidaciones usa otra, A revisar lo dice con los dos valores y no decide; igual código (con o sin ceros) no avisa", () => {
    const r = consolidarNovedades(base({ contratos: [
            contrato("1", "k1", "2026-11-01", "2026-11-30", { obraSocialCodigo: "901006", obraSocialOrigen: "contrato", obraSocialSegunLiquidaciones: "128102" }),
            contrato("2", "k2", "2026-11-01", "2026-11-30", { obraSocialCodigo: "003900", obraSocialSegunLiquidaciones: "3900" }),
        ] }));
    const d = r.revisar.filter((x) => x.tipo === "Obra social discrepa con liquidaciones");
    assert.equal(d.length, 1);
    assert.equal(d[0].colaborador, "Pérez, Ana");
    assert.ok(d[0].detalle.includes("901006") && d[0].detalle.includes("128102") && d[0].detalle.includes("Lo decide laboral"));
});
