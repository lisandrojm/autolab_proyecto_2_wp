import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { Tenant } from "../models/Tenant.js";
import { Role } from "../models/Role.js";
import { Types } from "mongoose";

/* ----------------------------- helpers ----------------------------- */

async function ensureTenant({ name, slug }: { name: string; slug: string }) {
  let tenant = await Tenant.findOne({ slug });
  if (!tenant) {
    const now = new Date();
    const endOfPeriod = new Date(now);
    endOfPeriod.setMonth(endOfPeriod.getMonth() + 1);

    tenant = new Tenant({
      name,
      slug,
      company: {
        legalName: name,
        description: "Demo tenant for testing purposes",
      },
      contact: {
        firstName: "Demo",
        lastName: "Contact",
        email: "contact@demo.com",
      },
      settings: {
        timezone: "UTC",
        currency: "USD",
        language: "en",
        features: [],
      },
      subscription: {
        plan: "pro",
        status: "active",
      },
      usage: {
        users: { current: 0, limit: 100 },
        clients: { current: 0, limit: 500 },
        campaigns: { current: 0, limit: 1000 },
        storage: { usedMB: 0, limitMB: 10240 },
        apiCalls: { current: 0, limit: 100000, resetDate: endOfPeriod.toISOString() },
      },
      billing: {
        currentPeriod: {
          startDate: now,
          endDate: endOfPeriod,
          amount: 0,
          currency: "USD",
        },
        invoices: [],
        autoRenew: true,
      },
      isActive: true,
    });
    await tenant.save();
    console.log(`✅ ensureTenant: created ${name} with _id: ${tenant._id}`);
  } else {
    console.log(`✔️ ensureTenant: exists ${name} with _id: ${tenant._id}`);
  }
  return tenant;
}

async function ensureRole(tenantId: Types.ObjectId, name: string, permissions: string[] = [], description = "") {
  let role = await Role.findOne({ tenantId, name: { $regex: new RegExp(`^${name}$`, "i") } });
  if (!role) {
    role = await Role.create({
      tenantId,
      name,
      description: description || `${name} role`,
      permissions,
      isDefault: false,
    });
    console.log(`✅ Created role: ${name} (${permissions.length ? `perms: ${permissions.join(", ")}` : "sin permisos"})`);
  } else {
    // Mantenerlo minimal: solo garantizamos los permisos pedidos si cambian
    const mustUpdate = permissions.length && (role.permissions.length !== permissions.length || permissions.some((p) => !role.permissions.includes(p)));
    if (mustUpdate) {
      role.permissions = permissions;
      await role.save();
      console.log(`♻️ Updated role: ${name} (perms sync)`);
    } else {
      console.log(`✔️ Role exists: ${name}`);
    }
  }
  return role;
}

async function ensureUser(params: { tenantId: Types.ObjectId; email: string; password: string; roleName: "superadmin" | "admin" | "Mobile-Coordinador" | "Mobile-Colaborador"; firstName: string; lastName: string; isActive?: boolean }) {
  const { tenantId, email, password, roleName, firstName, lastName, isActive = true } = params;

  let user = await User.findOne({ tenantId, email });
  let wantedRole: any = await Role.findOne({ tenantId, name: { $regex: new RegExp(`^${roleName}$`, "i") } });

  // Si el rol no existe aún (por si cambian nombres), lo creamos con permisos mínimos.
  if (!wantedRole) {
    const perms = roleName === "superadmin" ? ["*"] : roleName === "admin" ? [] : []; // Mobile-Coordinador / Mobile-Colaborador sin permisos por defecto (RBAC por scopes específicos)
    wantedRole = await ensureRole(tenantId, roleName, perms, `${roleName} role`);
  }

  if (!user) {
    user = new User({
      tenantId,
      email,
      password,
      roles: [wantedRole._id],
      firstName,
      lastName,
      isActive,
    });
    await user.save();

    await Tenant.findByIdAndUpdate(tenantId, {
      $addToSet: { userIds: user._id },
      $inc: { "usage.users.current": 1 },
    });

    console.log(`✅ ensureUser: created ${email} [${roleName}]`);
  } else {
    const updates: any = {};
    const userRoles = user.roles.map((r) => r.toString());
    if (!userRoles.includes(String(wantedRole._id))) updates.roles = [wantedRole._id];
    if (user.firstName !== firstName) updates.firstName = firstName;
    if (user.lastName !== lastName) updates.lastName = lastName;
    if (typeof isActive === "boolean" && user.isActive !== isActive) updates.isActive = isActive;
    if (Object.keys(updates).length) {
      await User.updateOne({ _id: user._id }, { $set: updates });
      console.log(`♻️ ensureUser: updated ${email}`);
    } else {
      console.log(`✔️ ensureUser: exists ${email}`);
    }
  }
  return user!;
}

/* ----------------------------- seed main ---------------------------- */

export async function ensureSuperAdmin() {
  console.log("🔐 Ensuring superadmin user...");

  try {
    let superAdminTenant = await Tenant.findOne({ slug: "superadmin" });
    if (!superAdminTenant) {
      const now = new Date();
      const endOfPeriod = new Date(now);
      endOfPeriod.setMonth(endOfPeriod.getMonth() + 1);

      superAdminTenant = new Tenant({
        name: "Platform Administration",
        slug: "superadmin",
        isSystem: true,
        company: {
          legalName: "Platform Administration",
          description: "System tenant for platform administration",
        },
        contact: {
          firstName: "Super",
          lastName: "Admin",
          email: "superadmin@example.com",
        },
        settings: {
          timezone: "UTC",
          currency: "USD",
          language: "en",
          features: [],
        },
        subscription: {
          plan: "enterprise",
          status: "active",
        },
        usage: {
          users: { current: 0, limit: 999999 },
          clients: { current: 0, limit: 999999 },
          campaigns: { current: 0, limit: 999999 },
          storage: { usedMB: 0, limitMB: 999999 },
          apiCalls: {
            current: 0,
            limit: 999999,
            resetDate: endOfPeriod,
          },
        },
        billing: {
          currentPeriod: {
            startDate: now,
            endDate: endOfPeriod,
            amount: 0,
            currency: "USD",
          },
          invoices: [],
          autoRenew: true,
        },
        isActive: true,
      });
      await superAdminTenant.save();
      console.log(`✅ Created system tenant: superadmin with _id: ${superAdminTenant._id}`);
    } else {
      if (!superAdminTenant.isSystem) {
        superAdminTenant.isSystem = true;
        await superAdminTenant.save();
        console.log(`♻️ Updated existing tenant: superadmin to isSystem = true`);
      } else {
        console.log(`✔️ System tenant exists: superadmin with _id: ${superAdminTenant._id}`);
      }
    }

    const superAdminTenantId = new Types.ObjectId(superAdminTenant._id as any);

    // ---- ROLES PERMITIDOS ----
    await ensureRole(superAdminTenantId, "superadmin", ["*"], "Acceso total a toda la plataforma");
    await ensureRole(superAdminTenantId, "admin", [], "Administrador del tenant");
    await ensureRole(superAdminTenantId, "Mobile-Coordinador", [], "Rol móvil (coordinador)");
    await ensureRole(superAdminTenantId, "Mobile-Colaborador", [], "Rol móvil (colaborador)");

    // ---- USUARIO SUPERADMIN ----
    await ensureUser({
      tenantId: superAdminTenantId,
      email: "superadmin@example.com",
      password: "superadmin123",
      roleName: "superadmin",
      firstName: "Super",
      lastName: "Admin",
      isActive: true,
    });

    console.log("✅ SuperAdmin ready: superadmin@example.com / superadmin123");
    console.log("🏢 SuperAdmin tenant slug: superadmin (isSystem: true)");
    return true;
  } catch (error) {
    console.error("❌ Error ensuring superadmin:", error);
    throw error;
  }
}

export async function seedOnStart() {
  console.log("🌱 Starting seed process...");

  const tenantSlug = env.SEED_TENANT_SLUG;
  const adminEmail = env.SEED_ADMIN_EMAIL;
  const adminPassword = env.SEED_ADMIN_PASS;

  if (!tenantSlug || !adminEmail || !adminPassword) {
    console.warn("⚠️  Seed variables not fully configured, skipping seed");
    return;
  }

  try {
    console.log(`🌱 Ensuring seed data for tenant slug: ${tenantSlug}`);

    // TENANT
    const tenant = await ensureTenant({
      name: "Demo Tenant",
      slug: tenantSlug,
    });
    const tenantId = new Types.ObjectId(tenant._id as any);
    console.log(`🏢 Tenant ready - Slug: ${tenantSlug}, ObjectId: ${String(tenantId)}`);

    // ---- ROLES (solo los 4 permitidos) ----
    const adminRole = await ensureRole(tenantId, "admin", [], "Administrador del tenant");
    const mobileCoordRole = await ensureRole(tenantId, "Mobile-Coordinador", ["mobile:access", "mobile:coordinator"], "Rol móvil (coordinador)");
    const mobileCollabRole = await ensureRole(tenantId, "Mobile-Colaborador", ["mobile:access", "mobile:collaborator"], "Rol móvil (colaborador)");
    // NOTA: El rol superadmin solo existe en el tenant del sistema (ensureSuperAdmin)

    // ---- USUARIOS (solo los 3 del tenant de demo) ----
    // Admin User
    const adminUser = await ensureUser({
      tenantId,
      email: adminEmail,
      password: adminPassword,
      roleName: "admin",
      firstName: "Admin",
      lastName: "User",
      isActive: true,
    });
    void adminRole; // usado implícitamente arriba

    // Juan Colaborador (Mobile-Colaborador)
    await ensureUser({
      tenantId,
      email: "colaborador@mobile.com",
      password: "colaborador123",
      roleName: "Mobile-Colaborador",
      firstName: "Juan",
      lastName: "Colaborador",
      isActive: true,
    });
    void mobileCollabRole;

    // María Coordinadora (Mobile-Coordinador)
    await ensureUser({
      tenantId,
      email: "coordinador@mobile.com",
      password: "coordinador123",
      roleName: "Mobile-Coordinador",
      firstName: "María",
      lastName: "Coordinadora",
      isActive: true,
    });
    void mobileCoordRole;

    // ---- Nada más se crea ----
    // (Sin manager, user, client; sin clientes, proyectos, campañas, posts, assets ni HR.)

    console.log("🎉 Seed completed successfully!");
    console.log("👤 Super Admin: superadmin@example.com / superadmin123  (en tenant 'superadmin')");
    console.log(`👤 Admin: ${adminEmail} / ${adminPassword}`);
    console.log("📱 Mobile Colaborador: colaborador@mobile.com / colaborador123");
    console.log("📱 Mobile Coordinador: coordinador@mobile.com / coordinador123");
    console.log("🔐 Roles creados: admin, Mobile-Coordinador, Mobile-Colaborador (y superadmin en tenant del sistema)");
  } catch (error) {
    console.error("❌ Seed error:", error);
    throw error;
  }
}

/* --------------------------- direct execution --------------------------- */
if (import.meta.url === `file://${process.argv[1]}`) {
  connectDB()
    .then(async () => {
      // Garantizamos el superadmin global primero
      await ensureSuperAdmin();
      // Luego el seed del tenant demo
      await seedOnStart();
      await disconnectDB();
      console.log("✅ Seed process completed");
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("❌ Seed process failed:", err);
      await disconnectDB().catch(() => {});
      process.exit(1);
    });
}
