import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { ImportHistory } from "../models/ImportHistory.js";
import { Types } from "mongoose";

/**
 * Ajusta los usuarios IMPORTADOS desde FRAME (los que tienen `metadata.id`):
 *   1. Les asigna el rol "Mobile-Colaborador" y, si lo tuvieran por error, les quita
 *      "Mobile-Coordinador" (sin tocar otros roles que ya tengan).
 *   2. Les setea la contraseña = su DNI (metadata.documento). El pre-save hook de
 *      models/User.ts se encarga de hashearla.
 *
 * Es idempotente: se puede correr varias veces sin efectos no deseados.
 *
 * Variables de entorno opcionales:
 *   DRY_RUN=true   -> solo muestra lo que haría, sin escribir en la base.
 *   SCOPE=last     -> (DEFAULT) solo los usuarios creados en la ÚLTIMA importación
 *                     exitosa (ImportHistory.addedUsers del run más reciente).
 *   SCOPE=all      -> TODOS los usuarios importados de FRAME (metadata.id), todos los tenants.
 */
async function assignImportedUsersRoleAndDNI() {
  const dryRun = String(process.env.DRY_RUN).toLowerCase() === "true";
  const scope = (process.env.SCOPE || "last").toLowerCase();

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

  if (dryRun) console.log("🔎 DRY_RUN activo: no se escribirá nada en la base.");
  console.log(`🎯 SCOPE=${scope}`);

  try {
    let users: Array<InstanceType<typeof User>>;

    if (scope === "all") {
      // Todos los usuarios provenientes de FRAME (tienen metadata.id) y que no sean seed.
      users = await User.find({
        "metadata.id": { $exists: true },
        email: { $nin: seedEmails },
      });
    } else {
      // Solo los creados en la última importación exitosa con usuarios nuevos.
      const latestRun = await ImportHistory.findOne({
        status: "success",
        "addedUsers.0": { $exists: true },
      }).sort({ createdAt: -1 });

      if (!latestRun) {
        console.log("ℹ️ No se encontró una importación exitosa con usuarios creados. Nada que hacer.");
        await disconnectDB();
        process.exit(0);
      }

      const emails = latestRun.addedUsers.map((u) => u.email).filter(Boolean);
      console.log(
        `📅 Última importación: ${new Date(latestRun.createdAt).toLocaleString("es-AR")} ` +
          `(tenant ${latestRun.tenantId}) — ${emails.length} usuarios creados en ese run.`,
      );

      users = await User.find({
        tenantId: latestRun.tenantId,
        email: { $in: emails, $nin: seedEmails },
      });
    }

    console.log(`📋 Se encontraron ${users.length} usuarios para procesar.`);

    // Cache de roles por tenant: el que se debe AGREGAR (Mobile-Colaborador) y el
    // que se debe QUITAR (Mobile-Coordinador, asignado por error previamente).
    // Búsqueda tolerante a guión/espacios y mayúsculas.
    const roleCache = new Map<string, { add: Types.ObjectId | null; remove: Types.ObjectId | null }>();
    const getTenantRoles = async (tenantId: Types.ObjectId) => {
      const key = tenantId.toString();
      if (roleCache.has(key)) return roleCache.get(key)!;
      const [collab, coord] = await Promise.all([
        Role.findOne({ tenantId, name: { $regex: /^mobile\s*-?\s*colaborador$/i } }),
        Role.findOne({ tenantId, name: { $regex: /^mobile\s*-?\s*coordinador$/i } }),
      ]);
      if (!collab) {
        console.warn(`⚠️ Tenant ${key}: no existe el rol "Mobile-Colaborador".`);
      }
      const value = {
        add: collab ? (collab._id as Types.ObjectId) : null,
        remove: coord ? (coord._id as Types.ObjectId) : null,
      };
      roleCache.set(key, value);
      return value;
    };

    let roleAssigned = 0;
    let passwordsUpdated = 0;
    let skipped = 0;

    for (const user of users) {
      let changed = false;
      const changes: string[] = [];

      const { add: collabId, remove: coordId } = await getTenantRoles(user.tenantId as Types.ObjectId);
      let roles = (user.roles || []).map((r) => r.toString());

      // 1a) Quitar Mobile-Coordinador si fue asignado por error.
      if (coordId && roles.includes(coordId.toString())) {
        roles = roles.filter((r) => r !== coordId.toString());
        changes.push("rol -Mobile-Coordinador");
        changed = true;
      }

      // 1b) Agregar Mobile-Colaborador (sin duplicar ni quitar otros roles).
      if (collabId && !roles.includes(collabId.toString())) {
        roles.push(collabId.toString());
        changes.push("rol +Mobile-Colaborador");
        changed = true;
        roleAssigned++;
      }

      if (changed) {
        user.roles = roles.map((r) => new Types.ObjectId(r));
      }

      // 2) Password = DNI
      const documento = user.metadata?.documento?.toString().trim();
      if (documento && documento.length >= 6) {
        user.password = documento; // el pre-save hook lo hashea
        changes.push(`password=DNI(${documento})`);
        changed = true;
        passwordsUpdated++;
      } else {
        console.warn(`⚠️ ${user.email}: sin documento válido, no se cambia la contraseña.`);
      }

      if (!changed) {
        skipped++;
        continue;
      }

      if (dryRun) {
        console.log(`📝 [DRY] ${user.email}: ${changes.join(", ")}`);
      } else {
        await user.save();
        console.log(`✅ ${user.email}: ${changes.join(", ")}`);
      }
    }

    console.log("\n✨ Proceso finalizado:");
    console.log(`   - Roles asignados: ${roleAssigned}`);
    console.log(`   - Contraseñas actualizadas: ${passwordsUpdated}`);
    console.log(`   - Sin cambios: ${skipped}`);
    if (dryRun) console.log("   (DRY_RUN: no se persistió ningún cambio)");
  } catch (error) {
    console.error("❌ Error durante el proceso:", error);
  } finally {
    await disconnectDB();
    console.log("👋 Desconectado de la base de datos.");
    process.exit(0);
  }
}

assignImportedUsersRoleAndDNI();
