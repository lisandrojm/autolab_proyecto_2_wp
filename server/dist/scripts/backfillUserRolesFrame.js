import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import { Tenant } from "../models/Tenant.js";
import { User } from "../models/User.js";
import { ExternalApiService } from "../services/externalApiService.js";
import { resolveRoleFrameRefs } from "../utils/roleFrameSync.js";
/**
 * BACKFILL de users.metadata.roles_frame desde FRAME.
 *
 * Recorre los usuarios del tenant que tienen metadata.id (empleado_id de FRAME) y cuyo
 * metadata.roles_frame está vacío/inexistente, consulta sus roles_frame en FRAME
 * (GET /rol-frame/empleado/{id} — la relación empleado_rol_frame que muestra la ficha de la
 * persona en FRAME, independiente de los contratos), los mapea/crea como docs RoleFrame y los
 * guarda como refs en metadata.roles_frame (merge aditivo).
 *
 * Variables de entorno:
 *   TENANT_SLUG=<slug>   -> tenant a procesar (o TENANT_ID=<ObjectId>). REQUERIDO.
 *   DRY=true             -> (opcional) no escribe nada; solo reporta qué haría.
 *   FORCE=true           -> (opcional) reprocesa también usuarios que ya tienen roles_frame.
 *   LIMIT=<n>            -> (opcional) procesa solo los primeros N usuarios.
 *   FRAME_API_URL/USER/PASSWORD -> credenciales de FRAME (ya usadas por el sync).
 *
 * Uso: TENANT_SLUG=demo-tenant npm run backfill:roles-frame:dry
 *      TENANT_SLUG=demo-tenant npm run backfill:roles-frame
 */
async function backfillUserRolesFrame() {
    const tenantSlug = process.env.TENANT_SLUG?.trim();
    const tenantIdEnv = process.env.TENANT_ID?.trim();
    const dryRun = String(process.env.DRY).toLowerCase() === "true";
    const force = String(process.env.FORCE).toLowerCase() === "true";
    const limit = process.env.LIMIT ? Number(process.env.LIMIT) : 0;
    if (!tenantSlug && !tenantIdEnv) {
        console.error("❌ Falta TENANT_SLUG=<slug> (o TENANT_ID=<ObjectId>).");
        process.exit(1);
    }
    console.log("🌱 Conectando a la base de datos...");
    await connectDB();
    try {
        // ── Resolver tenant ────────────────────────────────────────────────
        const tenant = tenantIdEnv
            ? await Tenant.findById(tenantIdEnv).select("_id slug name")
            : await Tenant.findOne({ slug: tenantSlug }).select("_id slug name");
        if (!tenant) {
            console.error(`❌ Tenant no encontrado (${tenantSlug || tenantIdEnv}).`);
            await disconnectDB();
            process.exit(1);
        }
        const tenantId = tenant._id;
        console.log(`🏢 Tenant: ${tenant.name} (slug=${tenant.slug}, id=${tenantId})`);
        if (dryRun)
            console.log("🧪 DRY RUN: no se escribirá nada.");
        // ── FRAME ──────────────────────────────────────────────────────────
        const external = new ExternalApiService();
        console.log("🔌 Autenticando en FRAME...");
        await external.login();
        // ── Usuarios candidatos ────────────────────────────────────────────
        const filter = { tenantId, "metadata.id": { $exists: true } };
        if (!force) {
            filter.$or = [
                { "metadata.roles_frame": { $exists: false } },
                { "metadata.roles_frame": { $size: 0 } },
            ];
        }
        let users = await User.find(filter).select("_id email metadata.id metadata.roles_frame");
        if (limit > 0)
            users = users.slice(0, limit);
        console.log(`👥 ${users.length} usuario(s) a procesar (force=${force}).`);
        let processed = 0;
        let updatedUsers = 0;
        let usersWithRoles = 0;
        let usersWithoutRoles = 0;
        let totalRefs = 0;
        const createdRoleFrames = new Map(); // id -> nombre
        for (const user of users) {
            processed++;
            if (processed % 50 === 0)
                console.log(`   ...${processed}/${users.length}`);
            const empleadoId = Number(user.metadata?.id);
            if (!Number.isFinite(empleadoId))
                continue;
            const frameRoles = await external.getEmployeeRolesFrame(empleadoId);
            if (frameRoles.length === 0) {
                usersWithoutRoles++;
                continue;
            }
            usersWithRoles++;
            if (dryRun) {
                totalRefs += frameRoles.length;
                console.log(`   [DRY] ${user.email} (emp ${empleadoId}) -> ${frameRoles.map((r) => `${r.nombre}#${r.id}`).join(", ")}`);
                continue;
            }
            const { refs, created } = await resolveRoleFrameRefs(frameRoles);
            for (const c of created)
                createdRoleFrames.set(String(c.id), c.nombre);
            if (refs.length > 0) {
                await User.updateOne({ _id: user._id }, { $addToSet: { "metadata.roles_frame": { $each: refs } } });
                updatedUsers++;
                totalRefs += refs.length;
            }
        }
        console.log("\n───────────── RESUMEN ─────────────");
        console.log(`Usuarios procesados:        ${processed}`);
        console.log(`Con roles_frame en FRAME:   ${usersWithRoles}`);
        console.log(`Sin roles_frame en FRAME:   ${usersWithoutRoles}`);
        console.log(`Usuarios ${dryRun ? "a actualizar" : "actualizados"}:  ${dryRun ? usersWithRoles : updatedUsers}`);
        console.log(`Refs roles_frame ${dryRun ? "a asignar" : "asignadas"}: ${totalRefs}`);
        if (!dryRun)
            console.log(`RoleFrame creados:          ${createdRoleFrames.size}`);
        if (createdRoleFrames.size > 0) {
            console.log("RoleFrame creados (id -> nombre):");
            for (const [id, nombre] of createdRoleFrames)
                console.log(`   ${id} -> ${nombre}`);
        }
        console.log("───────────────────────────────────");
    }
    finally {
        await disconnectDB();
    }
}
backfillUserRolesFrame()
    .then(() => process.exit(0))
    .catch((err) => {
    console.error("❌ Error en backfill:", err);
    process.exit(1);
});
