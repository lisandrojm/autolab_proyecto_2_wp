/**
 * Corre una liquidación de prueba contra los datos reales. SÓLO LECTURA: no guarda la corrida.
 *
 *   npx tsx src/scripts/verificarCorrida.ts <tenantId> [periodo AAAA-MM]
 *
 * Usa el MAPEO SEMILLA en memoria, así se puede ver qué saldría antes de aplicar nada en la base.
 * Es la forma de contestar "¿y esto qué va a dar?" sin escribir una sola línea en producción.
 *
 * Imprime, además del resumen, las diez filas más grandes y de qué eventos salió cada una: sin eso
 * el resultado es un número en el que hay que creer.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { Request } from "../models/Request.js";
import { RequestConfig } from "../models/RequestConfig.js";
import { Project } from "../models/Project.js";
import { limitesDelPeriodo } from "../utils/liquidacion/contratos.js";
import { armarPadron } from "../services/liquidacion/padron.js";
import { normalizarParte } from "../services/liquidacion/normalizar.js";
import { codificarEvento } from "../services/liquidacion/codificar.js";
import { agregarLineas, hojaDe } from "../services/liquidacion/agregar.js";
import { MAPEO_SEMILLA, HORAS_EXTRA, JORNAL_BASE_SUGERIDO, MOTIVOS_QUE_NO_LIQUIDAN } from "../utils/liquidacion/mapeoSemilla.js";
import { claveDeMotivo } from "../utils/liquidacion/nombresDeMotivo.js";
const titulo = (t) => console.log(`\n${"═".repeat(78)}\n${t}\n${"═".repeat(78)}`);
async function main() {
    const tenantId = new Types.ObjectId(process.argv[2]);
    const periodo = process.argv[3] || "2026-08";
    const conJornalBase = !process.argv.includes("--sin-jornal-base");
    const { desde, hasta } = limitesDelPeriodo(periodo);
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    console.log(`Base: ${env.MONGO_DB_NAME}   ·   período: ${periodo}   ·   mapeo: semilla en memoria`);
    const t0 = Date.now();
    const [padron, motivos, proyectos] = await Promise.all([
        armarPadron(tenantId, periodo),
        RequestConfig.find({ tenantId }).select("name").lean(),
        Project.find({ tenantId }).select("name").lean(),
    ]);
    const nombreProyecto = new Map(proyectos.map((p) => [String(p._id), p.name]));
    /* El mapeo semilla, con la forma que espera el motor y vigente desde siempre. */
    const semillaPorClave = new Map(Object.entries(MAPEO_SEMILLA).map(([nombre, efectos]) => [claveDeMotivo(nombre), efectos]));
    const noLiquidaPorClave = new Set(MOTIVOS_QUE_NO_LIQUIDAN.map(claveDeMotivo));
    const efectosPorNombre = new Map();
    for (const m of motivos) {
        const semilla = semillaPorClave.get(claveDeMotivo(m.name)) || [];
        efectosPorNombre.set(claveDeMotivo(m.name), semilla.map((e) => ({ ...e, soloRegimen: e.soloRegimen ?? null, empresaId: null, vigenteDesde: "2020-01-01", vigenteHasta: null })));
    }
    const porPersonaYProyecto = new Map();
    const porPersona = new Map();
    for (const f of padron.filas) {
        const datos = { apellidoYNombre: f.apellidoYNombre, legajo: f.legajo, empresaId: f.empresaId, ccCodigo: f.ccCodigo, regimen: f.regimen };
        if (!porPersonaYProyecto.has(`${f.userId}|${f.projectId}`))
            porPersonaYProyecto.set(`${f.userId}|${f.projectId}`, datos);
        if (!porPersona.has(f.userId))
            porPersona.set(f.userId, datos);
    }
    const datosDe = (userId, projectId) => (projectId ? porPersonaYProyecto.get(`${userId}|${projectId}`) : undefined) || porPersona.get(userId);
    const partes = await Request.find({ tenantId, date: { $gte: desde, $lte: hasta }, "attendance.0": { $exists: true } })
        .select("date projectId areaId shiftId attendance")
        .sort({ date: 1 })
        .lean();
    const eventos = [];
    for (const parte of partes) {
        eventos.push(...normalizarParte({
            _id: String(parte._id),
            date: parte.date,
            projectId: parte.projectId ? String(parte.projectId) : null,
            proyectoNombre: parte.projectId ? nombreProyecto.get(String(parte.projectId)) || null : null,
            areaId: parte.areaId ? String(parte.areaId) : null,
            shiftId: parte.shiftId ? String(parte.shiftId) : null,
            attendance: (parte.attendance || []).map((r) => ({ ...r, _id: String(r._id) })),
        }, datosDe));
    }
    const globales = {
        horasExtra: HORAS_EXTRA,
        jornalBase: conJornalBase ? JORNAL_BASE_SUGERIDO : null,
    };
    const lineas = [];
    const exclusiones = [];
    for (const evento of eventos) {
        const clave = claveDeMotivo(evento.motivoNombre || "");
        const efectos = efectosPorNombre.get(clave) || [];
        const r = codificarEvento(evento, efectos, globales, noLiquidaPorClave.has(clave));
        lineas.push(...r.lineas);
        exclusiones.push(...r.exclusiones);
    }
    const agregadas = agregarLineas(lineas);
    const nombreEmpresa = new Map();
    const nombreCC = new Map();
    padron.filas.forEach((f) => {
        if (f.empresaId && f.empresaNombre)
            nombreEmpresa.set(f.empresaId, f.empresaNombre);
        if (f.ccCodigo && f.ccNombre)
            nombreCC.set(f.ccCodigo, f.ccNombre);
    });
    const hojas = new Map();
    agregadas.forEach((l) => {
        const h = hojaDe(l, l.empresaId ? nombreEmpresa.get(l.empresaId) || "" : "", l.ccCodigo ? nombreCC.get(l.ccCodigo) : null);
        hojas.set(h, (hojas.get(h) || 0) + 1);
    });
    titulo(`RESULTADO  (${Date.now() - t0} ms)`);
    console.log(`Partes:    ${partes.length}`);
    console.log(`Eventos:   ${eventos.length}   (${eventos.filter((e) => e.aplicaA === "reemplazante").length} de reemplazantes)`);
    console.log(`Líneas sin agregar: ${lineas.length}`);
    console.log(`FILAS DEL ARCHIVO:  ${agregadas.length}   en ${hojas.size} hojas`);
    console.log(`Personas:  ${new Set(agregadas.map((l) => l.legajo)).size}`);
    console.log(`Jornal base: ${conJornalBase ? `${JORNAL_BASE_SUGERIDO.codigo} para jornaleros` : "sin configurar"}`);
    titulo("HOJAS");
    [...hojas.entries()].sort((a, b) => b[1] - a[1]).forEach(([h, n]) => console.log(`   ${String(n).padStart(4)} filas   ${h}`));
    titulo("CONCEPTOS EMITIDOS");
    const porConcepto = new Map();
    agregadas.forEach((l) => {
        const a = porConcepto.get(l.conceptoCodigo) || { filas: 0, par1: 0, par2: 0 };
        porConcepto.set(l.conceptoCodigo, { filas: a.filas + 1, par1: a.par1 + l.par1, par2: a.par2 + l.par2 });
    });
    [...porConcepto.entries()].sort((a, b) => b[1].filas - a[1].filas).forEach(([c, x]) => console.log(`   ${c}: ${x.filas} filas   par1=${Math.round(x.par1 * 100) / 100}   par2=${Math.round(x.par2 * 100) / 100}`));
    titulo("LAS 10 FILAS MÁS GRANDES, con de dónde salieron");
    [...agregadas]
        .sort((a, b) => b.par1 + b.par2 - (a.par1 + a.par2))
        .slice(0, 10)
        .forEach((l) => {
        console.log(`   ${l.legajo}  ${l.apellidoYNombre.padEnd(32).slice(0, 32)}  ${l.conceptoCodigo}  par1=${l.par1} par2=${l.par2}  (${l.dias} días, ${l.eventIds.length} eventos: ${l.origenes.join(", ")})`);
    });
    titulo("EXCEPCIONES DEL CÁLCULO");
    const porMotivo = new Map();
    exclusiones.forEach((e) => porMotivo.set(e.motivo, (porMotivo.get(e.motivo) || 0) + 1));
    [...porMotivo.entries()].sort((a, b) => b[1] - a[1]).forEach(([m, n]) => console.log(`   ${String(n).padStart(5)}   ${m}`));
    /* Desglose del aviso que más confunde: qué motivos son los que no tienen mapeo. */
    const sinEfecto = new Map();
    exclusiones
        .filter((e) => e.motivo === "sin_efecto_configurado")
        .forEach((e) => sinEfecto.set(e.detalle, (sinEfecto.get(e.detalle) || 0) + 1));
    if (sinEfecto.size) {
        console.log("");
        console.log("Desglose de sin_efecto_configurado:");
        [...sinEfecto.entries()].sort((x, y) => y[1] - x[1]).forEach(([d, n]) => console.log(`   ${String(n).padStart(4)}   ${d}`));
    }
    console.log("\nEjemplos:");
    [...porMotivo.keys()].forEach((m) => {
        const uno = exclusiones.find((e) => e.motivo === m);
        console.log(`   ${m}: ${uno.apellidoYNombre || uno.userId} el ${uno.fecha} — ${uno.detalle}`);
    });
    titulo("EXCEPCIONES DEL PADRÓN");
    const porTipo = new Map();
    padron.excepciones.forEach((e) => porTipo.set(e.tipo, (porTipo.get(e.tipo) || 0) + 1));
    [...porTipo.entries()].sort((a, b) => b[1] - a[1]).forEach(([t, n]) => console.log(`   ${String(n).padStart(5)}   ${t}`));
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
