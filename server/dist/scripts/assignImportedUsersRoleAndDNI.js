import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
/**
 * Ajusta los usuarios IMPORTADOS desde FRAME (los que tienen `metadata.id`):
 *   1. Les asigna el rol "Mobile-Coordinador" (sin quitar otros roles que ya tengan).
 *   2. Les setea la contraseña = su DNI (metadata.documento). El pre-save hook de
 *      models/User.ts se encarga de hashearla.
 *
 * Es idempotente: se puede correr varias veces sin efectos no deseados.
 *
 * Variables de entorno opcionales:
 *   DRY_RUN=true   -> solo muestra lo que haría, sin escribir en la base.
 */
async function assignImportedUsersRoleAndDNI() {
    const dryRun = String(process.env.DRY_RUN).toLowerCase() === "true";
    console.log("🌱 Conectando a la base de datos...");
    await connectDB();
    // Emails de seed que NO se deben tocar.
    const seedEmails = [
        "superadmin@example.com",
        "user@example.com",
        "colaborador@mobile.com",
        "coordinador@mobile.com",
        process.env.SEED_ADMIN_EMAIL || "admin@demo.com",
    ];
    if (dryRun)
        console.log("🔎 DRY_RUN activo: no se escribirá nada en la base.");
    try {
        // Solo usuarios provenientes de FRAME (tienen metadata.id) y que no sean seed.
        const users = await User.find({
            "metadata.id": { $exists: true },
            email: { $nin: seedEmails },
        });
        console.log(`📋 Se encontraron ${users.length} usuarios importados para procesar.`);
        // Cache de rol "Mobile-Coordinador" por tenant (búsqueda tolerante a guión/espacios).
        const roleCache = new Map();
        const getMobileCoordRoleId = async (tenantId) => {
            const key = tenantId.toString();
            if (roleCache.has(key))
                return roleCache.get(key);
            const role = await Role.findOne({
                tenantId,
                name: { $regex: /^mobile\s*-?\s*coordinador$/i },
            });
            const id = role ? role._id : null;
            if (!role) {
                console.warn(`⚠️ Tenant ${key}: no existe el rol "Mobile-Coordinador".`);
            }
            roleCache.set(key, id);
            return id;
        };
        let roleAssigned = 0;
        let passwordsUpdated = 0;
        let skipped = 0;
        for (const user of users) {
            let changed = false;
            const changes = [];
            // 1) Rol Mobile-Coordinador (sin duplicar ni quitar otros)
            const roleId = await getMobileCoordRoleId(user.tenantId);
            if (roleId) {
                const already = (user.roles || []).some((r) => r.toString() === roleId.toString());
                if (!already) {
                    user.roles = [...(user.roles || []), roleId];
                    changes.push("rol +Mobile-Coordinador");
                    changed = true;
                    roleAssigned++;
                }
            }
            // 2) Password = DNI
            const documento = user.metadata?.documento?.toString().trim();
            if (documento && documento.length >= 6) {
                user.password = documento; // el pre-save hook lo hashea
                changes.push(`password=DNI(${documento})`);
                changed = true;
                passwordsUpdated++;
            }
            else {
                console.warn(`⚠️ ${user.email}: sin documento válido, no se cambia la contraseña.`);
            }
            if (!changed) {
                skipped++;
                continue;
            }
            if (dryRun) {
                console.log(`📝 [DRY] ${user.email}: ${changes.join(", ")}`);
            }
            else {
                await user.save();
                console.log(`✅ ${user.email}: ${changes.join(", ")}`);
            }
        }
        console.log("\n✨ Proceso finalizado:");
        console.log(`   - Roles asignados: ${roleAssigned}`);
        console.log(`   - Contraseñas actualizadas: ${passwordsUpdated}`);
        console.log(`   - Sin cambios: ${skipped}`);
        if (dryRun)
            console.log("   (DRY_RUN: no se persistió ningún cambio)");
    }
    catch (error) {
        console.error("❌ Error durante el proceso:", error);
    }
    finally {
        await disconnectDB();
        console.log("👋 Desconectado de la base de datos.");
        process.exit(0);
    }
}
assignImportedUsersRoleAndDNI();
