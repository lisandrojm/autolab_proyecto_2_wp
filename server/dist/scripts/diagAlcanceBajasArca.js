/**
 * DIAGNÓSTICO, SÓLO LECTURA: alcance del fix «sólo Servicios con las bajas de ARCA» (18/11/2026).
 *
 * Para cada contrato SIN fecha de baja (null, vacía o ausente) de los proyectos del tenant, busca en el
 * espejo de ARCA (`RelacionLaboralArca`) las relaciones del mismo CUIL con la misma fecha de inicio, y
 * lo pone en un balde:
 *
 *   0. persona sin CUIL de 11 dígitos               → no se puede buscar en ARCA
 *   1. misma empleadora, ARCA con baja               → lo destraba el fix actual
 *   2. misma empleadora, ARCA abierta                → vigente de verdad
 *   3. OTRA empleadora, ARCA con baja                → el caso Pereda B (empresa mal cargada)
 *   3b. OTRA empleadora, ARCA abierta                → idem, pero sigue vigente en ARCA
 *   4. sin empresaContratoId (o empresa sin CUIT)    → el match no puede correr
 *   5. sin relación en ARCA con esa fecha de alta    → alta no declarada o fecha distinta
 *
 * Para el 3, agrupa por par (empresa local → empresa ARCA) y marca si la local es una empresa de
 * RELEASE del proyecto. Para el 5, cuenta cuántos recuperaría una tolerancia de ±1, ±2 y ±3 días (misma
 * persona y misma empleadora). NO la aplica: sólo cuenta. El matcher real es `bajaDeArcaQueAplica`
 * (`services/arca/altasVigentes.ts`): misma persona, misma empleadora y fecha de inicio EXACTA.
 *
 * No escribe nada en la base: no hay modo de escritura.
 *
 *   TENANT_SLUG=demo-tenant ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/diagAlcanceBajasArca.ts [--salida=ruta.xlsx]
 */
import mongoose, { Types } from "mongoose";
import * as XLSX from "xlsx";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { env } from "../config/env.js";
import { Tenant } from "../models/Tenant.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import { Company } from "../models/Company.js";
import UserProject from "../models/UserProject.js";
import { RelacionLaboralArca } from "../models/RelacionLaboralArca.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";
const digitos = (v) => String(v ?? "").replace(/\D/g, "");
const iso = (v) => {
    if (!v)
        return "";
    if (v instanceof Date)
        return v.toISOString().slice(0, 10);
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s))
        return s.slice(0, 10);
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (m)
        return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const corrido = (f, dias) => {
    const d = new Date(`${f}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
};
const NOMBRE_BALDE = {
    "0": "0 sin CUIL",
    "1": "1 misma emp, ARCA con baja",
    "2": "2 misma emp, ARCA abierta",
    "3": "3 otra emp, ARCA con baja",
    "3b": "3b otra emp, ARCA abierta",
    "4": "4 sin empresa",
    "5": "5 sin relacion ARCA",
};
async function main() {
    const salidaArg = process.argv.find((a) => a.startsWith("--salida="))?.slice("--salida=".length);
    if (process.argv.some((a) => a === "--commit"))
        throw new Error("Este script es de sólo lectura: no tiene --commit.");
    const slug = process.env.TENANT_SLUG?.trim() || "demo-tenant";
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    const t0 = Date.now();
    const tenant = await Tenant.findOne({ slug }).select("_id").lean();
    if (!tenant)
        throw new Error(`No existe el tenant «${slug}».`);
    const tenantId = tenant._id;
    const hoy = hoyArgentina();
    const proyectos = await Project.find({ tenantId }).select("name contratoEmpresas releaseEmpresas").lean();
    const proyecto = new Map(proyectos.map((p) => [String(p._id), p]));
    console.log(`Proyectos del tenant: ${proyectos.length} (${Date.now() - t0} ms)`);
    // Sólo lo necesario de cada contrato abierto: la base está lejos (memoria «Atlas dev lento por volumen»).
    const abiertos = await UserProject.aggregate([
        { $match: { projectId: { $in: proyectos.map((p) => p._id) } } },
        { $unwind: { path: "$contracts", includeArrayIndex: "i" } },
        { $match: { $or: [{ "contracts.fecha_baja_contrato": null }, { "contracts.fecha_baja_contrato": "" }] } },
        {
            $project: {
                _id: 0,
                up: "$_id",
                userId: 1,
                projectId: 1,
                i: 1,
                alta: "$contracts.fecha_alta_contrato",
                empresa: "$contracts.empresaContratoId",
                empresaRelease: "$contracts.empresaReleaseId",
                contrato: "$contracts.nombre_contrato",
                estado: "$contracts.nombre_estado_empleado",
                solicitudId: "$contracts.solicitudId",
                origen: "$contracts.origen",
                origenContrato: "$contracts.origenContrato.nombre_proyecto",
                fechaCarga: "$contracts.fecha_carga",
            },
        },
    ]);
    console.log(`Contratos sin baja: ${abiertos.length} (${Date.now() - t0} ms)`);
    const [usuarios, empresas] = await Promise.all([
        User.find({ _id: { $in: [...new Set(abiertos.map((c) => String(c.userId)))].map((id) => new Types.ObjectId(id)) } }).select("firstName lastName metadata.fullName metadata.cuit").lean(),
        Company.find({}).select("razonSocial cuit").lean(),
    ]);
    const persona = new Map(usuarios.map((u) => [String(u._id), { cuil: digitos(u.metadata?.cuit), nombre: u.metadata?.fullName || `${u.firstName || ""} ${u.lastName || ""}`.trim() }]));
    const empresaPorId = new Map(empresas.map((e) => [String(e._id), { cuit: digitos(e.cuit), nombre: String(e.razonSocial || "") }]));
    const empresaPorCuit = new Map(empresas.filter((e) => digitos(e.cuit).length === 11).map((e) => [digitos(e.cuit), String(e.razonSocial || "")]));
    const cuils = [...new Set([...persona.values()].map((p) => p.cuil).filter((c) => c.length === 11))];
    const relaciones = [];
    for (let k = 0; k < cuils.length; k += 500) {
        relaciones.push(...(await RelacionLaboralArca.find({ tenantId, cuil: { $in: cuils.slice(k, k + 500) } }).select("-_id cuil empleadoraCuit fechaInicio fechaFin situacionBaja modalidadContrato").lean()));
    }
    console.log(`Relaciones de ARCA de esas personas: ${relaciones.length} (${Date.now() - t0} ms)`);
    // Por CUIL + fecha de inicio (todas las empleadoras), y por CUIL + empleadora + inicio (para la tolerancia).
    const porCuilInicio = new Map();
    const porCuilCuitInicio = new Map();
    for (const r of relaciones) {
        const ini = iso(r.fechaInicio);
        const k = `${r.cuil}|${ini}`;
        (porCuilInicio.get(k) || porCuilInicio.set(k, []).get(k)).push(r);
        porCuilCuitInicio.set(`${r.cuil}|${r.empleadoraCuit}|${ini}`, r);
    }
    const filas = { "0": [], "1": [], "2": [], "3": [], "3b": [], "4": [], "5": [] };
    const pares = new Map();
    const tolerancia = { 1: 0, 2: 0, 3: 0 };
    const toleranciaConBaja = { 1: 0, 2: 0, 3: 0 };
    for (const c of abiertos) {
        const p = persona.get(String(c.userId)) || { cuil: "", nombre: "" };
        const pr = proyecto.get(String(c.projectId));
        const alta = iso(c.alta);
        const local = c.empresa ? empresaPorId.get(String(c.empresa)) : undefined;
        const esDeRelease = !!c.empresa && (pr?.releaseEmpresas || []).some((x) => String(x) === String(c.empresa));
        const estaEnContrato = !!c.empresa && (pr?.contratoEmpresas || []).some((x) => String(x) === String(c.empresa));
        const base = {
            cuil: p.cuil,
            nombre: p.nombre,
            proyecto: pr?.name || "",
            alta,
            "empresa local": local?.nombre || (c.empresa ? `(id ${c.empresa} sin ficha)` : ""),
            "local es de release del proyecto": esDeRelease ? "sí" : "",
            "local está en contrato del proyecto": estaEnContrato ? "sí" : "",
            contrato: c.contrato || "",
            estado: c.estado || "",
            "origen del contrato": c.solicitudId ? "solicitud" : c.origen || (c.origenContrato ? `copia de ${c.origenContrato}` : "sin marca (FRAME o anterior al 10/10)"),
            "fecha carga": iso(c.fechaCarga),
            userProjectId: String(c.up),
            "índice": c.i,
        };
        if (p.cuil.length !== 11) {
            filas["0"].push({ ...base, "empresa ARCA": "", "fin ARCA": "" });
            continue;
        }
        if (!local || local.cuit.length !== 11) {
            filas["4"].push({ ...base, "empresa ARCA": "", "fin ARCA": "", motivo: !c.empresa ? "sin empresaContratoId" : "la empresa no tiene CUIT" });
            continue;
        }
        const mismas = porCuilInicio.get(`${p.cuil}|${alta}`) || [];
        const misma = mismas.find((r) => r.empleadoraCuit === local.cuit);
        const fila = (r) => ({ ...base, "empresa ARCA": empresaPorCuit.get(r.empleadoraCuit) || r.empleadoraCuit, "fin ARCA": iso(r.fechaFin), "fin ARCA ya pasó": r.fechaFin && iso(r.fechaFin) < hoy ? "sí" : "", "situación baja": r.situacionBaja || "", modalidad: r.modalidadContrato || "" });
        if (misma) {
            filas[misma.fechaFin ? "1" : "2"].push(fila(misma));
            continue;
        }
        if (mismas.length) {
            // Si hay varias de otra empleadora ese día, la que tiene baja primero (es la que interesa).
            const otra = mismas.find((r) => r.fechaFin) || mismas[0];
            filas[otra.fechaFin ? "3" : "3b"].push({ ...fila(otra), "otras relaciones ese día": mismas.length - 1 });
            if (otra.fechaFin) {
                const arca = empresaPorCuit.get(otra.empleadoraCuit) || otra.empleadoraCuit;
                const k = `${local.nombre} → ${arca}`;
                const x = pares.get(k) || { local: local.nombre, arca, cantidad: 0, localEsDeRelease: 0, localNoEstaEnContratoDelProyecto: 0 };
                x.cantidad++;
                if (esDeRelease)
                    x.localEsDeRelease++;
                if (!estaEnContrato)
                    x.localNoEstaEnContratoDelProyecto++;
                pares.set(k, x);
            }
            continue;
        }
        // Balde 5: ¿la recuperaría una tolerancia? La menor distancia con la misma persona y empleadora.
        let cerca = null;
        for (const d of [1, 2, 3]) {
            const r = porCuilCuitInicio.get(`${p.cuil}|${local.cuit}|${corrido(alta, -d)}`) || porCuilCuitInicio.get(`${p.cuil}|${local.cuit}|${corrido(alta, d)}`);
            if (r) {
                cerca = { d, r };
                break;
            }
        }
        if (cerca)
            for (const d of [1, 2, 3])
                if (cerca.d <= d) {
                    tolerancia[d]++;
                    if (cerca.r.fechaFin)
                        toleranciaConBaja[d]++;
                }
        const otrasDeLaPersona = relaciones.filter((r) => r.cuil === p.cuil).length;
        filas["5"].push({
            ...base,
            "empresa ARCA": "",
            "fin ARCA": "",
            "más cercana (misma emp, ±3 d)": cerca ? `${iso(cerca.r.fechaInicio)} (${cerca.d} d) → ${iso(cerca.r.fechaFin) || "abierta"}` : "",
            "relaciones de la persona en ARCA": otrasDeLaPersona,
        });
    }
    // ── Resumen ──
    const total = abiertos.length;
    console.log(`\n=== Contratos sin fecha de baja: ${total} (tenant ${slug}, hoy ${hoy}) ===`);
    for (const b of Object.keys(NOMBRE_BALDE))
        console.log(`  ${NOMBRE_BALDE[b].padEnd(30)} ${String(filas[b].length).padStart(5)}`);
    const b1Pasados = filas["1"].filter((f) => f["fin ARCA ya pasó"]).length;
    console.log(`\n  Balde 1: ${b1Pasados} con la baja de ARCA ya pasada (los demás terminan hoy o después).`);
    console.log(`  Balde 4: ${filas["4"].filter((f) => f.motivo === "sin empresaContratoId").length} sin empresaContratoId, ${filas["4"].filter((f) => f.motivo !== "sin empresaContratoId").length} con empresa sin CUIT.`);
    const listaPares = [...pares.values()].sort((a, b) => b.cantidad - a.cantidad);
    console.log(`\n  Balde 3 por par (empresa local → empresa ARCA):`);
    for (const x of listaPares)
        console.log(`    ${String(x.cantidad).padStart(4)}  ${x.local} → ${x.arca}   (local es de release del proyecto: ${x.localEsDeRelease}; local no está en contrato del proyecto: ${x.localNoEstaEnContratoDelProyecto})`);
    console.log(`\n  Balde 5, tolerancia (misma persona y empleadora): ±1 d recupera ${tolerancia[1]} (${toleranciaConBaja[1]} con baja en ARCA), ±2 d ${tolerancia[2]} (${toleranciaConBaja[2]}), ±3 d ${tolerancia[3]} (${toleranciaConBaja[3]}). NO aplicada.`);
    const sinNada = filas["5"].filter((f) => f["relaciones de la persona en ARCA"] === 0).length;
    console.log(`  Balde 5: ${sinNada} de ${filas["5"].length} personas no tienen NINGUNA relación en el espejo.`);
    // Orígenes por balde: ayuda a ver si un balde lo explica un camino de carga.
    console.log(`\n  Origen de los contratos por balde:`);
    for (const b of Object.keys(NOMBRE_BALDE)) {
        const cuenta = new Map();
        for (const f of filas[b])
            cuenta.set(f["origen del contrato"], (cuenta.get(f["origen del contrato"]) || 0) + 1);
        if (cuenta.size)
            console.log(`    ${NOMBRE_BALDE[b]}: ${[...cuenta].sort((a, c) => c[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
    }
    // ── Excel: una hoja por balde, más resumen y pares ──
    const libro = XLSX.utils.book_new();
    const resumen = [
        ["Balde", "Contratos"],
        ...Object.keys(NOMBRE_BALDE).map((b) => [NOMBRE_BALDE[b], filas[b].length]),
        ["Total sin baja", total],
        [],
        ["Tolerancia balde 5 (no aplicada)", "Recupera", "De ésos, con baja en ARCA"],
        ["±1 día", tolerancia[1], toleranciaConBaja[1]],
        ["±2 días", tolerancia[2], toleranciaConBaja[2]],
        ["±3 días", tolerancia[3], toleranciaConBaja[3]],
        [],
        ["Tenant", slug],
        ["Generado", new Date().toISOString()],
    ];
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(resumen), "Resumen");
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(listaPares.map((x) => ({ "empresa local": x.local, "empresa ARCA": x.arca, contratos: x.cantidad, "local es de release del proyecto": x.localEsDeRelease, "local no está en contrato del proyecto": x.localNoEstaEnContratoDelProyecto }))), "3 por par");
    for (const b of Object.keys(NOMBRE_BALDE))
        XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas[b].length ? filas[b] : [{ "(vacío)": "" }]), NOMBRE_BALDE[b].slice(0, 31));
    const salida = resolve(salidaArg || `tmp/diag-bajas-arca/alcance-bajas-arca_${hoy}.xlsx`);
    mkdirSync(resolve(salida, ".."), { recursive: true });
    XLSX.writeFile(libro, salida);
    console.log(`\nExcel: ${salida}  (${Date.now() - t0} ms)`);
}
main()
    .catch((e) => {
    console.error(e);
    process.exitCode = 1;
})
    .finally(() => mongoose.disconnect());
