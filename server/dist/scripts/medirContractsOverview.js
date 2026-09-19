/**
 * ═══════════════════════════════════════════════════════════════════════
 * QUÉ TARDA EN `GET /users/contracts-overview` — medición, SÓLO LECTURA
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   npx tsx src/scripts/medirContractsOverview.ts <tenantId> [clientId]
 *
 * Repite las consultas del endpoint y dice cuánto tarda y cuánto pesa cada fase. No escribe nada.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { Project } from "../models/Project.js";
import { Client } from "../models/Client.js";
import { Company } from "../models/Company.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import "../models/Role.js";
import { Role } from "../models/Role.js";
const kb = (x) => Buffer.byteLength(JSON.stringify(x ?? null)) / 1024;
async function main() {
    const tenantId = process.argv[2];
    const clientId = process.argv[3];
    if (!tenantId) {
        console.error("Uso: npx tsx src/scripts/medirContractsOverview.ts <tenantId> [clientId]");
        process.exit(1);
    }
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    await Project.findOne({}).select("_id").lean().exec(); // calentar el pool
    const projectFilter = { tenantId: new Types.ObjectId(tenantId) };
    if (clientId)
        projectFilter.clientId = new Types.ObjectId(clientId);
    let t = Date.now();
    const projectsList = await Project.find(projectFilter).select("_id name clientId contratoEmpresas releaseEmpresas").lean();
    console.log(`Project.find                       ${String(Date.now() - t).padStart(6)} ms  ${kb(projectsList).toFixed(1).padStart(8)} KB   ${projectsList.length} proyectos`);
    const projectIds = projectsList.map((p) => p._id);
    if (projectIds.length === 0) {
        console.log("Sin proyectos.");
        await mongoose.disconnect();
        return;
    }
    t = Date.now();
    const companies = await Company.find({}).select("razonSocial").lean();
    console.log(`Company.find                       ${String(Date.now() - t).padStart(6)} ms  ${kb(companies).toFixed(1).padStart(8)} KB   ${companies.length} empresas`);
    // FASE 1 — el barrido liviano, SIN filtros (que es como lo pide la pantalla al abrirse).
    t = Date.now();
    const membershipsRaw = await UserProject.aggregate([
        { $match: { projectId: { $in: projectIds } } },
        { $project: { p: "$projectId", u: "$userId", r: "$nombre_rol_frame", c: { $map: { input: { $ifNull: ["$contracts", []] }, as: "x", in: { a: "$$x.fecha_alta_contrato", b: "$$x.fecha_baja_contrato", g: "$$x.fecha_carga" } } } } },
    ]);
    const msF1 = Date.now() - t;
    const totalContratos = membershipsRaw.reduce((s, m) => s + (m.c?.length || 0), 0);
    console.log(`FASE 1 · UserProject.aggregate     ${String(msF1).padStart(6)} ms  ${kb(membershipsRaw).toFixed(1).padStart(8)} KB   ${membershipsRaw.length} vínculos, ${totalContratos} contratos barridos`);
    // Cuánto pesaría el mismo barrido si se pudiera pedir sólo el que rige (una fila por vínculo).
    t = Date.now();
    const soloUltimo = await UserProject.aggregate([
        { $match: { projectId: { $in: projectIds } } },
        { $project: { p: "$projectId", u: "$userId", n: { $size: { $ifNull: ["$contracts", []] } } } },
    ]);
    console.log(`  (comparación: sin los contratos) ${String(Date.now() - t).padStart(6)} ms  ${kb(soloUltimo).toFixed(1).padStart(8)} KB`);
    const userIds = [...new Set(membershipsRaw.map((m) => String(m.u || "")))].filter((id) => Types.ObjectId.isValid(id));
    t = Date.now();
    const [usersList, clientsList] = await Promise.all([
        User.find({ _id: { $in: userIds } }).select("firstName lastName email roles metadata.activo metadata.id metadata.cuit metadata.sinCuit metadata.nombreValidadoArcaAt").populate({ path: "roles", select: "name permissions", model: Role }).lean(),
        Client.find({ _id: { $in: [...new Set(projectsList.map((p) => String(p.clientId || "")))].filter((id) => Types.ObjectId.isValid(id)) } }).select("name").lean(),
    ]);
    console.log(`User.find + Client.find            ${String(Date.now() - t).padStart(6)} ms  ${kb(usersList).toFixed(1).padStart(8)} KB   ${usersList.length} personas`);
    // FASE 2 — el contrato completo de las 25 filas de la página.
    const ids = membershipsRaw.slice(0, 25).map((m) => m._id);
    t = Date.now();
    const docs = await UserProject.aggregate([{ $match: { _id: { $in: ids } } }, { $project: { c: { $arrayElemAt: [{ $ifNull: ["$contracts", []] }, 0] } } }]);
    console.log(`FASE 2 · contrato de 25 filas      ${String(Date.now() - t).padStart(6)} ms  ${kb(docs).toFixed(1).padStart(8)} KB`);
    // Lo mismo, pero eligiendo el contrato que rige ADENTRO de Mongo (lo que ya hace la tabla de equipo).
    t = Date.now();
    const hoy = new Date().toISOString().slice(0, 10);
    const queRigen = await UserProject.aggregate([
        { $match: { projectId: { $in: projectIds } } },
        {
            $project: {
                p: "$projectId",
                u: "$userId",
                r: "$nombre_rol_frame",
                total: { $size: { $ifNull: ["$contracts", []] } },
                claves: {
                    $map: {
                        input: { $range: [0, { $size: { $ifNull: ["$contracts", []] } }] },
                        as: "i",
                        in: {
                            $let: {
                                vars: { c: { $arrayElemAt: ["$contracts", "$$i"] } },
                                in: { i: "$$i", alta: { $substrCP: [{ $ifNull: ["$$c.fecha_alta_contrato", ""] }, 0, 10] }, baja: { $substrCP: [{ $ifNull: ["$$c.fecha_baja_contrato", ""] }, 0, 10] }, carga: { $toString: { $ifNull: ["$$c.fecha_carga", ""] } } },
                            },
                        },
                    },
                },
            },
        },
        { $addFields: { vigentes: { $filter: { input: "$claves", as: "k", cond: { $and: [{ $or: [{ $eq: ["$$k.alta", ""] }, { $lte: ["$$k.alta", hoy] }] }, { $or: [{ $eq: ["$$k.baja", ""] }, { $gte: ["$$k.baja", hoy] }] }] } } } } },
        { $addFields: { elegido: { $reduce: { input: { $cond: [{ $gt: [{ $size: "$vigentes" }, 0] }, "$vigentes", "$claves"] }, initialValue: null, in: { $cond: [{ $or: [{ $eq: ["$$value", null] }, { $gte: [{ $concat: ["$$this.alta", "|", "$$this.carga"] }, { $concat: ["$$value.alta", "|", "$$value.carga"] }] }] }, "$$this", "$$value"] } } } } },
        { $project: { p: 1, u: 1, r: 1, total: 1, idx: "$elegido.i", alta: "$elegido.alta", baja: "$elegido.baja" } },
    ]);
    console.log("ALTERNATIVA - el que rige, en Mongo " + String(Date.now() - t).padStart(6) + " ms  " + kb(queRigen).toFixed(1).padStart(8) + " KB   " + queRigen.length + " filas");
    console.log(`\nVínculos con más contratos:`);
    [...membershipsRaw].sort((a, b) => (b.c?.length || 0) - (a.c?.length || 0)).slice(0, 5).forEach((m) => console.log(`  · ${m.c?.length || 0} contratos`));
    await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
