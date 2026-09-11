/**
 * Dónde se va el tiempo de `GET /users/contracts-overview`, la consulta de la pantalla de Contratos.
 *
 * Es SOLO LECTURA: no escribe nada. Reproduce las dos fases del endpoint con los mismos filtros que
 * manda la pantalla y mide cada una por separado, además del volumen de datos que mueve. Sirve para
 * saber si el problema es el barrido de memberships (fase 1), la hidratación de la página (fase 2)
 * o el tamaño del payload — que llevan a arreglos distintos.
 *
 * Correr:
 *   cd server
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/diagContractsOverview.ts
 *
 * Con TENANT_SLUG se acota a un tenant (por defecto, demo-tenant).
 */
import mongoose from "mongoose";
import { Project } from "../models/Project.js";
import UserProject from "../models/UserProject.js";
import { Tenant } from "../models/Tenant.js";
const TENANT_SLUG = process.env.TENANT_SLUG || "demo-tenant";
const ms = (t) => `${Date.now() - t} ms`;
const kb = (o) => `${(JSON.stringify(o).length / 1024).toFixed(0)} KB`;
async function main() {
    const t0 = Date.now();
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`conexión: ${ms(t0)}\n`);
    const tenant = await Tenant.findOne({ slug: TENANT_SLUG }).lean();
    if (!tenant) {
        console.log(`No existe el tenant "${TENANT_SLUG}"`);
        return;
    }
    const tProj = Date.now();
    const projects = await Project.find({ tenantId: tenant._id }).select("_id name clientId").lean();
    const projectIds = projects.map((p) => p._id);
    console.log(`proyectos del tenant: ${projects.length}  (${ms(tProj)})`);
    // --- FASE 1: el barrido que hace el endpoint en cada request.
    const tF1 = Date.now();
    const memberships = await UserProject.aggregate([
        { $match: { projectId: { $in: projectIds } } },
        {
            $project: {
                p: "$projectId",
                u: "$userId",
                r: "$nombre_rol_frame",
                c: { $map: { input: { $ifNull: ["$contracts", []] }, as: "x", in: { a: "$$x.fecha_alta_contrato", b: "$$x.fecha_baja_contrato", g: "$$x.fecha_carga", e: "$$x.nombre_estado_empleado" } } },
            },
        },
    ]);
    const msF1 = Date.now() - tF1;
    const contratos = memberships.reduce((a, m) => a + (m.c?.length || 0), 0);
    console.log(`\nFASE 1  ${msF1} ms`);
    console.log(`  memberships: ${memberships.length}`);
    console.log(`  contratos dentro: ${contratos}`);
    console.log(`  payload de la fase: ${kb(memberships)}`);
    // ¿Usa índice el $match? Sin índice utilizable, esto crece con toda la colección.
    const plan = await UserProject.collection
        .aggregate([{ $match: { projectId: { $in: projectIds } } }, { $project: { _id: 1 } }], { explain: true })
        .next()
        .catch(() => null);
    const etapa = JSON.stringify(plan?.stages?.[0]?.$cursor?.queryPlanner?.winningPlan || plan?.queryPlanner?.winningPlan || {});
    console.log(`  plan: ${/IXSCAN/.test(etapa) ? "IXSCAN (usa índice)" : /COLLSCAN/.test(etapa) ? "COLLSCAN (barre la colección entera)" : "no se pudo leer"}`);
    // --- FASE 2: la hidratación de la página, como quedó después del arreglo (ramas por índice).
    const idsPorIndice = new Map();
    memberships.forEach((m, i) => {
        const idx = i % 3; // se simulan índices variados, que es el caso real
        if (idx === 0)
            return;
        idsPorIndice.set(idx, [...(idsPorIndice.get(idx) || []), m._id]);
    });
    const ramas = [...idsPorIndice.entries()].map(([idx, lista]) => ({ case: { $in: ["$_id", lista] }, then: idx }));
    const tF2 = Date.now();
    const docs = await UserProject.aggregate([
        { $match: { _id: { $in: memberships.map((m) => m._id) } } },
        { $project: { c: { $arrayElemAt: [{ $ifNull: ["$contracts", []] }, ramas.length > 0 ? { $switch: { branches: ramas, default: 0 } } : 0] } } },
    ]);
    console.log(`\nFASE 2  ${Date.now() - tF2} ms   (${docs.length} filas hidratadas, ${ramas.length} ramas)`);
    console.log(`  payload: ${kb(docs)}`);
    console.log(`\nTOTAL medido: ${ms(t0)}`);
    console.log("\nQué mirar: si FASE 1 domina, el arreglo es que el server devuelva página + contadores");
    console.log("en vez del conjunto entero. Si domina FASE 2 o el payload, el arreglo es otro.");
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
