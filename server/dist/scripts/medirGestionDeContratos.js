/**
 * Qué cuesta la pestaña GESTIÓN DE CONTRATOS (`?tab=management`). SÓLO LECTURA.
 *
 *   npx tsx src/scripts/medirGestionDeContratos.ts <tenantId> [projectId]
 *
 * Esa pantalla pide `contracts-overview` con `limit=5000` y los estados impositivos, sin acotar por
 * proyecto: el filtro por proyecto lo aplica después el navegador. Acá se mide lo que eso cuesta y,
 * al lado, lo que costaría pidiendo sólo el proyecto que se está mirando.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { Project } from "../models/Project.js";
import { Info } from "../models/Info.js";
import UserProject from "../models/UserProject.js";
import { User } from "../models/User.js";
import "../models/Role.js";
import { Role } from "../models/Role.js";
const kb = (x) => Buffer.byteLength(JSON.stringify(x ?? null)) / 1024;
async function main() {
    const tenantId = process.argv[2];
    const projectId = process.argv[3];
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    await Project.findOne({}).select("_id").lean().exec();
    // Sin filtrar por tenant: `infos` no siempre lo lleva, y filtrando de más el script decía «ninguno».
    const estados = await Info.find({ type: "estado-empleado" }).lean();
    const impositivos = estados.filter((e) => e.data?.esImpositivo && e.name).map((e) => e.name);
    console.log(`Estados impositivos: ${impositivos.join(", ") || "(ninguno)"}\n`);
    const medir = async (titulo, filtroProyecto) => {
        let t = Date.now();
        const projectsList = await Project.find({ tenantId: new Types.ObjectId(tenantId), ...filtroProyecto }).select("_id name clientId contratoEmpresas releaseEmpresas").lean();
        const msProyectos = Date.now() - t;
        const projectIds = projectsList.map((p) => p._id);
        t = Date.now();
        const membershipsRaw = await UserProject.aggregate([
            { $match: { projectId: { $in: projectIds } } },
            {
                $project: {
                    p: "$projectId",
                    u: "$userId",
                    r: "$nombre_rol_frame",
                    // Con `estados` el endpoint pide además el nombre del estado de cada contrato.
                    c: { $map: { input: { $ifNull: ["$contracts", []] }, as: "x", in: { a: "$$x.fecha_alta_contrato", b: "$$x.fecha_baja_contrato", g: "$$x.fecha_carga", e: "$$x.nombre_estado_empleado" } } },
                },
            },
        ]);
        const msF1 = Date.now() - t;
        const contratos = membershipsRaw.reduce((s, m) => s + (m.c?.length || 0), 0);
        const userIds = [...new Set(membershipsRaw.map((m) => String(m.u || "")))].filter((id) => Types.ObjectId.isValid(id));
        t = Date.now();
        const usersList = await User.find({ _id: { $in: userIds } })
            .select("firstName lastName email roles metadata.activo metadata.id metadata.cuit metadata.sinCuit metadata.nombreValidadoArcaAt")
            .populate({ path: "roles", select: "name permissions", model: Role })
            .lean();
        const msUsers = Date.now() - t;
        // Cuántas filas quedan en las bandejas (una fila por contrato en un estado impositivo).
        const enBandeja = membershipsRaw.reduce((s, m) => s + (m.c || []).filter((c) => impositivos.includes(String(c.e || ""))).length, 0);
        console.log(`${titulo}`);
        console.log(`  Project.find                ${String(msProyectos).padStart(6)} ms                ${projectsList.length} proyectos`);
        console.log(`  FASE 1 · aggregate          ${String(msF1).padStart(6)} ms  ${kb(membershipsRaw).toFixed(1).padStart(8)} KB   ${membershipsRaw.length} vínculos, ${contratos} contratos barridos`);
        console.log(`  User.find                   ${String(msUsers).padStart(6)} ms  ${kb(usersList).toFixed(1).padStart(8)} KB   ${usersList.length} personas`);
        console.log(`  ── subtotal                 ${String(msProyectos + msF1 + msUsers).padStart(6)} ms  ${(kb(membershipsRaw) + kb(usersList)).toFixed(1).padStart(8)} KB   → ${enBandeja} filas en las bandejas\n`);
        return enBandeja;
    };
    await medir("COMO LO PIDE HOY (todo el tenant, limit 5000)", {});
    if (projectId)
        await medir(`ACOTADO AL PROYECTO que se está mirando`, { _id: new Types.ObjectId(projectId) });
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
