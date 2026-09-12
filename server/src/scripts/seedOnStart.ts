import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import { env } from "../config/env.js";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { Tenant } from "../models/Tenant.js";
import { Role } from "../models/Role.js";
import { UserProfile } from "../models/UserProfile.js";
import { Pdf } from "../models/Pdf.js";
import { Order } from "../models/Order.js";
import { Notification } from "../models/Notification.js";
import { Calendar } from "../models/Calendar.js";
import { OrderConfig } from "../models/OrderConfig.js";
import { Area } from "../models/Area.js";
import { VacationConfig } from "../models/VacationConfig.js";
import { Vacation } from "../models/Vacation.js";

import { RequestConfig } from "../models/RequestConfig.js";
import { ensureEstadosImpositivosSistema } from "../utils/estadosImpositivosSistema.js";
import { ALL_MOBILE_PERMISSIONS, MOBILE_BASE_PERMISSIONS } from "../utils/permisosMobile.js";
import { Types } from "mongoose";

/* ----------------------------- helpers ----------------------------- */

const PdfsList = [
  {
    code: "dinero" as const,
    name: "Solicitud de Dinero",
    content: `Por la presente notifico que hemos aprobado su solicitud de {{categoria}} {{subcategoria}} por el monto de {{monto}} pesos que será descontado de sus haberes normales y habituales a partir de su próxima liquidación. En el supuesto caso de disolución del vínculo laboral, por cualquier causa, autorizo a la empresa a efectuar la retención total de las sumas que adeudare por los conceptos arriba indicados, de mi liquidación final.`,
    variablesHint: "Variables: categoria, subcategoria, monto, nombreUsuario, numeroOrden",
    isActive: true,
  },
  {
    code: "fechaRango" as const,
    name: "Solicitud con Rango de Fechas",
    content: `Por la presente notifico que hemos aprobado su solicitud de {{dias}} día(s) de {{categoria}} {{subcategoria}} desde el {{fechaDesde}} hasta el {{fechaHasta}}.

Esta autorización se encuentra sujeta a las políticas internas de la empresa y deberá ser coordinada con su supervisor directo.`,
    variablesHint: "Variables: categoria, subcategoria, dias, fechaDesde, fechaHasta, fechas, fechaUnica, nombreUsuario, numeroOrden",
    isActive: true,
  },
  {
    code: "fechasMultiples" as const,
    name: "Solicitud con Fechas Múltiples",
    content: `Por la presente notifico que hemos aprobado su solicitud de {{categoria}}{{subcategoria}} para el/los día/s {{fechas}}.

Esta aprobación es válida únicamente para la fecha indicada y se encuentra sujeta a las políticas internas de la empresa.`,
    variablesHint: "Variables: categoria, subcategoria, fechas, fechaUnica, nombreUsuario, numeroOrden",
    isActive: true,
  },
  {
    code: "vacaciones" as const,
    name: "Solicitud de Vacaciones",
    content: `Por la presente notifico que hemos aprobado su solicitud de vacaciones por {{dias}} día(s), desde el {{fechaDesde}} hasta el {{fechaHasta}}.

Esta autorización se encuentra sujeta a las políticas internas de la empresa y deberá ser coordinada con su supervisor directo.`,
    variablesHint: "Variables: dias, fechaDesde, fechaHasta, nombreUsuario",
    isActive: true,
  },
  {
    code: "fechasMultiples",
    name: "Solicitud de Fechas Múltiples",
    content: "Por la presente solicito el/los día/s {{fechas}} por motivos personales.",
    variablesHint: "Variables: categoria, subcategoria, fechas, fechaUnica, nombreCompleto, numeroPedido",
    isActive: true,
  },
  {
    code: "objeto",
    name: "Solicitud de Objeto/Material",
    content: "Por medio de la presente, dejo constancia de la solicitud de entrega de: {{objeto}}.\n\nDetalle: {{descripcion}}.\n\nMe comprometo a su correcto uso y devolución si correspondiese.",
    variablesHint: "Variables: categoria, subcategoria, objeto, nombreCompleto, numeroPedido, descripcion",
    isActive: true,
  },
  {
    code: "otros",
    name: "Solicitud General (Otros)",
    content: "Solicitud General:\n\nDetalle: {{descripcion}}.\n\nAutorizado por: {{tenantName}}",
    variablesHint: "Variables: categoria, subcategoria, descripcion, nombreCompleto, numeroPedido, tenantName",
    isActive: true,
  },
];

async function ensurePdfs(tenantId: Types.ObjectId) {
  console.log(`📄 Ensuring PDF templates for tenant ${tenantId}...`);

  for (const templateData of PdfsList) {
    const existingTemplate = await Pdf.findOne({
      tenantId,
      code: templateData.code,
    });

    if (existingTemplate) {
      console.log(`  ✓ Template '${templateData.code}' already exists`);
      continue;
    }

    await Pdf.create({
      ...templateData,
      tenantId,
    });

    console.log(`  ✓ Created template '${templateData.code}'`);
  }
}

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

/*
  Los nombres de rol se ESCAPAN antes de armar el regex.

  Los del móvil llevan una barra vertical —«Mobile | Colaborador»— y en una expresión regular eso
  significa "o": sin escapar, buscar uno encontraba a cualquiera de los tres.
*/
const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function ensureRole(tenantId: Types.ObjectId, name: string, permissions: string[] = [], description = "", isDefault = false, isSystem = false) {
  let role = await Role.findOne({ tenantId, name: { $regex: new RegExp(`^${escaparRegex(name)}$`, "i") } });
  if (!role) {
    role = await Role.create({
      tenantId,
      name,
      description: description || `${name} role`,
      permissions,
      isDefault,
      isSystem,
    });
    console.log(`✅ Created role: ${name} (perms: ${permissions.length}, default: ${isDefault}, system: ${isSystem})`);
  } else {
    // Sync permissions, description and isDefault
    let hasChanges = false;

    // Check permissions
    const currentPerms = new Set(role.permissions);
    const newPerms = new Set(permissions);
    const permsChanged = currentPerms.size !== newPerms.size || [...newPerms].some((p) => !currentPerms.has(p));

    if (permsChanged) {
      role.permissions = permissions;
      hasChanges = true;
    }

    // Check description
    if (description && role.description !== description) {
      role.description = description;
      hasChanges = true;
    }

    // Check isDefault
    if (role.isDefault !== isDefault) {
      role.isDefault = isDefault;
      hasChanges = true;
    }

    // Check isSystem
    if (role.isSystem !== isSystem) {
      role.isSystem = isSystem;
      hasChanges = true;
    }

    if (hasChanges) {
      await role.save();
      console.log(`♻️ Updated role: ${name} (synced)`);
    } else {
      console.log(`✔️ Role exists: ${name}`);
    }
  }
  return role;
}

async function ensureUser(params: {
  tenantId: Types.ObjectId;
  email: string;
  password: string;
  roleNames: string[]; // Changed from roleName: string
  firstName: string;
  lastName: string;
  isActive?: boolean;
  areaId?: Types.ObjectId;
  hireDate?: Date;
  extraVacationDays?: number;
  carryOverVacationDays?: number;
  isSystem?: boolean;
}) {
  const { tenantId, email, password, roleNames, firstName, lastName, isActive = true, areaId, hireDate = new Date(), extraVacationDays = 0, carryOverVacationDays = 0, isSystem = false } = params;

  let user = await User.findOne({ tenantId, email });

  // Find all requested roles
  const regexNames = roleNames.map((n) => new RegExp(`^${escaparRegex(n)}$`, "i"));
  let wantedRoles = await Role.find({ tenantId, name: { $in: regexNames } });

  // Safety: Ensure roles exist. If not, create them (fallback for 'superadmin' or 'admin' only mostly, or standard mobile)
  // This is a bit complex if multiple missing. We assume ensureRole was called before.
  // But strictly following previous logic: "If wantedRole doesn't exist..."
  if (wantedRoles.length !== roleNames.length) {
    for (const name of roleNames) {
      if (!wantedRoles.find((r) => r.name.toLowerCase() === name.toLowerCase())) {
        const perms = name === "superadmin" ? ["*"] : [];
        const newRole = await ensureRole(tenantId, name, perms, `${name} role`);
        wantedRoles.push(newRole);
      }
    }
  }

  const wantedRoleIds = wantedRoles.map((r) => r._id);

  if (!user) {
    user = new User({
      tenantId,
      email,
      password,
      roles: wantedRoleIds,
      firstName,
      lastName,
      isActive,
      areaId,
      hireDate,
      extraVacationDays,
      carryOverVacationDays,
      isSystem,
      metadata: {
        activo: isActive,
      },
    });
    await user.save();

    await Tenant.findByIdAndUpdate(tenantId, {
      $addToSet: { userIds: user._id },
      $inc: { "usage.users.current": 1 },
    });

    console.log(`✅ ensureUser: created ${email} [${roleNames.join(", ")}]`);
  } else {
    let isModified = false;
    const userRoleIdsStr = user.roles.map((r) => r.toString());

    // Update roles if mismatch (simplistic check: if any wanted is missing or extra?)
    // User logic: "si o si debe tener por defecto...". We should ADD the wanted roles if missing,
    // but maybe not remove others if the user manually added them?
    // "seedOnStart" usually enforces state. I will enforce `wantedRoleIds`.
    const wantedIdsStr = wantedRoleIds.map((id) => id.toString());
    const rolesChanged = wantedIdsStr.length !== userRoleIdsStr.length || !wantedIdsStr.every((id) => userRoleIdsStr.includes(id));

    if (rolesChanged) {
      user.roles = wantedRoleIds; // Enforce exact seed roles
      isModified = true;
    }
    if (user.isSystem !== isSystem) {
      user.isSystem = isSystem;
      isModified = true;
    }
    if (user.firstName !== firstName) {
      user.firstName = firstName;
      isModified = true;
    }
    if (user.lastName !== lastName) {
      user.lastName = lastName;
      isModified = true;
    }
    if (typeof isActive === "boolean" && user.metadata?.activo !== isActive) {
      if (!user.metadata) user.metadata = {};
      user.metadata.activo = isActive;
      isModified = true;
    }
    if (areaId && String((user as any).areaId) !== String(areaId)) {
      (user as any).areaId = areaId;
      isModified = true;
    }
    if (hireDate && (!user.hireDate || user.hireDate.getTime() !== hireDate.getTime())) {
      user.hireDate = hireDate;
      isModified = true;
    }
    if (extraVacationDays !== undefined && user.extraVacationDays !== extraVacationDays) {
      user.extraVacationDays = extraVacationDays;
      isModified = true;
    }
    if (carryOverVacationDays !== undefined && user.carryOverVacationDays !== carryOverVacationDays) {
      user.carryOverVacationDays = carryOverVacationDays;
      isModified = true;
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.password = password; // Will be hashed by pre-save hook
      isModified = true;
    }

    if (isModified) {
      await user.save();
      console.log(`♻️ ensureUser: updated ${email}`);
    } else {
      console.log(`✔️ ensureUser: exists ${email}`);
    }
  }
  return user!;
}

async function ensureActivityLogTypes(tenantId: Types.ObjectId) {
  console.log("📋 Ensuring default Request Configurations...");
  const defaults = ["Cambios de Turno", "Compensatorios", "Enfermedad", "Vacaciones", "Sin Goce de Sueldo", "Horas Extras y Feriados", "Otros Presentes"];

  let currentOrder = 1;
  for (const name of defaults) {
    const exists = await RequestConfig.findOne({ tenantId, name });
    if (!exists) {
      await RequestConfig.create({
        tenantId,
        name,
        requiresReplacement: false,
        isActive: true,
        order: currentOrder,
      });
      console.log(`✅ Created RequestConfig: ${name}`);
    } else {
      console.log(`✔️ RequestConfig exists: ${name}`);
    }
    currentOrder++;
  }
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

    // ---- ELIMINAR ROLES NO DESEADOS DEL TENANT SUPERADMIN ----
    // Solo debe existir el rol Superadmin en Platform Administration
    // Usamos regex case-insensitive para capturar variaciones como "Admin", "admin", "USER", etc.
    const deleteResult = await Role.deleteMany({
      tenantId: superAdminTenantId,
      name: { $in: [/^admin$/i, /^user$/i, /^mobile[ |_-]*(supervisor|coordinador|colaborador)$/i, /^responsable de proyecto$/i] },
    });
    if (deleteResult.deletedCount > 0) {
      console.log(`🗑️ Deleted ${deleteResult.deletedCount} unwanted roles from Platform Administration`);
    }

    // ---- ROLES PERMITIDOS ----
    // Solo el rol Superadmin para el tenant de administración de plataforma
    await ensureRole(superAdminTenantId, "Superadmin", ["*"], "Acceso total a toda la plataforma");

    // ---- USUARIO SUPERADMIN ----
    await ensureUser({
      tenantId: superAdminTenantId,
      email: "superadmin@example.com",
      password: "superadmin123",
      roleNames: ["Superadmin"],
      firstName: "Super",
      lastName: "Admin",
      isActive: true,
      isSystem: true,
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

    // Ensure Activity Types
    await ensureActivityLogTypes(tenantId);

    // I1: Limpieza datos prueba - Eliminar solicitudes de vacaciones de María y Juan para empezar de cero
    // Primero obtenemos sus IDs (si existen) para borrar sus datos
    const userEmails = ["colaborador@mobile.com", "coordinador@mobile.com"];
    const targetUsers = await User.find({ email: { $in: userEmails }, tenantId });
    const targetUserIds = targetUsers.map((u) => u._id);

    if (targetUserIds.length > 0) {
      console.log(`🧹 Cleaning vacations for test users: ${userEmails.join(", ")}`);
      await Vacation.deleteMany({ tenantId, userId: { $in: targetUserIds } });
    }

    console.log("🧹 Note: VacationCounter is now embedded in Vacation model.");

    // ---- ROLES ----
    console.log("👥 Seeding Roles...");

    /*
      Los permisos del móvil son granulares y se comparten con `services/roleInitService.ts`, que es
      donde se definen. Antes eran dos permisos cerrados —colaborador y coordinador— y lo que cada uno
      destapaba estaba escrito en el código de la app.
    */

    // 1. Admin (Sistema) — acceso completo, la app incluida
    const adminPerms = ["client:view", "admin_clients:view", "admin_orders:view", "admin_vacations:view", "admin_activity_logs:view", "admin_areas:view", "admin_users:view", "admin_roles:view", "config_orders:view", "config_vacations:view", "config_activity_logs:view", "config_pdf_templates:view", "config_releases:view", "config_holidays:view", ...ALL_MOBILE_PERMISSIONS];
    await ensureRole(tenantId, "Admin", adminPerms, "Rol de administrador del sistema", false, true);

    /*
      2, 3 y 4. Los tres roles del móvil, que son los de sistema.

      «Responsable de Proyecto» ya no se crea: marcaba quién podía quedar a cargo de un proyecto, y eso
      hoy es un tilde en la ficha de la persona. Ver `retirarRolResponsable` en roleInitService, que
      además mueve a quien lo tenía a un rol común con los permisos de escritorio que traía.
    */
    await ensureRole(tenantId, "Mobile | Supervisor", ALL_MOBILE_PERMISSIONS, "Supervisa al equipo desde la app", false, true);
    await ensureRole(tenantId, "Mobile | Coordinador", ALL_MOBILE_PERMISSIONS, "Carga las novedades de sus áreas y turnos, y pide contrataciones", false, true);
    await ensureRole(tenantId, "Mobile | Colaborador", MOBILE_BASE_PERMISSIONS, "Sus pedidos y sus vacaciones desde la app", false, true);

    // 5. User (No sistema, por defecto) — es el rol que reciben las altas, así que tiene que abrir la app
    const userPerms = ["client:view", "admin_clients:view", "admin_orders:view", "admin_vacations:view", "admin_activity_logs:view", ...MOBILE_BASE_PERMISSIONS];
    await ensureRole(tenantId, "User", userPerms, "User role", true, false);

    console.log("✅ Roles seeded");

    // ---- AREAS ----
    console.log("🏢 Seeding Areas...");
    const areaNames = ["Editores", "Libertador", "Técnica", "Peinado y maquillaje", "Vestuario"];
    const areaMap: Record<string, Types.ObjectId> = {};

    for (const name of areaNames) {
      let area = await Area.findOne({ tenantId, name });
      if (!area) {
        area = await Area.create({
          tenantId,
          name,
          description: `Area de ${name}`,
        });
        console.log(`✅ Created Area: ${name} (ID: ${area._id})`);
      } else {
        console.log(`✔️ Area exists: ${name} (ID: ${area._id})`);
      }
      areaMap[name] = area._id as Types.ObjectId;
    }

    // ---- VACATION OVERLAP RULES (now embedded in VacationConfig) ----
    console.log("🛡️ Seeding Vacation Overlap Rules...");
    const overlapRuleAreas = ["Editores"];
    let vacConfig = await VacationConfig.findOne({ tenantId });
    if (!vacConfig) {
      vacConfig = await VacationConfig.create({
        tenantId,
        permiteArrastre: false,
        permiteFraccionadas: true,
        requiereFirma: true,
        overlaps: [],
      });
    }
    for (const name of overlapRuleAreas) {
      const areaId = areaMap[name];
      if (!areaId) continue;
      const existingOverlap = vacConfig.overlaps.find((o) => o.areaId.toString() === areaId.toString());
      const limit = 1;

      if (!existingOverlap) {
        vacConfig.overlaps.push({
          areaId,
          maxSimultaneousUsers: limit,
          description: `Regla de superposición para ${name}`,
          isActive: true,
        });
        console.log(`✅ Created Overlap Rule for ${name}: Max ${limit} users`);
      } else {
        if (existingOverlap.maxSimultaneousUsers !== limit) {
          existingOverlap.maxSimultaneousUsers = limit;
          console.log(`♻️ Updated Overlap Rule for ${name}: Max set to ${limit}`);
        } else {
          console.log(`✔️ Overlap Rule exists for ${name}`);
        }
      }
    }
    await vacConfig.save();

    // ---- USUARIOS BASE ----
    const adminUser = await ensureUser({
      tenantId,
      email: adminEmail,
      password: adminPassword,
      roleNames: ["Admin", "Mobile | Colaborador"],
      firstName: "Admin",
      lastName: "User",
      isActive: true,
      areaId: areaMap["Libertador"],
      hireDate: new Date("2019-01-01"),
      extraVacationDays: 5,
      isSystem: true,
    });
    const adminId = String(adminUser._id);
    console.log(`👤 Admin assigned: Area=Libertador`);

    const userUser = await ensureUser({
      tenantId,
      email: "user@example.com",
      password: "user123",
      roleNames: ["User", "Mobile | Colaborador"],
      firstName: "User",
      lastName: "User",
      isActive: true,
      areaId: areaMap["Técnica"],
      hireDate: new Date("2019-01-01"),
      extraVacationDays: 0,
    });
    console.log(`👤 User assigned: Area=Técnica`);

    // Colaborador móvil
    const collab = await ensureUser({
      tenantId,
      email: "colaborador@mobile.com",
      password: "colaborador123",
      roleNames: ["Mobile | Colaborador"],
      firstName: "Juan",
      lastName: "Colaborador",
      isActive: true,
      areaId: areaMap["Editores"],
      hireDate: new Date("2023-05-01"),
      extraVacationDays: 0,
    });
    console.log(`👤 Colaborador assigned: Area=Editores`);

    // Coordinador móvil
    const coord = await ensureUser({
      tenantId,
      email: "coordinador@mobile.com",
      password: "coordinador-123",
      roleNames: ["Mobile | Coordinador"],
      firstName: "María",
      lastName: "Coordinadora",
      isActive: true,
      areaId: areaMap["Técnica"],
      hireDate: new Date("2020-03-15"),
      extraVacationDays: 2,
    });
    console.log(`👤 Coordinador assigned: Area=Técnica`);

    /* ============ SEED: MODELOS DEL NAVBAR (HR / MODELOS) ============ */
    console.log("👥 Seeding HR/Models demo data...");

    // ---- UserProfile ----
    const profilesCount = await UserProfile.countDocuments({ tenantId });
    if (profilesCount === 0) {
      await UserProfile.create([
        {
          tenantId,
          userId: adminUser._id,
          firstName: "Admin",
          lastName: "User",
          email: adminEmail,
          phone: "+1-555-0101",
          position: "Director",
          department: "Libertador",
          hireDate: new Date("2019-01-01"),
          address: { street: "123 Tech Street", city: "San Francisco", state: "CA", country: "USA", zip: "94102" },
          vacationPolicy: { annualDays: 25, carryOverDays: 5 },
          isActive: true,
        },
        {
          tenantId,
          userId: userUser._id,
          firstName: "User",
          lastName: "User",
          email: "user@example.com",
          phone: "+1-555-0102",
          position: "Productor",
          department: "Técnica",
          hireDate: new Date("2019-01-01"),
          address: { street: "456 User Lane", city: "Los Angeles", state: "CA", country: "USA", zip: "90001" },
          vacationPolicy: { annualDays: 20, carryOverDays: 0 },
          isActive: true,
        },
        {
          tenantId,
          userId: collab._id,
          firstName: "Juan",
          lastName: "Colaborador",
          email: "colaborador@mobile.com",
          phone: "+54-11-5555-0001",
          position: "Editor",
          department: "Editores",
          hireDate: new Date("2023-05-01"),
          address: { street: "Av. Demo 100", city: "CABA", state: "BA", country: "AR", zip: "1000" },
          vacationPolicy: { annualDays: 20, carryOverDays: 0 },
          isActive: true,
        },
        {
          tenantId,
          userId: coord._id,
          firstName: "María",
          lastName: "Coordinadora",
          email: "coordinador@mobile.com",
          phone: "+54-11-5555-0002",
          position: "Productor",
          department: "Técnica",
          hireDate: new Date("2020-03-15"),
          address: { street: "Calle Proyecto 200", city: "CABA", state: "BA", country: "AR", zip: "1001" },
          vacationPolicy: { annualDays: 22, carryOverDays: 2 },
          isActive: true,
        },
      ]);
      console.log("✅ UserProfile seeded");
    } else {
      console.log("✔️ UserProfile already present (skipping bulk creation)");
    }

    // Ensure specific demo profiles are up to date (or created if missing)
    const demoProfiles = [
      {
        userId: adminUser._id,
        firstName: "Admin",
        lastName: "User",
        email: adminEmail,
        phone: "+1-555-0101",
        position: "Director",
        department: "Libertador",
        hireDate: new Date("2019-01-01"),
        address: { street: "123 Tech Street", city: "San Francisco", state: "CA", country: "USA", zip: "94102" },
        vacationPolicy: { annualDays: 25, carryOverDays: 5 },
        isActive: true,
      },
      {
        userId: userUser._id,
        firstName: "User",
        lastName: "User",
        email: "user@example.com",
        phone: "+1-555-0102",
        position: "Productor",
        department: "Técnica",
        hireDate: new Date("2019-01-01"),
        address: { street: "456 User Lane", city: "Los Angeles", state: "CA", country: "USA", zip: "90001" },
        vacationPolicy: { annualDays: 20, carryOverDays: 0 },
        isActive: true,
      },
      {
        userId: collab._id,
        firstName: "Juan",
        lastName: "Colaborador",
        email: "colaborador@mobile.com",
        phone: "+54-11-5555-0001",
        position: "Editor",
        department: "Editores",
        hireDate: new Date("2023-05-01"),
        address: { street: "Av. Demo 100", city: "CABA", state: "BA", country: "AR", zip: "1000" },
        vacationPolicy: { annualDays: 20, carryOverDays: 0 },
        isActive: true,
      },
      {
        userId: coord._id,
        firstName: "María",
        lastName: "Coordinadora",
        email: "coordinador@mobile.com",
        phone: "+54-11-5555-0002",
        position: "Productor",
        department: "Técnica",
        hireDate: new Date("2020-03-15"),
        address: { street: "Calle Proyecto 200", city: "CABA", state: "BA", country: "AR", zip: "1001" },
        vacationPolicy: { annualDays: 22, carryOverDays: 2 },
        isActive: true,
      },
    ];

    for (const p of demoProfiles) {
      await UserProfile.findOneAndUpdate({ tenantId, userId: p.userId }, { ...p, tenantId }, { upsert: true, new: true });
      console.log(`✅ Ensure Profile: ${p.email} (${p.department})`);
    }

    // ---- Vacation (Seeding disabled) ----
    // const VacationsLegacyCount = await Vacation.countDocuments({ tenantId });
    // if (VacationsLegacyCount === 0) { ... }

    // ---- Global Vacation Config ----
    let globalConfig = await VacationConfig.findOne({ tenantId });

    if (!globalConfig) {
      const vacationTemplate = await Pdf.findOne({ tenantId, code: "vacaciones" });

      globalConfig = await VacationConfig.create({
        tenantId,
        diasBeneficio: 0,
        permiteArrastre: false,
        permiteFraccionadas: true,
        minDiasFraccion: 7,
        requiereFirma: true,
        maxDiasGozados: 30,
        pdfId: vacationTemplate?._id.toString(), // Ensure string
      });
      console.log("✅ Global vacation config created");
    } else {
      if (!globalConfig.permiteFraccionadas) {
        globalConfig.permiteFraccionadas = true;
        if (!globalConfig.minDiasFraccion) globalConfig.minDiasFraccion = 7;
        await globalConfig.save();
        console.log("✔️ Global vacation config updated: permiteFraccionadas set to true");
      }
      console.log("✔️ Global vacation config already present");
    }

    // ---- Vacation Requests (Seeding disabled) ----
    // const VacationsCount = await Vacation.countDocuments({ tenantId });
    // if (VacationsCount === 0) {
    //   /* Logic removed */
    // } else {
    //   console.log("✔️ Vacation requests already present");
    // }

    console.log("ℹ️ Order and OrderConfig seeding skipped by user request.");

    /* Standalone OrderDocument seeding removed in favor of embedded Order documents */

    // ---- Notification ----
    const notificationsCount = await Notification.countDocuments({ tenantId });
    if (notificationsCount === 0) {
      await Notification.create([
        {
          tenantId,
          userId: collab._id,
          type: "vacation",
          title: "Vacation Request Approved",
          message: "Your vacation request for January 15-19 has been approved.",
          isRead: true,
          readAt: new Date(2024, 0, 6),
        },
        {
          tenantId,
          userId: collab._id,
          type: "order",
          title: "Order Delivered",
          message: 'Your order "Office Supplies" has been delivered.',
          isRead: true,
          readAt: new Date(2024, 0, 21),
        },
        {
          tenantId,
          userId: collab._id,
          type: "system",
          title: "Bienvenido",
          message: "Ya tenés acceso al portal de gestión.",
          isRead: false,
        },
      ]);
      console.log("✅ Notification seeded");
    } else {
      console.log("✔️ Notification already present");
    }

    // ---- Calendar ----
    try {
      const eventsCount = await Calendar.countDocuments({ tenantId });
      if (eventsCount === 0) {
        await Calendar.insertMany(
          [
            {
              tenantId,
              userId: collab._id,
              title: "Team Weekly Sync",
              description: "Weekly team status meeting",
              start: new Date(2024, 2, 18, 10, 0),
              end: new Date(2024, 2, 18, 11, 0),
              isAllDay: false,
              visibility: "team",
              createdBy: adminUser._id,
            },
            {
              tenantId,
              userId: adminUser._id,
              title: "All Hands Meeting",
              description: "Quarterly all hands meeting",
              start: new Date(2024, 2, 25, 14, 0),
              end: new Date(2024, 2, 25, 16, 0),
              isAllDay: false,
              visibility: "company",
              createdBy: adminUser._id,
            },
          ],
          { ordered: true },
        );
        console.log("✅ Calendar seeded");
      } else {
        console.log(`✔️ Calendar already present: ${eventsCount}`);
      }
    } catch (err) {
      console.error("❌ Error seeding Calendar:", err);
    }

    // ---- PDF TEMPLATES ----
    await ensurePdfs(tenantId);

    /*
      ---- ESTADOS IMPOSITIVOS (los dos, de sistema) ----

      Van en el seed y no en el ABM porque no son una preferencia de cada productora: todo contrato
      declara o un alta temprana ante ARCA o una locación de servicios. Sin ellos, el wizard no tiene
      ningún trámite que ofrecer y las altas entran sin declarar cuál es.

      `infos` no está particionada por tenant, así que esto corre una sola vez para toda la base.
    */
    const estadosSistema = await ensureEstadosImpositivosSistema();
    if (estadosSistema.creados.length > 0) console.log(`  ✓ Estados impositivos creados: ${estadosSistema.creados.join(", ")}`);
    if (estadosSistema.adoptados.length > 0) console.log(`  ✓ Estados impositivos existentes marcados como de sistema: ${estadosSistema.adoptados.join(", ")}`);
    if (estadosSistema.creados.length === 0 && estadosSistema.adoptados.length === 0) console.log("  ✓ Estados impositivos de sistema ya estaban en orden");

    // ================= REPAIR LOGIC (ALWAYS RUNS) =================
    console.log("🔧 Validating OrderCategory PDF Templates configuration...");

    const repairMap = [
      { name: "Licencias y Permisos", templateCode: "fechaRango" },
      { name: "Adelantos y Anticipos", templateCode: "dinero" },
      { name: "Reembolsos de Gastos", templateCode: "dinero" },
      { name: "Equipamiento y Materiales", templateCode: "objeto" },
      { name: "Solicitudes Especiales", templateCode: "otros" },
      { name: "Documentos Pendientes", templateCode: "objeto" },
    ];

    for (const item of repairMap) {
      // Find the category
      const category = await OrderConfig.findOne({ tenantId, name: item.name });

      if (category) {
        // Find the template
        const template = await Pdf.findOne({ tenantId, code: item.templateCode });

        if (template) {
          const currentId = category.pdfId ? category.pdfId.toString() : "";
          const targetId = template._id.toString();

          // We check if we need to update OR if we want to force a save to ensure consistency
          // The user reported that only "Editing" (saving) fixes it.
          // So we will perform a save() if the ID is missing OR just to be safe if it matches but might be "stale" (though less likely).
          // We'll prioritize fixing missing/wrong ones.

          if (currentId !== targetId) {
            console.log(`  -> 🔧 Fixing Category '${item.name}': '${currentId}' -> '${targetId}' (${item.templateCode})`);
            category.pdfId = template._id;
            await category.save();
          } else {
            // Even if it matches, we might want to ensure it's saved correctly if it was seeded raw?
            // But let's assume fixing the ID is enough.
            // If the user says "Sigue sin crearse", maybe the previous updateOne FAILED or didn't commit?
            // Logs said "Repaired".
            // Let's force a save anyway if it looks seemingly correct but maybe "broken" internally?
            // No, that's dangerous. Let's just trust that save() works better than updateOne.
            console.log(`  -> ✔️ Category '${item.name}' already has correct template '${item.templateCode}'`);
          }
        } else {
          console.warn(`  -> ⚠️ Missing Template '${item.templateCode}' for Category '${item.name}'. Cannot repair.`);
        }
      } else {
        // Category doesn't exist
      }
    }
    console.log("✅ Repair check completed.");

    console.log("✅ Seed process completed successfully!");
    console.log(`👤 Admin: ${adminEmail} / ${adminPassword}`);
    console.log("📱 Mobile Colaborador: colaborador@mobile.com / colaborador123");
    console.log("📱 Mobile Coordinador: coordinador@mobile.com / coordinador-123");
    console.log("🔐 Roles: Admin, Mobile | Supervisor y Mobile | Coordinador (las cuatro tarjetas de la app), Mobile | Colaborador (pedidos y vacaciones)");
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
