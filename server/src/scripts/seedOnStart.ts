import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import { env } from "../config/env.js";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { Tenant } from "../models/Tenant.js";
import { Role } from "../models/Role.js";
import { UserProfile } from "../models/UserProfile.js";
import { Pdf } from "../models/Pdf.js";
import { OrderDocument } from "../models/OrderDocument.js";
import { Order } from "../models/Order.js";
import { Notification } from "../models/Notification.js";
import { Calendar } from "../models/Calendar.js";
import { OrderType } from "../models/OrderType.js";
import { OrderFutureAction } from "../models/OrderFutureAction.js";
import { Position } from "../models/Position.js";
import { Area } from "../models/Area.js";
import { Level } from "../models/Level.js";
import { VacationConfig } from "../models/VacationConfig.js";
import { Vacation } from "../models/Vacation.js";

import { VacationCounter } from "../models/VacationCounter.js";
import { VacationOverlap } from "../models/VacationOverlap.js";
import { RequestType } from "../models/RequestType.js";
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
    variablesHint: "Variables: categoria, subcategoria, dias, fechaDesde, fechaHasta, nombreUsuario, numeroOrden",
    isActive: true,
  },
  {
    code: "fechaUnica" as const,
    name: "Solicitud con Fecha Única",
    content: `Por la presente notifico que hemos aprobado su solicitud de {{categoria}}{{subcategoria}} para el día {{fechaUnica}}.

Esta aprobación es válida únicamente para la fecha indicada y se encuentra sujeta a las políticas internas de la empresa.`,
    variablesHint: "Variables: categoria, subcategoria, fechaUnica, nombreUsuario, numeroOrden",
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
    code: "fechaUnica",
    name: "Solicitud de Fecha Única",
    content: "Por la presente solicito el día {{fechaUnica}} por motivos personales.",
    variablesHint: "Variables: categoria, subcategoria, fechaUnica, nombreCompleto, numeroPedido",
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

async function ensureRole(tenantId: Types.ObjectId, name: string, permissions: string[] = [], description = "", isDefault = false) {
  let role = await Role.findOne({ tenantId, name: { $regex: new RegExp(`^${name}$`, "i") } });
  if (!role) {
    role = await Role.create({
      tenantId,
      name,
      description: description || `${name} role`,
      permissions,
      isDefault,
    });
    console.log(`✅ Created role: ${name} (perms: ${permissions.length}, default: ${isDefault})`);
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
  positionId?: Types.ObjectId;
  levelId?: Types.ObjectId;
  areaId?: Types.ObjectId;
  hireDate?: Date;
  extraVacationDays?: number;
  carryOverVacationDays?: number;
}) {
  const { tenantId, email, password, roleNames, firstName, lastName, isActive = true, positionId, levelId, areaId, hireDate = new Date(), extraVacationDays = 0, carryOverVacationDays = 0 } = params;

  let user = await User.findOne({ tenantId, email });

  // Find all requested roles
  const regexNames = roleNames.map((n) => new RegExp(`^${n}$`, "i"));
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
      positionId,
      levelId,
      areaId,
      hireDate,
      extraVacationDays,
      carryOverVacationDays,
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
    if (user.firstName !== firstName) {
      user.firstName = firstName;
      isModified = true;
    }
    if (user.lastName !== lastName) {
      user.lastName = lastName;
      isModified = true;
    }
    if (typeof isActive === "boolean" && user.isActive !== isActive) {
      user.isActive = isActive;
      isModified = true;
    }
    if (positionId && String(user.positionId) !== String(positionId)) {
      user.positionId = positionId;
      isModified = true;
    }
    if (levelId && String(user.levelId) !== String(levelId)) {
      user.levelId = levelId;
      isModified = true;
    }
    if (areaId && String(user.areaId) !== String(areaId)) {
      user.areaId = areaId;
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
  console.log("📋 Ensuring default Activity Log Types...");
  const defaults = ["Cambios de Turno", "Compensatorios", "Enfermedad", "Vacaciones", "Sin Goce de Sueldo", "Horas Extras y Feriados", "Otros Presentes"];

  let currentOrder = 1;
  for (const name of defaults) {
    const exists = await RequestType.findOne({ tenantId, name });
    if (!exists) {
      await RequestType.create({
        tenantId,
        name,
        requiresReplacement: false,
        isActive: true,
        order: currentOrder,
      });
      console.log(`✅ Created RequestType: ${name}`);
    } else {
      console.log(`✔️ RequestType exists: ${name}`);
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
      name: { $in: [/^admin$/i, /^user$/i, /^Mobile-Coordinador$/i, /^Mobile-Colaborador$/i] },
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

    console.log("🧹 Cleaning vacation counters for fresh seed...");
    await VacationCounter.deleteMany({ tenantId });

    // ---- ROLES ----
    // ---- ROLES ----
    console.log("👥 Seeding Roles...");

    // 1. Admin
    const adminPerms = ["client:view", "admin_clients:view", "admin_orders:view", "admin_vacations:view", "admin_activity_logs:view", "admin_areas:view", "admin_positions:view", "admin_levels:view", "admin_users:view", "admin_roles:view", "config_orders:view", "config_vacations:view", "config_activity_logs:view", "config_pdf_templates:view", "mobile_collaborator:view"];
    await ensureRole(tenantId, "Admin", adminPerms, "Admin role", false);

    // 2. User
    const userPerms = ["client:view", "admin_clients:view", "admin_orders:view", "admin_vacations:view", "admin_activity_logs:view", "mobile_collaborator:view"];
    await ensureRole(tenantId, "User", userPerms, "User role", true);

    // 3. Mobile-Coordinador
    await ensureRole(tenantId, "Mobile-Coordinador", ["mobile_coordinator:view"], "Mobile-Coordinador role", false);

    // 4. Mobile-Colaborador
    await ensureRole(tenantId, "Mobile-Colaborador", ["mobile_collaborator:view"], "Mobile-Colaborador role", false);

    console.log("✅ Roles seeded");

    // ---- POSITIONS ----
    console.log("📋 Seeding Positions...");
    let positionDirector = await Position.findOne({ tenantId, name: "Director" });
    if (!positionDirector) {
      positionDirector = await Position.create({
        tenantId,
        name: "Director",
        description: "Responsable de la dirección estratégica y toma de decisiones",
      });
      console.log(`✅ Created Position: Director (ID: ${positionDirector._id})`);
    } else {
      console.log(`✔️ Position exists: Director (ID: ${positionDirector._id})`);
    }

    let positionProductor = await Position.findOne({ tenantId, name: "Productor" });
    if (!positionProductor) {
      positionProductor = await Position.create({
        tenantId,
        name: "Productor",
        description: "Responsable de la producción y coordinación de proyectos",
      });
      console.log(`✅ Created Position: Productor (ID: ${positionProductor._id})`);
    } else {
      console.log(`✔️ Position exists: Productor (ID: ${positionProductor._id})`);
    }

    let positionEditor = await Position.findOne({ tenantId, name: "Editor" });
    if (!positionEditor) {
      positionEditor = await Position.create({
        tenantId,
        name: "Editor",
        description: "Responsable de la edición y creación de contenido",
      });
      console.log(`✅ Created Position: Editor (ID: ${positionEditor._id})`);
    } else {
      console.log(`✔️ Position exists: Editor (ID: ${positionEditor._id})`);
    }

    // ---- LEVELS ----
    console.log("📊 Seeding Levels...");

    // NIVELES GENERALES (aplican a cualquier posición)
    console.log("📊 Creating General Levels...");
    let levelTrainee = await Level.findOne({ tenantId, name: "Trainee", type: "general" });
    if (!levelTrainee) {
      levelTrainee = await Level.create({
        tenantId,
        name: "Trainee",
        description: "Nivel inicial en formación, aprendiendo los fundamentos del rol",
        type: "general",
      });
      console.log(`✅ Created General Level: Trainee (ID: ${levelTrainee._id})`);
    } else {
      console.log(`✔️ General Level exists: Trainee (ID: ${levelTrainee._id})`);
    }

    let levelJunior = await Level.findOne({ tenantId, name: "Junior", type: "general" });
    if (!levelJunior) {
      levelJunior = await Level.create({
        tenantId,
        name: "Junior",
        description: "Nivel de experiencia inicial con autonomía básica",
        type: "general",
      });
      console.log(`✅ Created General Level: Junior (ID: ${levelJunior._id})`);
    } else {
      console.log(`✔️ General Level exists: Junior (ID: ${levelJunior._id})`);
    }

    let levelMid = await Level.findOne({ tenantId, name: "Mid", type: "general" });
    if (!levelMid) {
      levelMid = await Level.create({
        tenantId,
        name: "Mid",
        description: "Nivel de experiencia intermedio con proyectos complejos",
        type: "general",
      });
      console.log(`✅ Created General Level: Mid (ID: ${levelMid._id})`);
    } else {
      console.log(`✔️ General Level exists: Mid (ID: ${levelMid._id})`);
    }

    let levelSenior = await Level.findOne({ tenantId, name: "Senior", type: "general" });
    if (!levelSenior) {
      levelSenior = await Level.create({
        tenantId,
        name: "Senior",
        description: "Nivel de experiencia avanzado con liderazgo y mentoría",
        type: "general",
      });
      console.log(`✅ Created General Level: Senior (ID: ${levelSenior._id})`);
    } else {
      console.log(`✔️ General Level exists: Senior (ID: ${levelSenior._id})`);
    }

    // NIVELES ESPECÍFICOS POR CARGO
    console.log("📊 Creating Position-Specific Levels...");

    // Niveles específicos para Director
    let levelDirectorRegional = await Level.findOne({ tenantId, name: "Director Regional", type: "position-specific", positionId: positionDirector._id });
    if (!levelDirectorRegional) {
      levelDirectorRegional = await Level.create({
        tenantId,
        name: "Director Regional",
        description: "Director responsable de operaciones en una región específica",
        type: "position-specific",
        positionId: positionDirector._id,
      });
      console.log(`✅ Created Position-Specific Level: Director Regional for ${positionDirector.name} (ID: ${levelDirectorRegional._id})`);
    } else {
      console.log(`✔️ Position-Specific Level exists: Director Regional (ID: ${levelDirectorRegional._id})`);
    }

    let levelDirectorNacional = await Level.findOne({ tenantId, name: "Director Nacional", type: "position-specific", positionId: positionDirector._id });
    if (!levelDirectorNacional) {
      levelDirectorNacional = await Level.create({
        tenantId,
        name: "Director Nacional",
        description: "Director con alcance nacional, gestiona múltiples regiones",
        type: "position-specific",
        positionId: positionDirector._id,
      });
      console.log(`✅ Created Position-Specific Level: Director Nacional for ${positionDirector.name} (ID: ${levelDirectorNacional._id})`);
    } else {
      console.log(`✔️ Position-Specific Level exists: Director Nacional (ID: ${levelDirectorNacional._id})`);
    }

    let levelDirectorGeneral = await Level.findOne({ tenantId, name: "Director General", type: "position-specific", positionId: positionDirector._id });
    if (!levelDirectorGeneral) {
      levelDirectorGeneral = await Level.create({
        tenantId,
        name: "Director General",
        description: "Máximo nivel de dirección, responsable de toda la organización",
        type: "position-specific",
        positionId: positionDirector._id,
      });
      console.log(`✅ Created Position-Specific Level: Director General for ${positionDirector.name} (ID: ${levelDirectorGeneral._id})`);
    } else {
      console.log(`✔️ Position-Specific Level exists: Director General (ID: ${levelDirectorGeneral._id})`);
    }

    // Niveles específicos para Productor
    let levelProductorAsistente = await Level.findOne({ tenantId, name: "Productor Asistente", type: "position-specific", positionId: positionProductor._id });
    if (!levelProductorAsistente) {
      levelProductorAsistente = await Level.create({
        tenantId,
        name: "Productor Asistente",
        description: "Asiste en la producción de proyectos bajo supervisión",
        type: "position-specific",
        positionId: positionProductor._id,
      });
      console.log(`✅ Created Position-Specific Level: Productor Asistente for ${positionProductor.name} (ID: ${levelProductorAsistente._id})`);
    } else {
      console.log(`✔️ Position-Specific Level exists: Productor Asistente (ID: ${levelProductorAsistente._id})`);
    }

    let levelProductorSenior = await Level.findOne({ tenantId, name: "Productor Senior", type: "position-specific", positionId: positionProductor._id });
    if (!levelProductorSenior) {
      levelProductorSenior = await Level.create({
        tenantId,
        name: "Productor Senior",
        description: "Gestiona proyectos complejos de forma autónoma",
        type: "position-specific",
        positionId: positionProductor._id,
      });
      console.log(`✅ Created Position-Specific Level: Productor Senior for ${positionProductor.name} (ID: ${levelProductorSenior._id})`);
    } else {
      console.log(`✔️ Position-Specific Level exists: Productor Senior (ID: ${levelProductorSenior._id})`);
    }

    let levelProductorEjecutivo = await Level.findOne({ tenantId, name: "Productor Ejecutivo", type: "position-specific", positionId: positionProductor._id });
    if (!levelProductorEjecutivo) {
      levelProductorEjecutivo = await Level.create({
        tenantId,
        name: "Productor Ejecutivo",
        description: "Lidera múltiples proyectos estratégicos y coordina equipos",
        type: "position-specific",
        positionId: positionProductor._id,
      });
      console.log(`✅ Created Position-Specific Level: Productor Ejecutivo for ${positionProductor.name} (ID: ${levelProductorEjecutivo._id})`);
    } else {
      console.log(`✔️ Position-Specific Level exists: Productor Ejecutivo (ID: ${levelProductorEjecutivo._id})`);
    }

    // Niveles específicos para Editor
    let levelEditorJunior = await Level.findOne({ tenantId, name: "Editor Junior", type: "position-specific", positionId: positionEditor._id });
    if (!levelEditorJunior) {
      levelEditorJunior = await Level.create({
        tenantId,
        name: "Editor Junior",
        description: "Editor en formación, trabaja en piezas sencillas con supervisión",
        type: "position-specific",
        positionId: positionEditor._id,
      });
      console.log(`✅ Created Position-Specific Level: Editor Junior for ${positionEditor.name} (ID: ${levelEditorJunior._id})`);
    } else {
      console.log(`✔️ Position-Specific Level exists: Editor Junior (ID: ${levelEditorJunior._id})`);
    }

    let levelEditorContenido = await Level.findOne({ tenantId, name: "Editor de Contenido", type: "position-specific", positionId: positionEditor._id });
    if (!levelEditorContenido) {
      levelEditorContenido = await Level.create({
        tenantId,
        name: "Editor de Contenido",
        description: "Editor especializado en creación y edición de contenido diverso",
        type: "position-specific",
        positionId: positionEditor._id,
      });
      console.log(`✅ Created Position-Specific Level: Editor de Contenido for ${positionEditor.name} (ID: ${levelEditorContenido._id})`);
    } else {
      console.log(`✔️ Position-Specific Level exists: Editor de Contenido (ID: ${levelEditorContenido._id})`);
    }

    let levelEditorJefe = await Level.findOne({ tenantId, name: "Editor Jefe", type: "position-specific", positionId: positionEditor._id });
    if (!levelEditorJefe) {
      levelEditorJefe = await Level.create({
        tenantId,
        name: "Editor Jefe",
        description: "Lidera el equipo editorial y define estrategias de contenido",
        type: "position-specific",
        positionId: positionEditor._id,
      });
      console.log(`✅ Created Position-Specific Level: Editor Jefe for ${positionEditor.name} (ID: ${levelEditorJefe._id})`);
    } else {
      console.log(`✔️ Position-Specific Level exists: Editor Jefe (ID: ${levelEditorJefe._id})`);
    }

    console.log(`📊 Levels Summary: 4 General + 9 Position-Specific (3 per position) = 13 total`);

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

    // ---- VACATION OVERLAP RULES ----
    console.log("🛡️ Seeding Vacation Overlap Rules...");
    const overlapRuleAreas = ["Editores"];
    for (const name of overlapRuleAreas) {
      const areaId = areaMap[name];
      let rule = await VacationOverlap.findOne({ tenantId, areaId });

      const limit = 1;

      if (!rule) {
        rule = await VacationOverlap.create({
          tenantId,
          areaId,
          maxSimultaneousUsers: limit,
          description: `Regla de superposición para ${name}`,
          isActive: true,
        });
        console.log(`✅ Created Overlap Rule for ${name}: Max ${limit} users`);
      } else {
        // Ensure limit is updated for testing if needed
        if (rule.maxSimultaneousUsers !== limit) {
          rule.maxSimultaneousUsers = limit;
          await rule.save();
          console.log(`♻️ Updated Overlap Rule for ${name}: Max set to ${limit}`);
        } else {
          console.log(`✔️ Overlap Rule exists for ${name}`);
        }
      }
    }

    // ---- USUARIOS BASE ----
    const adminUser = await ensureUser({
      tenantId,
      email: adminEmail,
      password: adminPassword,
      roleNames: ["Admin", "Mobile-Colaborador"],
      firstName: "Admin",
      lastName: "User",
      isActive: true,
      positionId: positionDirector._id as Types.ObjectId,
      levelId: levelDirectorNacional._id as Types.ObjectId,
      areaId: areaMap["Libertador"],
      hireDate: new Date("2019-01-01"),
      extraVacationDays: 5,
    });
    const adminId = String(adminUser._id);
    console.log(`👤 Admin assigned: Position=${positionDirector.name}, Level=${levelDirectorNacional.name}, Area=Libertador`);

    const userUser = await ensureUser({
      tenantId,
      email: "user@example.com",
      password: "user123",
      roleNames: ["User", "Mobile-Colaborador"],
      firstName: "User",
      lastName: "User",
      isActive: true,
      positionId: positionProductor._id as Types.ObjectId,
      levelId: levelProductorEjecutivo._id as Types.ObjectId,
      areaId: areaMap["Técnica"],
      hireDate: new Date("2019-01-01"),
      extraVacationDays: 0,
    });
    console.log(`👤 User assigned: Position=${positionProductor.name}, Level=${levelProductorEjecutivo.name}, Area=Técnica`);

    // Colaborador móvil
    const collab = await ensureUser({
      tenantId,
      email: "colaborador@mobile.com",
      password: "colaborador123",
      roleNames: ["Mobile-Colaborador"],
      firstName: "Juan",
      lastName: "Colaborador",
      isActive: true,
      positionId: positionEditor._id as Types.ObjectId,
      levelId: levelEditorJunior._id as Types.ObjectId,
      areaId: areaMap["Editores"],
      hireDate: new Date("2023-05-01"),
      extraVacationDays: 0,
    });
    console.log(`👤 Colaborador assigned: Position=${positionEditor.name}, Level=${levelEditorJunior.name}, Area=Editores`);

    // Coordinador móvil
    const coord = await ensureUser({
      tenantId,
      email: "coordinador@mobile.com",
      password: "coordinador-123",
      roleNames: ["Mobile-Coordinador"],
      firstName: "María",
      lastName: "Coordinadora",
      isActive: true,
      positionId: positionProductor._id as Types.ObjectId,
      levelId: levelProductorSenior._id as Types.ObjectId,
      areaId: areaMap["Técnica"],
      hireDate: new Date("2020-03-15"),
      extraVacationDays: 2,
    });
    console.log(`👤 Coordinador assigned: Position=${positionProductor.name}, Level=${levelProductorSenior.name}, Area=Técnica`);

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

    console.log("ℹ️ Order, OrderCategory and OrderFutureAction seeding skipped by user request.");

    // ---- Document (OrderDocument) ----
    const documentsCount = await OrderDocument.countDocuments({ tenantId });
    if (documentsCount === 0) {
      await OrderDocument.create([
        {
          tenantId,
          userId: collab._id,
          type: "contract",
          title: "Employment Contract 2023",
          description: "Initial employment contract",
          filePath: "storage/hr/documents/contract_user_2023.pdf",
          uploadedBy: adminId,
          isVisibleToEmployee: true,
        },
        {
          tenantId,
          userId: collab._id,
          type: "payroll",
          title: "Payroll Statement - February 2024",
          description: "Monthly payroll statement",
          filePath: "storage/hr/documents/payroll_user_202402.pdf",
          uploadedBy: adminId,
          isVisibleToEmployee: true,
        },
        {
          tenantId,
          userId: coord._id,
          type: "contract",
          title: "Employment Contract 2023",
          description: "Management employment contract",
          filePath: "storage/hr/documents/contract_manager_2023.pdf",
          uploadedBy: adminId,
          isVisibleToEmployee: true,
        },
      ]);
      console.log("✅ Document (OrderDocument) seeded");
    } else {
      console.log("✔️ Document already present");
    }

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
      const category = await OrderType.findOne({ tenantId, name: item.name });

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
    console.log("🔐 Roles: admin, Mobile-Coordinador (mobile:access + mobile:coordinator), Mobile-Colaborador (mobile:access + mobile:collaborator)");
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
