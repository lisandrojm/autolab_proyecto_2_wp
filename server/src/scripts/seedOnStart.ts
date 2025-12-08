import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { Tenant } from "../models/Tenant.js";
import { Role } from "../models/Role.js";
import { EmployeeProfile } from "../models/EmployeeProfile.js";
import { VacationRequest } from "../models/VacationRequest.js";
import { HRDocument } from "../models/Document.js";
import { Order } from "../models/Order.js";
import { Notification } from "../models/Notification.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { CalendarEvent } from "../models/CalendarEvent.js";
import { RequestType } from "../models/RequestType.js";
import { OrderCategory } from "../models/OrderCategory.js";
import { FutureAction } from "../models/FutureAction.js";
import { Position } from "../models/Position.js";
import { Level } from "../models/Level.js";
import { Vacation } from "../models/Vacation.js";
import { Types } from "mongoose";
import { migrateSubcategoriesToArray } from "./migrateSubcategories.js";
import { migrateOrderCategoryImprovements } from "./migrateOrderCategoryImprovements.js";
import { seedPdfTemplates } from "./seedPdfTemplates.js";

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

async function ensureUser(params: { tenantId: Types.ObjectId; email: string; password: string; roleName: "superadmin" | "admin" | "Mobile-Coordinador" | "Mobile-Colaborador"; firstName: string; lastName: string; isActive?: boolean; positionId?: Types.ObjectId; levelId?: Types.ObjectId }) {
  const { tenantId, email, password, roleName, firstName, lastName, isActive = true, positionId, levelId } = params;

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
      positionId,
      levelId,
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
    if (positionId && String(user.positionId) !== String(positionId)) updates.positionId = positionId;
    if (levelId && String(user.levelId) !== String(levelId)) updates.levelId = levelId;
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
    // Run migrations first
    console.log("🔄 Running OrderCategory improvements migration...");
    await migrateOrderCategoryImprovements();

    console.log("🔄 Running subcategories migration...");
    await migrateSubcategoriesToArray();

    console.log(`🌱 Ensuring seed data for tenant slug: ${tenantSlug}`);

    // TENANT
    const tenant = await ensureTenant({
      name: "Demo Tenant",
      slug: tenantSlug,
    });
    const tenantId = new Types.ObjectId(tenant._id as any);
    console.log(`🏢 Tenant ready - Slug: ${tenantSlug}, ObjectId: ${String(tenantId)}`);

    // ---- ROLES ----
    const adminRole = await ensureRole(tenantId, "admin", [], "Administrador del tenant");
    const mobileCoordRole = await ensureRole(tenantId, "Mobile-Coordinador", ["mobile:access", "mobile:coordinator"], "Rol móvil (coordinador)");
    const mobileCollabRole = await ensureRole(tenantId, "Mobile-Colaborador", ["mobile:access", "mobile:collaborator"], "Rol móvil (colaborador)");
    void adminRole;
    void mobileCoordRole;
    void mobileCollabRole;

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

    // ---- USUARIOS BASE ----
    const adminUser = await ensureUser({
      tenantId,
      email: adminEmail,
      password: adminPassword,
      roleName: "admin",
      firstName: "Admin",
      lastName: "User",
      isActive: true,
      positionId: positionDirector._id as Types.ObjectId,
      levelId: levelDirectorNacional._id as Types.ObjectId,
    });
    const adminId = String(adminUser._id);
    console.log(`👤 Admin assigned: Position=${positionDirector.name}, Level=${levelDirectorNacional.name} (Position-Specific)`);

    // Colaborador móvil
    const collab = await ensureUser({
      tenantId,
      email: "colaborador@mobile.com",
      password: "colaborador123",
      roleName: "Mobile-Colaborador",
      firstName: "Juan",
      lastName: "Colaborador",
      isActive: true,
      positionId: positionEditor._id as Types.ObjectId,
      levelId: levelEditorJunior._id as Types.ObjectId,
    });
    console.log(`👤 Colaborador assigned: Position=${positionEditor.name}, Level=${levelEditorJunior.name} (Position-Specific)`);

    // Coordinador móvil
    const coord = await ensureUser({
      tenantId,
      email: "coordinador@mobile.com",
      password: "coordinador123",
      roleName: "Mobile-Coordinador",
      firstName: "María",
      lastName: "Coordinadora",
      isActive: true,
      positionId: positionProductor._id as Types.ObjectId,
      levelId: levelProductorSenior._id as Types.ObjectId,
    });
    console.log(`👤 Coordinador assigned: Position=${positionProductor.name}, Level=${levelProductorSenior.name} (Position-Specific)`);

    /* ============ SEED: MODELOS DEL NAVBAR (HR / MODELOS) ============ */
    console.log("👥 Seeding HR/Models demo data...");

    // ---- EmployeeProfile ----
    const profilesCount = await EmployeeProfile.countDocuments({ tenantId });
    if (profilesCount === 0) {
      await EmployeeProfile.create([
        {
          tenantId,
          userId: adminUser._id,
          firstName: "Admin",
          lastName: "User",
          email: adminEmail,
          phone: "+1-555-0101",
          position: "Platform Administrator",
          department: "IT",
          hireDate: new Date(2023, 0, 15),
          address: { street: "123 Tech Street", city: "San Francisco", state: "CA", country: "USA", zip: "94102" },
          vacationPolicy: { annualDays: 25, carryOverDays: 5 },
          isActive: true,
        },
        {
          tenantId,
          userId: collab._id,
          firstName: "Juan",
          lastName: "Colaborador",
          email: "colaborador@mobile.com",
          phone: "+54-11-5555-0001",
          position: "Asistente Operativo",
          department: "Mobile",
          hireDate: new Date(2023, 5, 1),
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
          position: "Coordinadora de Equipo",
          department: "Mobile",
          hireDate: new Date(2022, 8, 10),
          address: { street: "Calle Proyecto 200", city: "CABA", state: "BA", country: "AR", zip: "1001" },
          vacationPolicy: { annualDays: 22, carryOverDays: 3 },
          isActive: true,
        },
      ]);
      console.log("✅ EmployeeProfile seeded");
    } else {
      console.log("✔️ EmployeeProfile already present");
    }

    // ---- VacationRequest ----
    const vacationsCount = await VacationRequest.countDocuments({ tenantId });
    if (vacationsCount === 0) {
      await VacationRequest.create([
        // Colaborador: aprobada pasado
        {
          tenantId,
          userId: collab._id,
          startDate: new Date(2024, 0, 15),
          endDate: new Date(2024, 0, 19),
          daysRequested: 5,
          status: "approved",
          reason: "Family vacation",
          managerComment: "Approved - Enjoy your time off!",
          approvedBy: adminId,
          approvedAt: new Date(2024, 0, 5),
        },
        // Colaborador: pendiente futuro
        {
          tenantId,
          userId: collab._id,
          startDate: new Date(2025, 11, 20),
          endDate: new Date(2025, 11, 30),
          daysRequested: 11,
          status: "pending",
          reason: "Summer vacation",
        },
        // Colaborador: rechazada
        {
          tenantId,
          userId: collab._id,
          startDate: new Date(2024, 2, 1),
          endDate: new Date(2024, 2, 3),
          daysRequested: 3,
          status: "rejected",
          reason: "Personal matters",
          managerComment: "Cannot approve due to project deadline",
        },
        // Coordinadora: aprobada
        {
          tenantId,
          userId: coord._id,
          startDate: new Date(2024, 3, 15),
          endDate: new Date(2024, 3, 19),
          daysRequested: 5,
          status: "approved",
          reason: "Conference attendance",
          approvedBy: adminId,
          approvedAt: new Date(2024, 3, 1),
        },
      ]);
      console.log("✅ VacationRequest seeded");
    } else {
      console.log("✔️ VacationRequest already present");
    }

    // ---- Vacation System (Rules, Records, History) ----
    const vacationSystemCount = await Vacation.countDocuments({ tenantId });
    if (vacationSystemCount === 0) {
      await Vacation.create([
        // RULES
        {
          type: "rule",
          tenantId,
          active: true,
          data: {
            id: "rule-1",
            acumulados: 30,
            active: true,
          },
        },
        {
          type: "rule",
          tenantId,
          active: true,
          data: {
            id: "rule-2",
            limite_de_dias: 15,
            active: true,
          },
        },
        {
          type: "rule",
          tenantId,
          active: true,
          data: {
            id: "rule-3",
            rematar_vacaciones_legal: 45,
            active: true,
          },
        },
        // RECORDS
        {
          type: "record",
          tenantId,
          active: true,
          data: {
            id: "rec-1",
            userId: "usr-201",
            userName: "Juan Pérez",
            position: "Programador",
            level: "Junior",
            startDate: "2025-01-12",
            endDate: "2025-01-15",
            vacacionesRequested: true,
            licenciasRequested: true,
            dias_de_vacaciones_anuales: 15,
            balance: 30,
            vacaciones: [
              {
                id: "vac-1",
                status: "approved",
                createdAt: "2025-01-02T10:22:11",
                approvedBy: "Laura Gómez",
                approvedAt: "2025-01-03T14:00:00",
                daysRequested: 3,
              },
            ],
            comments: "Aprobado sin observaciones",
          },
        },
        {
          type: "record",
          tenantId,
          active: true,
          data: {
            id: "rec-2",
            userId: "usr-202",
            userName: "María López",
            reason: "Asuntos personales",
            startDate: "2025-02-01",
            endDate: "2025-02-05",
            daysRequested: 5,
            status: "pending",
            createdAt: "2025-01-25T09:15:00",
            dias_al_anio: 24,
            balance_a_la_fecha: 24,
          },
        },
        // HISTORY (Calendar)
        {
          type: "history",
          tenantId,
          active: true,
          data: {
            id: "vac-001",
            userId: "usr-101",
            userName: "Juan Pérez",
            periodStart: "2025-02-12",
            periodEnd: "2025-02-18",
            days: 6,
            status: "requested",
            timestamp: "2025-01-20T09:15:00",
            createdBy: "Juan Pérez",
            comments: null,
          },
        },
        {
          type: "history",
          tenantId,
          active: true,
          data: {
            id: "vac-002",
            userId: "usr-102",
            userName: "María López",
            periodStart: "2025-03-05",
            periodEnd: "2025-03-10",
            days: 5,
            status: "approved",
            timestamp: "2025-02-15T14:30:00",
            createdBy: "María López",
            comments: "Aprobado por gerencia",
          },
        },
        {
          type: "history",
          tenantId,
          active: true,
          data: {
            id: "vac-003",
            userId: "usr-103",
            userName: "Carlos Rodríguez",
            periodStart: "2025-04-01",
            periodEnd: "2025-04-07",
            days: 7,
            status: "pending",
            timestamp: "2025-03-10T10:00:00",
            createdBy: "Carlos Rodríguez",
            comments: null,
          },
        },
        {
          type: "history",
          tenantId,
          active: true,
          data: {
            id: "vac-004",
            userId: "usr-104",
            userName: "Ana Martínez",
            periodStart: "2025-05-15",
            periodEnd: "2025-05-20",
            days: 5,
            status: "rejected",
            timestamp: "2025-04-20T11:45:00",
            createdBy: "Ana Martínez",
            comments: "Rechazado por conflicto de fechas",
          },
        },
        {
          type: "history",
          tenantId,
          active: true,
          data: {
            id: "vac-005",
            userId: "usr-105",
            userName: "Luis Fernández",
            periodStart: "2025-06-10",
            periodEnd: "2025-06-17",
            days: 7,
            status: "approved",
            timestamp: "2025-05-05T09:30:00",
            createdBy: "Luis Fernández",
            comments: "Aprobado sin observaciones",
          },
        },
      ]);
      console.log("✅ Vacation system (rules, records, history) seeded");
    } else {
      console.log("✔️ Vacation system already present");
    }

    // ---- RequestTypes ----
    const requestTypesCount = await RequestType.countDocuments({ tenantId });
    if (requestTypesCount === 0) {
      await RequestType.create([
        {
          tenantId,
          name: "Vacaciones",
          key: "vacation",
          description: "Solicitud de vacaciones anuales",
          isSystem: true,
          isDeletable: false,
          isActive: true,
        },
        {
          tenantId,
          name: "Licencias especiales",
          key: "special_leave",
          description: "Licencias por motivos especiales (matrimonio, fallecimiento, etc.)",
          isSystem: true,
          isDeletable: true,
          isActive: true,
        },
        {
          tenantId,
          name: "Compensatorios",
          key: "compensatory",
          description: "Días compensatorios por horas extras",
          isSystem: true,
          isDeletable: true,
          isActive: true,
        },
        {
          tenantId,
          name: "Pedidos extraordinarios",
          key: "extra",
          description: "Otros tipos de pedidos no categorizado",
          isSystem: true,
          isDeletable: true,
          isActive: true,
        },
      ]);
      console.log("✅ RequestType seeded");
    } else {
      console.log("✔️ RequestType already present");
    }

    // ---- OrderCategory ----
    const categoriesCount = await OrderCategory.countDocuments({ tenantId });
    if (categoriesCount === 0) {
      const catLicencias = await OrderCategory.create({
        tenantId,
        name: "Licencias y Permisos",
        categoryType: "fecha",
        dateMode: "range",
        isActive: true,
        sortOrder: 1,
        requiresAction: true,
        requiresSignature: true,
        actionText: "Me comprometo a presentar el certificado correspondiente",
        futureActionType: "documento",
        deadlineMode: "plazoDias",
        plazoDias: 5,
        documentoRequerido: "Certificado médico o permiso oficial",
        config: {
          subtipos: [
            { id: "licencia_medica", label: "Licencia Médica", requiere_certificado: true },
            { id: "permiso_estudio", label: "Permiso por Estudio", requiere_certificado: true },
            { id: "cuidado_familiar", label: "Cuidado Familiar", requiere_certificado: true },
            { id: "matrimonio", label: "Matrimonio", requiere_certificado: false },
          ],
        },
      });

      const catAdelantos = await OrderCategory.create({
        tenantId,
        name: "Adelantos y Anticipos",
        categoryType: "dinero",
        isActive: true,
        sortOrder: 2,
        requiresAction: true,
        requiresSignature: true,
        actionText: "Acepto el descuento en cuotas según el plazo acordado",
        tituloAccion: "Aceptar descuento en cuotas mensuales",
        futureActionType: "otra",
        deadlineMode: "none",
        config: {
          subtipos: [
            { id: "adelanto_sueldo", label: "Adelanto de Sueldo" },
            { id: "adelanto_emergencia", label: "Adelanto por Emergencia" },
          ],
        },
      });

      const catReembolsos = await OrderCategory.create({
        tenantId,
        name: "Reembolsos de Gastos",
        categoryType: "dinero",
        isActive: true,
        sortOrder: 3,
        requiresAction: true,
        actionText: "Me comprometo a presentar todos los comprobantes",
        tituloAccion: "Completar presentación de comprobantes y facturas",
        futureActionType: "otra",
        deadlineMode: "plazoDias",
        plazoDias: 15,
        config: {},
      });

      const catEquipamiento = await OrderCategory.create({
        tenantId,
        name: "Equipamiento y Materiales",
        categoryType: "objeto",
        isActive: true,
        sortOrder: 4,
        requiresAction: true,
        actionText: "Me comprometo a confirmar la recepción en buen estado",
        tituloAccion: "Confirmar recepción de equipamiento",
        futureActionType: "otra",
        deadlineMode: "plazoDias",
        plazoDias: 7,
        config: {
          subtipos: [
            { id: "tecnologia", label: "Tecnología" },
            { id: "seguridad_higiene", label: "Seguridad e Higiene" },
            { id: "oficina", label: "Materiales de Oficina" },
          ],
        },
      });

      const catSolicitudesEspeciales = await OrderCategory.create({
        tenantId,
        name: "Solicitudes Especiales",
        categoryType: "otros",
        isActive: true,
        sortOrder: 5,
        requiresAction: true,
        actionText: "Entiendo que mi solicitud será evaluada por el área correspondiente",
        tituloAccion: "Solicitud en evaluación",
        futureActionType: "otra",
        deadlineMode: "none",
        config: {},
      });

      console.log("✅ OrderCategory seeded (5 categorías representativas)");

      // ---- Order (ejemplos representativos de cada tipo) ----
      const order1 = await Order.create({
        tenantId,
        userId: collab._id,
        title: "Licencia médica por gripe",
        description: "Solicito licencia por cuadro gripal con certificado médico",
        category: "Licencias y Permisos",
        categoryId: catLicencias._id,
        subcategories: ["licencia_medica"],
        dynamicValue: { startDate: new Date(2024, 1, 5), endDate: new Date(2024, 1, 7) },
        status: "approved",
        approvedBy: adminId,
        approvedAt: new Date(2024, 1, 4),
        requestedAt: new Date(2024, 1, 3),
        actionCompleted: true,
        requiereAccionFutura: true,
        signatureStatus: "sent",
        signatureSentAt: new Date(2024, 1, 4),
      });

      const order2 = await Order.create({
        tenantId,
        userId: coord._id,
        title: "Permiso para examen universitario",
        description: "Necesito presentarme a examen final de la carrera de grado el 20 de marzo",
        category: "Licencias y Permisos",
        categoryId: catLicencias._id,
        subcategories: ["permiso_estudio"],
        dynamicValue: { startDate: new Date(2025, 2, 20), endDate: new Date(2025, 2, 20) },
        status: "pending",
        requestedAt: new Date(),
        actionCompleted: true,
        requiereAccionFutura: true,
        signatureStatus: "pending",
      });

      const order3 = await Order.create({
        tenantId,
        userId: collab._id,
        title: "Adelanto de sueldo",
        description: "Solicito adelanto de $150.000 por gastos médicos urgentes",
        category: "Adelantos y Anticipos",
        categoryId: catAdelantos._id,
        subcategories: ["adelanto_sueldo"],
        dynamicValue: 150000,
        amount: 150000,
        status: "pending",
        requestedAt: new Date(),
        actionCompleted: true,
        requiereAccionFutura: true,
        signatureStatus: "pending",
      });

      const order4 = await Order.create({
        tenantId,
        userId: coord._id,
        title: "Reembolso viáticos conferencia técnica",
        description: "Gastos de hospedaje, traslados y comidas durante conferencia en Córdoba",
        category: "Reembolsos de Gastos",
        categoryId: catReembolsos._id,
        subcategories: [],
        dynamicValue: 85000,
        amount: 85000,
        status: "approved",
        approvedBy: adminId,
        approvedAt: new Date(2024, 1, 20),
        requestedAt: new Date(2024, 1, 15),
        actionCompleted: true,
        requiereAccionFutura: true,
        signatureStatus: "not_required",
      });

      const order5 = await Order.create({
        tenantId,
        userId: collab._id,
        title: "Adelanto por emergencia familiar",
        description: "Necesito un adelanto urgente por hospitalización de familiar directo",
        category: "Adelantos y Anticipos",
        categoryId: catAdelantos._id,
        subcategories: ["adelanto_emergencia"],
        dynamicValue: 80000,
        amount: 80000,
        status: "rejected",
        requestedAt: new Date(2024, 0, 10),
        signatureStatus: "not_required",
      });

      const order6 = await Order.create({
        tenantId,
        userId: collab._id,
        title: "Notebook Lenovo ThinkPad",
        description: "Solicito notebook para trabajo remoto: Lenovo ThinkPad E14, 16GB RAM, 512GB SSD",
        category: "Equipamiento y Materiales",
        categoryId: catEquipamiento._id,
        subcategories: ["tecnologia"],
        dynamicValue: "Lenovo ThinkPad E14 Gen 4 - Intel i7 - 16GB RAM - 512GB SSD",
        status: "delivered",
        approvedBy: adminId,
        approvedAt: new Date(2024, 0, 10),
        deliveredAt: new Date(2024, 0, 15),
        requestedAt: new Date(2024, 0, 5),
        actionCompleted: true,
        requiereAccionFutura: true,
        signatureStatus: "not_required",
      });

      const order7 = await Order.create({
        tenantId,
        userId: collab._id,
        title: "Elementos de protección personal",
        description: "Necesito renovar EPP: barbijo N95, guantes de seguridad y antiparras",
        category: "Equipamiento y Materiales",
        categoryId: catEquipamiento._id,
        subcategories: ["seguridad_higiene"],
        dynamicValue: "Kit EPP completo: barbijos N95 (caja x50), guantes nitrilo (caja x100), antiparras protección UV",
        status: "pending",
        requestedAt: new Date(),
        actionCompleted: true,
        requiereAccionFutura: true,
        signatureStatus: "not_required",
      });

      const order8 = await Order.create({
        tenantId,
        userId: collab._id,
        title: "Justificación ausencia por trámite",
        description: "Tuve que realizar trámite urgente en ANSES el día 10/01. Adjunto comprobante de turno",
        category: "Solicitudes Especiales",
        categoryId: catSolicitudesEspeciales._id,
        subcategories: [],
        dynamicValue: "Trámite en ANSES - Comprobante de turno adjunto",
        status: "approved",
        approvedBy: adminId,
        approvedAt: new Date(2024, 0, 11),
        requestedAt: new Date(2024, 0, 10),
        requiresSignature: false,
        signatureStatus: "not_required",
      });

      const order9 = await Order.create({
        tenantId,
        userId: coord._id,
        title: "Solicitud cambio de horario laboral",
        description: "Por razones personales solicito cambio de horario de entrada: de 9:00 a 10:00 hs",
        category: "Solicitudes Especiales",
        categoryId: catSolicitudesEspeciales._id,
        subcategories: [],
        dynamicValue: "Propuesta: Horario de 10:00 a 19:00 hs en lugar de 9:00 a 18:00 hs",
        status: "pending",
        requestedAt: new Date(),
        actionCompleted: true,
        requiereAccionFutura: true,
        signatureStatus: "not_required",
      });

      const order10 = await Order.create({
        tenantId,
        userId: collab._id,
        title: "Licencia médica prolongada y permiso para controles",
        description: "Solicito licencia por intervención quirúrgica y permisos para controles postoperatorios posteriores",
        category: "Licencias y Permisos",
        categoryId: catLicencias._id,
        subcategories: ["licencia_medica", "permiso_tramite"],
        dynamicValue: {
          fechaDesde: new Date(2024, 2, 10),
          fechaHasta: new Date(2024, 2, 20),
          observaciones: "Cirugía programada con 3 controles postoperatorios posteriores",
        },
        status: "approved",
        approvedBy: adminId,
        approvedAt: new Date(2024, 2, 5),
        requestedAt: new Date(2024, 2, 1),
        actionCompleted: true,
        requiereAccionFutura: true,
        signatureStatus: "sent",
        signatureSentAt: new Date(2024, 2, 5),
      });

      const order11 = await Order.create({
        tenantId,
        userId: coord._id,
        title: "Adelanto de sueldo y reembolso de viáticos",
        description: "Necesito adelanto para viaje de trabajo y posterior reembolso de gastos adicionales",
        category: "Adelantos y Anticipos",
        categoryId: catAdelantos._id,
        subcategories: ["adelanto_sueldo", "adelanto_vacaciones"],
        dynamicValue: {
          montoAdelanto: 100000,
          montoReembolso: 35000,
          motivo: "Viaje urgente de trabajo a sucursal exterior",
        },
        amount: 135000,
        status: "approved",
        approvedBy: adminId,
        approvedAt: new Date(),
        requestedAt: new Date(2024, 1, 20),
        actionCompleted: true,
        requiereAccionFutura: true,
        signatureStatus: "sent",
        signatureSentAt: new Date(),
      });

      const catDocumentos = await OrderCategory.create({
        tenantId,
        name: "Documentos Pendientes",
        categoryType: "objeto",
        isActive: true,
        sortOrder: 6,
        requiresAction: true,
        actionText: "Me comprometo a presentar el documento requerido en el plazo establecido",
        futureActionType: "documento",
        deadlineMode: "plazoDias",
        plazoDias: 7,
        documentoRequerido: "Documento solicitado según el tipo de trámite",
        config: {
          subtipos: [
            { id: "dni", label: "DNI / Documento de Identidad" },
            { id: "certificado", label: "Certificado" },
            { id: "comprobante", label: "Comprobante" },
            { id: "titulo", label: "Título / Diploma" },
          ],
        },
      });

      const order12 = await Order.create({
        tenantId,
        userId: collab._id,
        title: "Fotocopia de DNI actualizado",
        description: "Necesito presentar fotocopia de DNI actualizado para legajo personal",
        category: "Documentos Pendientes",
        categoryId: catDocumentos._id,
        subcategories: ["dni"],
        dynamicValue: "DNI frente y dorso legible",
        status: "pending",
        requestedAt: new Date(),
        actionCompleted: true,
        requiereAccionFutura: true,
        signatureStatus: "not_required",
      });

      const order13 = await Order.create({
        tenantId,
        userId: coord._id,
        title: "Certificado de estudios secundarios",
        description: "Para completar legajo según nuevo requisito de RRHH",
        category: "Documentos Pendientes",
        categoryId: catDocumentos._id,
        subcategories: ["certificado"],
        dynamicValue: "Certificado analítico o constancia de título secundario",
        status: "approved",
        approvedBy: adminId,
        approvedAt: new Date(),
        requestedAt: new Date(),
        actionCompleted: true,
        requiereAccionFutura: true,
        signatureStatus: "not_required",
      });

      const order14 = await Order.create({
        tenantId,
        userId: collab._id,
        title: "Comprobante de domicilio actualizado",
        description: "Solicito actualización de domicilio, requiero presentar comprobante de no más de 3 meses",
        category: "Documentos Pendientes",
        categoryId: catDocumentos._id,
        subcategories: ["comprobante"],
        dynamicValue: "Factura de servicio (luz, gas, agua) a nombre del titular",
        status: "pending",
        requestedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        actionCompleted: true,
        requiereAccionFutura: true,
        signatureStatus: "not_required",
      });

      const order15 = await Order.create({
        tenantId,
        userId: coord._id,
        title: "Título universitario para legajo",
        description: "Presentación de título de grado para formalizar ascenso y ajuste salarial",
        category: "Documentos Pendientes",
        categoryId: catDocumentos._id,
        subcategories: ["titulo"],
        dynamicValue: "Título de Licenciatura en Administración - Universidad Nacional",
        status: "pending",
        requestedAt: new Date(),
        actionCompleted: true,
        requiereAccionFutura: true,
        signatureStatus: "not_required",
      });

      const order16 = await Order.create({
        tenantId,
        userId: collab._id,
        title: "Certificado médico preocupacional",
        description: "Certificado de apto físico para inicio de actividades según protocolo de seguridad e higiene",
        category: "Documentos Pendientes",
        categoryId: catDocumentos._id,
        subcategories: ["certificado"],
        dynamicValue: "Examen preocupacional completo con firma y sello del médico laboral",
        status: "approved",
        approvedBy: adminId,
        approvedAt: new Date(),
        requestedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        actionCompleted: true,
        requiereAccionFutura: true,
        signatureStatus: "not_required",
      });

      console.log("✅ Order seeded (16 pedidos representativos con estados variados, incluyendo 5 con documentos pendientes)");

      const futureActionsCount = await FutureAction.countDocuments({ tenantId });
      if (futureActionsCount === 0) {
        const fa1 = await FutureAction.create({
          tenantId,
          orderId: order1._id,
          requiereAccionFutura: true,
          tipoAccionFutura: "documento",
          deadlineMode: "plazoDias",
          plazoDias: 5,
          descripcionAccion: "Presentar certificado médico que justifique la ausencia por enfermedad",
          responsableAccion: "usuario",
          documentoRequerido: "Certificado médico original o escaneado",
          fechaCreacionAccion: order1.requestedAt,
          estadoAccion: "cumplida",
        });
        order1.futureActionId = fa1._id as any;
        await order1.save();

        const fa2 = await FutureAction.create({
          tenantId,
          orderId: order2._id,
          requiereAccionFutura: true,
          tipoAccionFutura: "documento",
          deadlineMode: "plazoDias",
          plazoDias: 5,
          descripcionAccion: "Presentar certificado de inscripción o constancia de examen",
          responsableAccion: "usuario",
          documentoRequerido: "Certificado de alumno regular y constancia de examen",
          fechaCreacionAccion: order2.requestedAt,
          estadoAccion: "pendiente",
        });
        order2.futureActionId = fa2._id as any;
        await order2.save();

        const limitDate3 = new Date(2025, 11, 31);
        const fa3 = await FutureAction.create({
          tenantId,
          orderId: order3._id,
          requiereAccionFutura: true,
          tipoAccionFutura: "otra",
          deadlineMode: "fechaEspecifica",
          descripcionAccion: "Aceptar descuento en cuotas mensuales según lo acordado",
          responsableAccion: "usuario",
          fechaLimite: limitDate3,
          fechaCreacionAccion: order3.requestedAt,
          estadoAccion: "pendiente",
        });
        order3.futureActionId = fa3._id as any;
        await order3.save();

        const fa4 = await FutureAction.create({
          tenantId,
          orderId: order4._id,
          requiereAccionFutura: true,
          tipoAccionFutura: "otra",
          deadlineMode: "none",
          descripcionAccion: "Comprobantes y facturas originales presentados correctamente",
          responsableAccion: "usuario",
          fechaCreacionAccion: order4.requestedAt,
          estadoAccion: "cumplida",
        });
        order4.futureActionId = fa4._id as any;
        await order4.save();

        const limitDate6 = new Date(2024, 0, 22);
        const fa6 = await FutureAction.create({
          tenantId,
          orderId: order6._id,
          requiereAccionFutura: true,
          tipoAccionFutura: "otra",
          deadlineMode: "plazoDias",
          plazoDias: 7,
          descripcionAccion: "Confirmar recepción del equipamiento en buen estado",
          responsableAccion: "usuario",
          quienDefineVencimiento: "sistema",
          fechaLimite: limitDate6,
          fechaCreacionAccion: order6.requestedAt,
          estadoAccion: "cumplida",
        });
        order6.futureActionId = fa6._id as any;
        await order6.save();

        const limitDate7 = new Date();
        limitDate7.setDate(limitDate7.getDate() + 7);
        const fa7 = await FutureAction.create({
          tenantId,
          orderId: order7._id,
          requiereAccionFutura: true,
          tipoAccionFutura: "otra",
          deadlineMode: "plazoDias",
          plazoDias: 7,
          descripcionAccion: "Confirmar recepción de los elementos de protección personal",
          responsableAccion: "usuario",
          quienDefineVencimiento: "sistema",
          fechaLimite: limitDate7,
          fechaCreacionAccion: order7.requestedAt,
          estadoAccion: "pendiente",
        });
        order7.futureActionId = fa7._id as any;
        await order7.save();

        const fa9 = await FutureAction.create({
          tenantId,
          orderId: order9._id,
          requiereAccionFutura: true,
          tipoAccionFutura: "otra",
          deadlineMode: "none",
          descripcionAccion: "El área de RRHH debe evaluar la solicitud y definir si es viable el cambio de horario",
          responsableAccion: "area_interna",
          quienDefineVencimiento: "area_interna",
          fechaCreacionAccion: order9.requestedAt,
          estadoAccion: "en_revision",
        });
        order9.futureActionId = fa9._id as any;
        await order9.save();

        const limitDate12 = new Date();
        limitDate12.setDate(limitDate12.getDate() + 2);
        const fa12 = await FutureAction.create({
          tenantId,
          orderId: order12._id,
          requiereAccionFutura: true,
          tipoAccionFutura: "documento",
          deadlineMode: "plazoDias",
          plazoDias: 2,
          descripcionAccion: "Presentar fotocopia de DNI frente y dorso legible",
          responsableAccion: "usuario",
          documentoRequerido: "DNI actualizado (frente y dorso)",
          fechaLimite: limitDate12,
          fechaCreacionAccion: order12.requestedAt,
          estadoAccion: "pendiente_documento",
        });
        order12.futureActionId = fa12._id as any;
        await order12.save();

        const limitDate13 = new Date();
        limitDate13.setDate(limitDate13.getDate() + 7);
        const fa13 = await FutureAction.create({
          tenantId,
          orderId: order13._id,
          requiereAccionFutura: true,
          tipoAccionFutura: "documento",
          deadlineMode: "plazoDias",
          plazoDias: 7,
          descripcionAccion: "Presentar certificado analítico o constancia de título secundario",
          responsableAccion: "usuario",
          documentoRequerido: "Certificado de estudios secundarios completo",
          fechaLimite: limitDate13,
          fechaCreacionAccion: order13.requestedAt,
          estadoAccion: "pendiente_documento",
        });
        order13.futureActionId = fa13._id as any;
        await order13.save();

        const limitDate14 = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
        limitDate14.setDate(limitDate14.getDate() + 7);
        const fa14 = await FutureAction.create({
          tenantId,
          orderId: order14._id,
          requiereAccionFutura: true,
          tipoAccionFutura: "documento",
          deadlineMode: "plazoDias",
          plazoDias: 7,
          descripcionAccion: "Presentar comprobante de domicilio actualizado (no mayor a 3 meses)",
          responsableAccion: "usuario",
          documentoRequerido: "Factura de servicio a nombre del titular",
          fechaLimite: limitDate14,
          fechaCreacionAccion: order14.requestedAt,
          estadoAccion: "pendiente_documento",
        });
        order14.futureActionId = fa14._id as any;
        await order14.save();

        const limitDate15 = new Date();
        limitDate15.setDate(limitDate15.getDate() + 5);
        const fa15 = await FutureAction.create({
          tenantId,
          orderId: order15._id,
          requiereAccionFutura: true,
          tipoAccionFutura: "documento",
          deadlineMode: "fechaEspecifica",
          descripcionAccion: "Presentar título universitario original o copia certificada",
          responsableAccion: "usuario",
          documentoRequerido: "Título de grado universitario",
          fechaLimite: limitDate15,
          fechaCreacionAccion: order15.requestedAt,
          estadoAccion: "pendiente_documento",
        });
        order15.futureActionId = fa15._id as any;
        await order15.save();

        const limitDate16 = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
        limitDate16.setDate(limitDate16.getDate() + 7);
        const fa16 = await FutureAction.create({
          tenantId,
          orderId: order16._id,
          requiereAccionFutura: true,
          tipoAccionFutura: "documento",
          deadlineMode: "plazoDias",
          plazoDias: 7,
          descripcionAccion: "Presentar certificado médico preocupacional firmado y sellado por médico laboral",
          responsableAccion: "usuario",
          documentoRequerido: "Certificado médico preocupacional completo",
          fechaLimite: limitDate16,
          fechaCreacionAccion: order16.requestedAt,
          estadoAccion: "documento_presentado",
          documentoUrl: "/storage/demo-tenant/documents/certificado_preocupacional_mock.pdf",
        });
        order16.futureActionId = fa16._id as any;
        await order16.save();

        console.log("✅ FutureAction seeded (12 acciones vinculadas: 7 originales + 5 documentos pendientes con estados variados)");
      } else {
        console.log("✔️ FutureAction already present");
      }
    } else {
      console.log("✔️ OrderCategory and Order already present");
    }

    // ---- Document (HRDocument) ----
    const documentsCount = await HRDocument.countDocuments({ tenantId });
    if (documentsCount === 0) {
      await HRDocument.create([
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
      console.log("✅ Document (HRDocument) seeded");
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

    // ---- ActivityLog ----
    const activityCount = await ActivityLog.countDocuments({ tenantId });
    if (activityCount === 0) {
      await ActivityLog.create([
        {
          tenantId,
          userId: collab._id,
          action: "vacation_request_created",
          description: "Created vacation request for 11 days",
          entityType: "VacationRequest",
        },
        {
          tenantId,
          userId: collab._id,
          action: "vacation_request_approved",
          description: "Vacation request approved by manager",
          entityType: "VacationRequest",
        },
        {
          tenantId,
          userId: collab._id,
          action: "order_created",
          description: "Pedido creado: Standing Desk",
          entityType: "Order",
        },
        {
          tenantId,
          userId: collab._id,
          action: "order_approved",
          description: 'Order "External Monitor" approved by manager',
          entityType: "Order",
        },
      ]);
      console.log("✅ ActivityLog seeded");
      // ---- CalendarEvent ----
      try {
        const eventsCount = await CalendarEvent.countDocuments({ tenantId });
        if (eventsCount === 0) {
          await CalendarEvent.insertMany(
            [
              {
                tenantId,
                userId: collab._id, // evento para el colaborador
                title: "Team Weekly Sync",
                description: "Weekly team status meeting",
                start: new Date(2024, 2, 18, 10, 0), // marzo (0-based)
                end: new Date(2024, 2, 18, 11, 0),
                isAllDay: false,
                visibility: "team",
                createdBy: adminUser._id,
              },
              {
                tenantId,
                userId: adminUser._id, // evento para el admin (company-wide)
                title: "All Hands Meeting",
                description: "Quarterly all hands meeting",
                start: new Date(2024, 2, 25, 14, 0),
                end: new Date(2024, 2, 25, 16, 0),
                isAllDay: false,
                visibility: "company",
                createdBy: adminUser._id,
              },
            ],
            { ordered: true }
          );
          console.log("✅ CalendarEvent seeded");
        } else {
          console.log(`✔️ CalendarEvent already present: ${eventsCount}`);
        }
      } catch (err) {
        console.error("❌ Error seeding CalendarEvent:", err);
      }
    } else {
      console.log("✔️ ActivityLog already present");
    }

    console.log("📄 Seeding PDF Templates...");
    try {
      await seedPdfTemplates(tenantId);
    } catch (err) {
      console.error("❌ Error seeding PDF templates:", err);
    }

    console.log("🎉 Seed completed successfully!");
    console.log(`👤 Admin: ${adminEmail} / ${adminPassword}`);
    console.log("📱 Mobile Colaborador: colaborador@mobile.com / colaborador123");
    console.log("📱 Mobile Coordinador: coordinador@mobile.com / coordinador123");
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
