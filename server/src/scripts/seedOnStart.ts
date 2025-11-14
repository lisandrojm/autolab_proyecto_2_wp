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

    // ---- ROLES ----
    const adminRole = await ensureRole(tenantId, "admin", [], "Administrador del tenant");
    const mobileCoordRole = await ensureRole(tenantId, "Mobile-Coordinador", ["mobile:access", "mobile:coordinator"], "Rol móvil (coordinador)");
    const mobileCollabRole = await ensureRole(tenantId, "Mobile-Colaborador", ["mobile:access", "mobile:collaborator"], "Rol móvil (colaborador)");
    void adminRole;
    void mobileCoordRole;
    void mobileCollabRole;

    // ---- USUARIOS BASE ----
    const adminUser = await ensureUser({
      tenantId,
      email: adminEmail,
      password: adminPassword,
      roleName: "admin",
      firstName: "Admin",
      lastName: "User",
      isActive: true,
    });
    const adminId = String(adminUser._id);

    // Colaborador móvil
    const collab = await ensureUser({
      tenantId,
      email: "colaborador@mobile.com",
      password: "colaborador123",
      roleName: "Mobile-Colaborador",
      firstName: "Juan",
      lastName: "Colaborador",
      isActive: true,
    });

    // Coordinador móvil
    const coord = await ensureUser({
      tenantId,
      email: "coordinador@mobile.com",
      password: "coordinador123",
      roleName: "Mobile-Coordinador",
      firstName: "María",
      lastName: "Coordinadora",
      isActive: true,
    });

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
      const catDias = await OrderCategory.create({
        tenantId,
        name: "Pedidos de Días",
        description: "Solicitudes de días libres, licencias y permisos especiales",
        categoryType: "fecha",
        isActive: true,
        sortOrder: 1,
        config: {
          subtipos: [
            { id: "compensatorio", label: "Día Compensatorio", requiere_certificado: false },
            { id: "mudanza", label: "Día de Mudanza", requiere_certificado: false },
            { id: "enfermedad", label: "Día por Enfermedad", requiere_certificado: true },
            { id: "maternidad", label: "Licencia por Maternidad", requiere_certificado: true },
            { id: "personal", label: "Día Personal / Administrativo", requiere_certificado: false },
          ],
        },
      });

      const catMateriales = await OrderCategory.create({
        tenantId,
        name: "Pedidos de Materiales",
        description: "Equipamiento y materiales de trabajo",
        categoryType: "objeto",
        isActive: true,
        sortOrder: 2,
        config: {
          subtipos: [
            { id: "notebook", label: "Notebook" },
            { id: "monitor", label: "Monitor" },
            { id: "mouse", label: "Mouse" },
            { id: "teclado", label: "Teclado" },
            { id: "silla", label: "Silla Ergonómica" },
            { id: "celular", label: "Celular Corporativo" },
          ],
        },
      });

      const catAdelanto = await OrderCategory.create({
        tenantId,
        name: "Adelanto de Dinero",
        description: "Solicitudes de adelantos de sueldo o gastos",
        categoryType: "dinero",
        isActive: true,
        sortOrder: 3,
        requiresAction: true,
        actionText: "Confirmo que devolveré el monto en los próximos 3 meses",
        config: {
          subtipos: [
            { id: "sueldo", label: "Adelanto de Sueldo" },
            { id: "gastos", label: "Adelanto por Gastos" },
          ],
        },
      });

      const catReembolso = await OrderCategory.create({
        tenantId,
        name: "Reembolso de Gastos",
        description: "Reembolsos por gastos realizados en nombre de la empresa",
        categoryType: "dinero",
        isActive: true,
        sortOrder: 4,
        requiresAction: true,
        actionText: "Adjunto comprobantes de los gastos realizados",
      });

      const catOtros = await OrderCategory.create({
        tenantId,
        name: "Otros Pedidos",
        description: "Pedidos generales que no entran en las categorías anteriores",
        categoryType: "otros",
        isActive: true,
        sortOrder: 5,
      });

      console.log("✅ OrderCategory seeded");

      // ---- Order (with new structure) ----
      await Order.create([
        {
          tenantId,
          userId: collab._id,
          title: "Solicitud de día por enfermedad",
          description: "Necesito el día 15 de marzo por consulta médica",
          category: "Pedidos de Días",
          categoryId: catDias._id,
          subcategoryId: "enfermedad",
          subcategoryLabel: "Día por Enfermedad",
          dynamicValue: new Date(2025, 2, 15),
          status: "pending",
        },
        {
          tenantId,
          userId: collab._id,
          title: "Notebook para trabajo remoto",
          description: "Necesito una notebook con al menos 16GB RAM y procesador i7",
          category: "Pedidos de Materiales",
          categoryId: catMateriales._id,
          subcategoryId: "notebook",
          subcategoryLabel: "Notebook",
          dynamicValue: "Lenovo ThinkPad X1 Carbon o similar",
          status: "approved",
          approvedBy: adminId,
          approvedAt: new Date(2024, 1, 10),
        },
        {
          tenantId,
          userId: collab._id,
          title: "Adelanto de sueldo urgente",
          description: "Necesito un adelanto por emergencia familiar",
          category: "Adelanto de Dinero",
          categoryId: catAdelanto._id,
          subcategoryId: "sueldo",
          subcategoryLabel: "Adelanto de Sueldo",
          dynamicValue: 50000,
          actionCompleted: true,
          status: "pending",
        },
        {
          tenantId,
          userId: coord._id,
          title: "Reembolso viáticos conferencia",
          description: "Gastos de hospedaje y alimentación en conferencia técnica",
          category: "Reembolso de Gastos",
          categoryId: catReembolso._id,
          dynamicValue: 35000,
          actionCompleted: true,
          status: "approved",
          amount: 35000,
          approvedBy: adminId,
          approvedAt: new Date(2024, 2, 5),
        },
        {
          tenantId,
          userId: collab._id,
          title: "Monitor adicional",
          description: "27 pulgadas 4K para mejorar productividad",
          category: "Pedidos de Materiales",
          categoryId: catMateriales._id,
          subcategoryId: "monitor",
          subcategoryLabel: "Monitor",
          dynamicValue: "Dell UltraSharp 27\" 4K",
          status: "delivered",
          approvedBy: adminId,
          approvedAt: new Date(2024, 0, 15),
          deliveredAt: new Date(2024, 0, 20),
        },
      ]);
      console.log("✅ Order seeded");
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
          title: "Welcome to HR Portal",
          message: "You now have access to the employee self-service portal.",
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
          description: "Created order: Standing Desk",
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
