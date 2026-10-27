import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { connectDB, disconnectDB } from "../config/db.js";
import { Tenant } from "../models/Tenant.js";
import { Project } from "../models/Project.js";
import UserProject from "../models/UserProject.js";
/**
 * EL NOMBRE ACTUAL DEL PROYECTO EN SUS VÍNCULOS (27/10/2026).
 *
 * Cada vínculo persona-proyecto (`users_&_projects`) guarda una COPIA del nombre del proyecto
 * (`nombre_proyecto`, y otra en cada `contracts[].nombre_proyecto`). La puso la importación de FRAME
 * con el centro de costo adelante («705_TOB_NOVELA_GRAFICA») y nadie la actualizó cuando se renombraron
 * los proyectos («TOB NOVELA GRAFICA»): el reporte de Novedades, sus filtros y los documentos que se
 * generan siguen mostrando el nombre viejo. Ya no hay importaciones de FRAME que la vuelvan a pisar.
 *
 * Copia `projects.name` (por `projectId`) a esos campos. EN SECO por defecto: lista qué cambiaría.
 * Con ESCRIBIR=true escribe, y antes guarda los valores viejos en un JSON (para deshacer) en
 * `server/respaldos/`.
 *
 *   TENANT_SLUG=demo-tenant npm run proyectos:nombres-en-vinculos            (en seco)
 *   TENANT_SLUG=demo-tenant ESCRIBIR=true npm run proyectos:nombres-en-vinculos
 */
async function main() {
    const slug = process.env.TENANT_SLUG?.trim();
    const escribir = String(process.env.ESCRIBIR).toLowerCase() === "true";
    if (!slug) {
        console.error("❌ Falta TENANT_SLUG=<slug>.");
        process.exit(1);
    }
    await connectDB();
    try {
        const tenant = await Tenant.findOne({ slug }).select("_id name slug").lean();
        if (!tenant)
            throw new Error(`Tenant no encontrado: ${slug}`);
        const tenantId = tenant._id;
        console.log(`🏢 ${tenant.name} (${tenant.slug}) · ${escribir ? "✍️  ESCRIBE" : "🧪 EN SECO: no escribe nada"}`);
        const proyectos = await Project.find({ tenantId }).select("_id name").lean();
        const nombrePorId = new Map(proyectos.map((p) => [String(p._id), String(p.name || "").trim()]));
        const vinculos = await UserProject.find({ projectId: { $in: proyectos.map((p) => p._id) } }).select("_id projectId nombre_proyecto contracts.nombre_proyecto").lean();
        const cambios = [];
        const porProyecto = new Map();
        for (const v of vinculos) {
            const despues = nombrePorId.get(String(v.projectId));
            if (!despues)
                continue;
            const contratosAntes = (v.contracts || []).map((c) => String(c?.nombre_proyecto ?? ""));
            if (String(v.nombre_proyecto || "") === despues && contratosAntes.every((n) => n === despues))
                continue;
            cambios.push({ _id: String(v._id), projectId: String(v.projectId), antes: String(v.nombre_proyecto || ""), contratosAntes, despues });
            const g = porProyecto.get(String(v.projectId)) || { despues, antes: new Set(), vinculos: 0 };
            g.antes.add(String(v.nombre_proyecto || "(vacío)"));
            contratosAntes.filter((n) => n && n !== despues).forEach((n) => g.antes.add(n));
            g.vinculos++;
            porProyecto.set(String(v.projectId), g);
        }
        console.log(`\n${vinculos.length} vínculos revisados · ${cambios.length} con el nombre desactualizado · ${porProyecto.size} proyectos\n`);
        for (const g of [...porProyecto.values()].sort((a, b) => a.despues.localeCompare(b.despues))) {
            console.log(`  ${[...g.antes].join(" | ")}  →  ${g.despues}   (${g.vinculos} vínculo/s)`);
        }
        if (!escribir || cambios.length === 0) {
            if (!escribir && cambios.length)
                console.log("\nPara escribir: ESCRIBIR=true (guarda antes un respaldo de los valores viejos).");
            return;
        }
        const dir = path.resolve(process.cwd(), "respaldos");
        fs.mkdirSync(dir, { recursive: true });
        const archivo = path.join(dir, `nombres-proyecto-en-vinculos-${tenant.slug}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
        fs.writeFileSync(archivo, JSON.stringify(cambios, null, 1));
        console.log(`\n💾 Respaldo de los valores viejos: ${archivo}`);
        let escritos = 0;
        for (const c of cambios) {
            const r = await UserProject.updateOne({ _id: c._id, projectId: c.projectId }, { $set: { nombre_proyecto: c.despues, "contracts.$[].nombre_proyecto": c.despues } });
            escritos += r.modifiedCount;
        }
        console.log(`✅ ${escritos} vínculo(s) actualizados.`);
    }
    finally {
        await disconnectDB();
    }
}
main().catch((e) => {
    console.error("❌", e?.message || e);
    process.exit(1);
});
