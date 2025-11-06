import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { Client } from "../models/Client.js";
import { Project } from "../models/Project.js";
import { Campaign } from "../models/Campaign.js";
import { Post } from "../models/Post.js";
import { Brief } from "../models/Brief.js";
import { WorkflowTask } from "../models/WorkflowTask.js";
import { Tenant } from "../models/Tenant.js";
import { Role } from "../models/Role.js";
import { Asset } from "../models/Asset.js";
import { ensureDefaultRoles } from "../services/roleInitService.js";
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

async function ensureUser({ tenantId, email, password, roleName, firstName, lastName, isActive = true }: { tenantId: Types.ObjectId; email: string; password: string; roleName: "admin" | "manager" | "user" | "client" | "superadmin"; firstName: string; lastName: string; isActive?: boolean }) {
  let user = await User.findOne({ tenantId, email });

  // roles base
  let role;
  if (roleName === "admin" || roleName === "user") {
    const roles = await ensureDefaultRoles(tenantId);
    role = roleName === "admin" ? roles.adminRole : roles.userRole;
  } else {
    role = await Role.findOne({
      tenantId,
      name: { $regex: new RegExp(`^${roleName}$`, "i") },
    });
    if (!role) {
      const permissionsMap: Record<string, string[]> = {
        superadmin: ["*"],
        manager: ["dashboard:view", "clients:view", "clients:update", "campaigns:*", "projects:*", "briefs:*", "posts:*", "tasks:*", "assets:*", "analytics:view", "creative:view", "calendar:view", "settings:view"],
        client: ["dashboard:view", "campaigns:view", "projects:view", "briefs:view", "posts:view", "assets:view"],
      };

      role = await Role.create({
        tenantId,
        name: roleName,
        description: `${roleName.charAt(0).toUpperCase() + roleName.slice(1)} role`,
        permissions: permissionsMap[roleName] || [],
        isDefault: false,
      });
      console.log(`✅ Created role: ${roleName}`);
    }
  }

  if (!user) {
    user = new User({
      tenantId,
      email,
      password,
      roles: [role._id],
      firstName,
      lastName,
      isActive,
    });
    await user.save();

    await Tenant.findByIdAndUpdate(tenantId, {
      $addToSet: { userIds: user._id },
      $inc: { "usage.users.current": 1 },
    });

    console.log(`✅ ensureUser: created ${email} [${roleName}] with role ID: ${role._id}`);
  } else {
    const updates: any = {};
    const userRoles = user.roles.map((r) => r.toString());
    if (!userRoles.includes((role._id as any).toString())) {
      updates.roles = [role._id as any];
    }
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

async function ensureClient({ tenantId, name, email, data }: { tenantId: Types.ObjectId; name: string; email: string; data?: Record<string, any> }) {
  let client = await Client.findOne({ tenantId, email });

  if (!client) {
    // usuario cliente auto
    let clientUser = await User.findOne({ tenantId, email });

    if (!clientUser) {
      const clientRole = await Role.findOne({
        tenantId,
        name: { $regex: /^(client|cliente)$/i },
      });
      const nameParts = name.split(" ").filter((p) => p.trim());
      const firstName = nameParts[0] || name;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined;

      clientUser = new User({
        tenantId,
        email,
        password: "cliente123",
        firstName,
        lastName,
        roles: clientRole ? [clientRole._id] : [],
        isActive: true,
      });
      await clientUser.save();

      await Tenant.findByIdAndUpdate(tenantId, {
        $addToSet: { userIds: clientUser._id },
        $inc: { "usage.users.current": 1 },
      });

      console.log(`✅ ensureUser (auto): created ${email} for client ${name}`);
    }

    client = new Client({
      tenantId,
      name,
      email,
      ownerUserId: clientUser._id,
      usuarios: [
        {
          userId: clientUser._id,
          permiso: "editar",
        },
      ],
      ...data,
    });
    await client.save();

    clientUser.clientIds = [client._id as any];
    await clientUser.save();

    console.log(`✅ ensureClient: created ${name} with auto user`);
  } else {
    const updates: any = {};
    if (client.name !== name) updates.name = name;
    if (data?.brandKit) updates["brandKit"] = { ...(client.brandKit || {}), ...data.brandKit };
    if (typeof data?.status === "string" && client.status !== data.status) updates.status = data.status;
    if (Object.keys(updates).length) {
      await Client.updateOne({ _id: client._id }, { $set: updates });
      console.log(`♻️ ensureClient: updated ${name}`);
    } else {
      console.log(`✔️ ensureClient: exists ${name}`);
    }
  }
  return client!;
}

async function addUserToClientUsuarios({ tenantId, clientId, userId, permiso = "editar" }: { tenantId: Types.ObjectId; clientId: Types.ObjectId | string; userId: Types.ObjectId | string; permiso?: "ver" | "editar" }) {
  const cid = new Types.ObjectId(clientId as any);
  const uid = new Types.ObjectId(userId as any);

  const user = await User.findById(uid);
  if (!user) {
    console.warn(`⚠️  User ${uid} not found, skipping addUserToClientUsuarios`);
    return;
  }

  const res = await Client.updateOne({ _id: cid, tenantId, "usuarios.userId": { $ne: uid } }, { $addToSet: { usuarios: { userId: uid, permiso } } });

  if (res.matchedCount && !res.modifiedCount) {
    await Client.updateOne({ _id: cid, tenantId, "usuarios.userId": uid }, { $set: { "usuarios.$.permiso": permiso } });
  }

  if (!user.clientIds.includes(cid)) {
    user.clientIds.push(cid);
    await user.save();
  }
}

async function ensureProject(data: any) {
  const byName = await Project.findOne({
    tenantId: data.tenantId,
    clientId: data.clientId,
    name: data.name,
  });
  if (byName) {
    console.log(`✔️ ensureProject: exists ${data.name}`);
    return byName;
  }
  const doc = new Project(data);
  await doc.save();
  console.log(`✅ ensureProject: created ${data.name}`);
  return doc;
}

async function ensureCampaign(data: any) {
  const byName = await Campaign.findOne({
    tenantId: data.tenantId,
    clientId: data.clientId,
    name: data.name,
  });
  if (byName) {
    console.log(`✔️ ensureCampaign: exists ${data.name}`);
    return byName;
  }
  const doc = new Campaign(data);
  await doc.save();
  console.log(`✅ ensureCampaign: created ${data.name}`);
  return doc;
}

async function ensurePost(data: any) {
  const exists = await Post.findOne({
    tenantId: data.tenantId,
    campaignId: data.campaignId,
    title: data.title,
  });
  if (exists) {
    console.log(`✔️ ensurePost: exists ${data.title}`);
    return exists;
  }
  const doc = new Post(data);
  await doc.save();
  console.log(`✅ ensurePost: created ${data.title}`);
  return doc;
}

async function ensureBrief(data: any) {
  const exists = await Brief.findOne({
    tenantId: data.tenantId,
    clientId: data.clientId,
    title: data.title,
  });
  if (exists) {
    console.log(`✔️ ensureBrief: exists ${data.title}`);
    return exists;
  }
  const doc = new Brief(data);
  await doc.save();
  console.log(`✅ ensureBrief: created ${data.title}`);
  return doc;
}

async function ensureTask(data: any) {
  const exists = await WorkflowTask.findOne({
    tenantId: data.tenantId,
    clientId: data.clientId,
    title: data.title,
  });
  if (exists) {
    console.log(`✔️ ensureTask: exists ${data.title}`);
    return exists;
  }
  const doc = new WorkflowTask(data);
  await doc.save();
  console.log(`✅ ensureTask: created ${data.title}`);
  return doc;
}

async function ensureAsset(data: any) {
  const exists = await Asset.findOne({
    tenantId: data.tenantId,
    nombre: data.nombre,
    url: data.url,
  });
  if (exists) {
    console.log(`✔️ ensureAsset: exists ${data.nombre}`);
    return exists;
  }
  const doc = new Asset(data);
  await doc.save();
  console.log(`✅ ensureAsset: created ${data.nombre}`);
  return doc;
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

    const superAdminUser = await ensureUser({
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
    return superAdminUser;
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
  const seedClientEmail = env.SEED_CLIENT_EMAIL || "cliente@example.com";
  const seedClientPass = env.SEED_CLIENT_PASS || "changeme";

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
    console.log(`🏢 Tenant found/created - Slug: ${tenantSlug}, ObjectId: ${String(tenantId)}`);

    // USERS
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

    const managerUser = await ensureUser({
      tenantId,
      email: "manager@example.com",
      password: "manager123",
      roleName: "manager",
      firstName: "Manager",
      lastName: "User",
    });
    const managerId = String(managerUser._id);

    const regularUser = await ensureUser({
      tenantId,
      email: "user@example.com",
      password: "user123",
      roleName: "user",
      firstName: "Regular",
      lastName: "User",
    });
    const regularId = String(regularUser._id);

    const clientUser = await ensureUser({
      tenantId,
      email: seedClientEmail,
      password: seedClientPass,
      roleName: "client",
      firstName: "Cliente",
      lastName: "Demo",
    });
    const clientUserId = String(clientUser._id);

    // CLIENTES
    // ARCOR (antes TechCorp)
    const arcor = await ensureClient({
      tenantId,
      name: "Arcor",
      email: "contacto@arcor.com",
      data: {
        phone: "+54 11 4000 0000",
        company: "Grupo Arcor",
        industry: "alimentacion",
        website: "https://www.arcor.com",
        socialMedia: {
          instagram: "https://instagram.com/arcor",
          facebook: "https://facebook.com/arcor",
          linkedin: "https://linkedin.com/company/arcor",
        },
        brandKit: {
          logos: [], // <-- vacío, no inventamos logos
          colors: ["#0054A6", "#F9C300", "#FFFFFF"], // azul corporativo, amarillo, blanco
          fonts: ["Roboto", "Open Sans"],
          guidelines: "Marca cercana y masiva, foco en disfrute y confianza familiar.",
        },
        status: "active",
        favorite: true,
      },
    });
    const arcorId = String(arcor._id);

    // PUMA ENERGY (antes Café Central)
    const puma = await ensureClient({
      tenantId,
      name: "Puma Energy",
      email: "info@pumaenergy.com",
      data: {
        phone: "+598 2500 0000",
        company: "Puma Energy International",
        industry: "energia",
        website: "https://pumaenergy.com",
        socialMedia: {
          instagram: "https://instagram.com/pumaenergy",
          facebook: "https://facebook.com/pumaenergy",
          linkedin: "https://linkedin.com/company/puma-energy",
        },
        brandKit: {
          logos: [], // <-- vacío, no inventamos logos
          colors: ["#006D3C", "#FFFFFF", "#D91F26"], // verde Puma, blanco, rojo acento
          fonts: ["Inter", "Montserrat"],
          guidelines: "Energía accesible y confiable. Tono directo, profesional, enfocado en movilidad y servicio.",
        },
        status: "active",
        favorite: false,
      },
    });
    const pumaId = String(puma._id);

    // Link usuario cliente al cliente principal (Arcor)
    await addUserToClientUsuarios({
      tenantId,
      clientId: arcor._id as any,
      userId: clientUser._id as any,
      permiso: "editar",
    });

    // Set owner en Arcor
    if (!arcor.ownerUserId || !arcor.ownerUserId.equals(clientUser._id as any)) {
      await Client.updateOne({ _id: arcor._id, tenantId }, { $set: { ownerUserId: clientUser._id } });
      console.log("🔗 Linked client user as owner of Arcor");
    }

    // PROYECTOS
    const project1 = await ensureProject({
      tenantId,
      clientId: arcorId,
      name: "Lanzamiento Nueva Línea Snacks 2024",
      description: "Posicionamiento de la nueva línea de snacks saludables Arcor en retail y digital.",
      objectives: ["Aumentar reconocimiento de la nueva línea", "Generar 1000 leads calificados retail/B2B", "Subir awareness 40%"],
      targetAudience: "Consumidores jóvenes y familias que buscan opciones prácticas y más saludables",
      budget: { total: 25000 },
      campaigns: [],
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
      favorite: true,
    });
    const project1Id = String(project1._id);

    const project2 = await ensureProject({
      tenantId,
      clientId: pumaId,
      name: "Programa Experiencia Estaciones Puma",
      description: "Posicionar Puma Energy como la opción preferida en experiencia de servicio y beneficios en ruta.",
      objectives: ["Incrementar ticket promedio 30%", "Fidelizar clientes actuales", "Captar nuevos conductores de flota"],
      targetAudience: "Conductores diarios, transporte liviano/comercial, viajeros frecuentes en ruta",
      budget: { total: 8000 },
      campaigns: [],
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
      favorite: false,
    });
    const project2Id = String(project2._id);

    // attach projects a los clientes
    await Client.findByIdAndUpdate(arcor._id, {
      $addToSet: { proyectos: project1._id },
    });
    await Client.findByIdAndUpdate(puma._id, {
      $addToSet: { proyectos: project2._id },
    });

    // CAMPAÑAS
    const camp1 = await ensureCampaign({
      tenantId,
      clientId: arcorId,
      projectId: project1Id,
      name: "Lanzamiento Snacks Saludables",
      description: "Campaña integral para introducir la nueva línea de snacks Arcor en retail y digital.",
      objectives: ["Generar 1000 leads B2B", "Aumentar awareness 30%"],
      targetAudience: "Compradores retail, responsables de compra supermercados/regionales",
      budget: { total: 10000, allocated: 8000, spent: 2500 },
      timeline: {
        startDate: new Date("2024-01-15"),
        endDate: new Date("2024-04-15"),
      },
      status: "active",
      platforms: ["linkedin", "twitter", "google-ads"],
      kpis: [
        {
          name: "Leads generados",
          target: 1000,
          current: 250,
          unit: "leads",
        },
        { name: "CTR", target: 3.5, current: 2.8, unit: "%" },
      ],
      assignedUsers: [adminId],
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
      favorite: true,
    });

    const camp2 = await ensureCampaign({
      tenantId,
      clientId: pumaId,
      projectId: project2Id,
      name: "Promoción Combustible + Beneficios Ruta",
      description: "Campaña para posicionar la experiencia en estaciones Puma Energy: servicio rápido, beneficios y conveniencia.",
      objectives: ["Aumentar ticket promedio 20%", "Atraer nuevos clientes"],
      targetAudience: "Conductores particulares y comerciales en zonas de alto tránsito",
      budget: { total: 3000, allocated: 3000, spent: 800 },
      timeline: {
        startDate: new Date("2024-02-01"),
        endDate: new Date("2024-03-31"),
      },
      status: "active",
      platforms: ["instagram", "facebook"],
      kpis: [
        {
          name: "Ventas tienda / estacion",
          target: 20,
          current: 8,
          unit: "% incremento",
        },
        {
          name: "Engagement",
          target: 5,
          current: 3.2,
          unit: "%",
        },
      ],
      assignedUsers: [adminId],
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
      favorite: false,
    });

    const camp1Id = String(camp1._id);
    const camp2Id = String(camp2._id);

    // Projects <- campaigns
    await Project.findByIdAndUpdate(project1._id, {
      $addToSet: { campaigns: camp1._id },
    });
    await Project.findByIdAndUpdate(project2._id, {
      $addToSet: { campaigns: camp2._id },
    });

    // POSTS
    // Para Arcor (antes TechCorp)
    await ensurePost({
      tenantId,
      campaignId: camp1Id,
      clientId: arcorId,
      title: "Snacks que te acompañan siempre",
      postType: "social",
      contentFormat: "post",
      platforms: ["linkedin", "twitter"],
      content: {
        copy: "Probá la nueva línea de snacks Arcor: sabor, practicidad y energía para tu día.",
        hashtags: ["Arcor", "Snacks", "InnovaciónAlimentaria"],
        mentions: ["@arcor"],
      },
      media: [],
      usedAssets: [],
      scheduling: {
        publishAt: new Date("2024-02-15T10:00:00Z"),
        timezone: "Europe/Madrid",
        isScheduled: true,
      },
      status: "approved",
      analytics: {
        impressions: 5420,
        engagement: 324,
        clicks: 89,
        shares: 12,
      },
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
      favorite: true,
    });

    // Para Puma Energy (antes Café Central)
    await ensurePost({
      tenantId,
      campaignId: camp2Id,
      clientId: pumaId,
      title: "Parada inteligente en Puma Energy",
      postType: "social",
      contentFormat: "post",
      platforms: ["instagram", "facebook"],
      content: {
        copy: "Tanque lleno, café caliente y beneficios para tu viaje. Pasá por Puma Energy.",
        hashtags: ["PumaEnergy", "EnRuta", "ParadaInteligente"],
        mentions: ["@pumaenergy"],
      },
      media: [],
      usedAssets: [],
      scheduling: {
        publishAt: new Date("2024-02-10T08:00:00Z"),
        timezone: "Europe/Madrid",
        isScheduled: true,
      },
      status: "published",
      analytics: {
        impressions: 2150,
        engagement: 186,
        clicks: 45,
        shares: 8,
      },
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
      favorite: false,
    });

    await ensurePost({
      tenantId,
      campaignId: camp2Id,
      clientId: pumaId,
      title: "Así preparamos tu mejor parada",
      postType: "social",
      contentFormat: "reel",
      platforms: ["instagram"],
      content: {
        copy: "Servicio rápido, productos frescos y estaciones listas para vos. Esto es Puma Energy.",
        hashtags: ["PumaEnergy", "Ruta", "Servicio"],
        mentions: ["@pumaenergy"],
      },
      media: [],
      usedAssets: [],
      scheduling: {
        publishAt: new Date("2024-02-12T17:00:00Z"),
        timezone: "Europe/Madrid",
        isScheduled: true,
      },
      status: "approved",
      analytics: {
        impressions: 8940,
        engagement: 1247,
        clicks: 234,
        shares: 89,
      },
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
      favorite: true,
    });

    await ensurePost({
      tenantId,
      campaignId: camp2Id,
      clientId: pumaId,
      title: "Promo del día en tienda",
      postType: "social",
      contentFormat: "story",
      platforms: ["instagram"],
      content: {
        copy: "🔥 HOY: 2x1 en café y medialunas en tu estación Puma Energy más cercana. Solo hasta las 18hs.",
        hashtags: [],
        mentions: [],
      },
      media: [],
      usedAssets: [],
      scheduling: {
        publishAt: new Date("2024-02-11T09:00:00Z"),
        timezone: "Europe/Madrid",
        isScheduled: true,
      },
      status: "published",
      analytics: {
        impressions: 3450,
        engagement: 287,
        clicks: 156,
        shares: 23,
      },
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
      favorite: false,
    });

    await ensurePost({
      tenantId,
      campaignId: camp1Id,
      clientId: arcorId,
      title: "Nuevo sabor en 60 segundos",
      postType: "social",
      contentFormat: "short",
      platforms: ["youtube"],
      content: {
        copy: "Conocé el nuevo snack Arcor en 60 segundos. Ideal para el break del día.",
        hashtags: ["Arcor", "Snacks", "BreakTime", "Shorts"],
        mentions: [],
      },
      media: [],
      usedAssets: [],
      scheduling: {
        publishAt: new Date("2024-02-14T12:00:00Z"),
        timezone: "Europe/Madrid",
        isScheduled: true,
      },
      status: "approved",
      analytics: {
        impressions: 12340,
        engagement: 876,
        clicks: 234,
        shares: 45,
      },
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
      favorite: true,
    });

    await ensurePost({
      tenantId,
      campaignId: camp1Id,
      clientId: arcorId,
      title: "Tip rápido de consumo inteligente",
      postType: "social",
      contentFormat: "post",
      platforms: ["tiktok"],
      content: {
        copy: "3 snacks Arcor que te salvan el día cuando no tenés tiempo. #VidaReal",
        hashtags: ["Arcor", "SnackTime", "FYP"],
        mentions: ["@arcor"],
      },
      media: [],
      usedAssets: [],
      scheduling: {
        publishAt: new Date("2024-02-13T19:00:00Z"),
        timezone: "Europe/Madrid",
        isScheduled: true,
      },
      status: "scheduled",
      analytics: {
        impressions: 0,
        engagement: 0,
        clicks: 0,
        shares: 0,
      },
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
      favorite: false,
    });

    await ensurePost({
      tenantId,
      campaignId: camp2Id,
      clientId: pumaId,
      title: "Recarga y seguí viaje",
      postType: "social",
      contentFormat: "reel",
      platforms: ["facebook"],
      content: {
        copy: "Hacemos tu parada más fácil: carga rápida, beneficios, productos frescos. Eso es Puma Energy.",
        hashtags: ["PumaEnergy", "ViajeSeguro", "Ruta"],
        mentions: ["@pumaenergy"],
      },
      media: [],
      usedAssets: [],
      scheduling: {
        publishAt: new Date("2024-02-16T15:00:00Z"),
        timezone: "Europe/Madrid",
        isScheduled: true,
      },
      status: "draft",
      analytics: {
        impressions: 0,
        engagement: 0,
        clicks: 0,
        shares: 0,
      },
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
      favorite: false,
    });

    // Email Marketing - Arcor
    await ensurePost({
      tenantId,
      campaignId: camp1Id,
      clientId: arcorId,
      title: "Newsletter Febrero - Novedades Arcor",
      postType: "email",
      channelConfig: {
        subject: "Nuevos sabores, nuevas opciones para vos 🍫 Descubrí lo último de Arcor",
        body: "Hola,\n\nEste mes presentamos nuevas opciones de snacks pensadas para acompañarte todos los días.\n\n- Formatos individuales\n- Menos azúcar añadida\n- Más sabor\n\nLeé más en nuestro blog.\n\nEquipo Arcor",
        bodyHtml: "<h1>Novedades de Febrero</h1><p>Este mes presentamos nuevas opciones de snacks pensadas para acompañarte todos los días...</p>",
        recipients: ["contactos@arcor.com"],
        replyTo: "soporte@arcor.com",
      },
      content: {
        copy: "Newsletter mensual con lanzamientos y mensajes de marca",
        hashtags: [],
        mentions: [],
      },
      media: [],
      usedAssets: [],
      platforms: [],
      scheduling: {
        publishAt: new Date("2024-02-20T09:00:00Z"),
        timezone: "Europe/Madrid",
        isScheduled: true,
      },
      status: "approved",
      analytics: {
        impressions: 8500,
        engagement: 680,
        clicks: 425,
        shares: 0,
      },
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
      favorite: true,
    });

    // Email Marketing - Puma Energy
    await ensurePost({
      tenantId,
      campaignId: camp2Id,
      clientId: pumaId,
      title: "Beneficio Ruta - Descuento Especial",
      postType: "email",
      channelConfig: {
        subject: "⛽ 20% OFF en tu próxima carga + café caliente de regalo ☕",
        body: "Hola,\n\nTenemos una promo especial para vos en Puma Energy: 20% de descuento en tu próxima carga de combustible + café caliente de regalo.\n\nMostrá este correo en caja.\n\nVálido hasta el domingo.\n\nTe esperamos.\nPuma Energy",
        bodyHtml: "<h2>Promo especial en ruta</h2><p>20% de descuento en tu próxima carga + café caliente de regalo.</p>",
        recipients: ["clientes@pumaenergy.com"],
        replyTo: "info@pumaenergy.com",
      },
      content: {
        copy: "Email promocional con beneficio exclusivo por tiempo limitado",
        hashtags: [],
        mentions: [],
      },
      media: [],
      usedAssets: [],
      platforms: [],
      scheduling: {
        publishAt: new Date("2024-02-18T08:00:00Z"),
        timezone: "Europe/Madrid",
        isScheduled: true,
      },
      status: "scheduled",
      analytics: {
        impressions: 0,
        engagement: 0,
        clicks: 0,
        shares: 0,
      },
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
      favorite: true,
    });

    // Push Notification - Producto (Arcor)
    await ensurePost({
      tenantId,
      campaignId: camp1Id,
      clientId: arcorId,
      title: "Push - Nuevo snack disponible",
      postType: "push",
      channelConfig: {
        title: "🎉 Nuevo snack Arcor",
        body: "Probá nuestra nueva opción pensada para el día a día. Ideal para vos.",
        clickAction: "/productos/snacks",
        deepLink: "arcor://snacks",
        priority: "high",
        segmentation: {
          tags: ["consumidor_frecuente", "alto_engagement"],
        },
      },
      content: {
        copy: "Push para anuncio de nuevo producto consumo masivo",
        hashtags: [],
        mentions: [],
      },
      media: [],
      usedAssets: [],
      platforms: [],
      scheduling: {
        publishAt: new Date("2024-02-21T10:00:00Z"),
        timezone: "Europe/Madrid",
        isScheduled: true,
      },
      status: "approved",
      analytics: {
        impressions: 15200,
        engagement: 3840,
        clicks: 1824,
        shares: 0,
      },
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
      favorite: false,
    });

    // Push Notification - Promo (Puma)
    await ensurePost({
      tenantId,
      campaignId: camp2Id,
      clientId: pumaId,
      title: "Push - Promo Flash Estación",
      postType: "push",
      channelConfig: {
        title: "🔥 Promo Flash: 2x1 en combo ruta",
        body: "Solo por 2 horas en tu Puma Energy más cercana.",
        clickAction: "/offers/flash-sale",
        deepLink: "pumaenergy://offers/flash",
        priority: "high",
        segmentation: {
          allUsers: true,
        },
      },
      content: {
        copy: "Push para promo limitada en tienda de estación",
        hashtags: [],
        mentions: [],
      },
      media: [],
      usedAssets: [],
      platforms: [],
      scheduling: {
        publishAt: new Date("2024-02-19T14:00:00Z"),
        timezone: "Europe/Madrid",
        isScheduled: true,
      },
      status: "published",
      analytics: {
        impressions: 4230,
        engagement: 1689,
        clicks: 845,
        shares: 0,
      },
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
      favorite: false,
    });

    // Push Notification - Fidelización (Puma)
    await ensurePost({
      tenantId,
      campaignId: camp2Id,
      clientId: pumaId,
      title: "Push - Beneficio clientes frecuentes",
      postType: "push",
      channelConfig: {
        title: "⭐ Estás cerca de tu beneficio Puma Energy",
        body: "Te faltan 2 cargas para desbloquear tu premio. Pasá hoy.",
        clickAction: "/loyalty",
        deepLink: "pumaenergy://loyalty",
        priority: "normal",
        segmentation: {
          tags: ["fidelidad", "alta_frecuencia"],
        },
      },
      content: {
        copy: "Push recordatorio de programa de fidelidad / puntos en estaciones",
        hashtags: [],
        mentions: [],
      },
      media: [],
      usedAssets: [],
      platforms: [],
      scheduling: {
        publishAt: new Date("2024-02-22T11:00:00Z"),
        timezone: "Europe/Madrid",
        isScheduled: true,
      },
      status: "draft",
      analytics: {
        impressions: 0,
        engagement: 0,
        clicks: 0,
        shares: 0,
      },
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
      favorite: false,
    });

    // BRIEF (Arcor)
    await ensureBrief({
      tenantId,
      clientId: arcorId,
      campaignId: camp1Id,
      title: "Brief - Lanzamiento Snacks Saludables",
      description: "Brief para el lanzamiento de la nueva línea de snacks Arcor con foco salud + conveniencia.",
      objectives: ["Posicionar la línea como opción rica y práctica", "Generar demanda inicial en retail"],
      targetAudience: {
        demographics: {
          ageRange: "25-45 años",
          gender: "Todos",
          location: "Argentina / LATAM",
          income: "Medio",
        },
        psychographics: {
          interests: ["Vida activa", "Snacks rápidos", "Salud práctica"],
          behaviors: ["Compra en kiosco/super", "Busca opciones cómodas", "Lee etiquetas"],
          values: ["Confianza", "Calidad", "Precio justo"],
        },
        painPoints: ["Snacks poco prácticos", "Demasiado azúcar", "Pocas opciones en ruta/oficina"],
      },
      brandGuidelines: {
        toneOfVoice: "Cercano, positivo, cotidiano",
        keyMessages: ["Te acompaña en tu ritmo", "Rico y práctico", "La marca que conocés"],
        dosDonts: {
          dos: ["Hablar de momentos reales", "Mostrar consumo cotidiano", "Ser concretos"],
          donts: ["Ser muy técnico", "Prometer 'salud perfecto'", "Comparar con la competencia directa"],
        },
        visualStyle: "Colorido, cercano, uso de colores de producto y packaging",
      },
      deliverables: [
        {
          type: "campaign",
          quantity: 1,
          format: ["Digital", "Social Media"],
          platforms: ["linkedin", "twitter", "google-ads"],
          deadline: new Date("2024-03-01"),
        },
      ],
      budget: {
        total: 10000,
        breakdown: [
          {
            category: "Publicidad digital",
            amount: 6000,
            description: "Paid media / performance",
          },
          {
            category: "Contenido",
            amount: 2500,
            description: "Creatividades y social",
          },
          {
            category: "Gestión",
            amount: 1500,
            description: "Planificación y reporting",
          },
        ],
      },
      timeline: {
        startDate: new Date("2024-01-15"),
        endDate: new Date("2024-04-15"),
        milestones: [
          {
            name: "Kick-off",
            date: new Date("2024-01-15"),
            description: "Inicio de campaña",
          },
          {
            name: "Review intermedio",
            date: new Date("2024-02-28"),
            description: "Evaluación inicial",
          },
          {
            name: "Optimización",
            date: new Date("2024-03-15"),
            description: "Ajustes creativos / pauta",
          },
        ],
      },
      requirements: {
        mandatory: ["Aprobación de cliente", "Métricas semanales", "Reportes mensuales"],
        preferred: ["A/B testing", "Segmentación por momento de consumo"],
        restrictions: ["No claims médicos", "Cumplir normativa etiquetado", "Presupuesto fijo"],
      },
      success_metrics: {
        primary: ["Leads comerciales", "Costo por lead"],
        secondary: ["Brand awareness", "Engagement rate"],
        kpis: [
          { name: "Leads cualificados", target: 1000, unit: "leads" },
          { name: "CPL", target: 10, unit: "USD" },
          { name: "CTR", target: 3.5, unit: "%" },
        ],
      },
      status: "approved",
      priority: "high",
      assignedTo: [adminId],
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
      favorite: true,
    });

    // TASKS
    await ensureTask({
      tenantId,
      campaignId: camp1Id,
      clientId: arcorId,
      title: "Diseñar creatividades para LinkedIn",
      description: "Crear 5 creatividades diferentes para la campaña B2B de Arcor",
      type: "design",
      priority: "high",
      status: "in_progress",
      assignedTo: [adminId],
      dueDate: new Date("2024-02-20"),
      estimatedHours: 8,
      actualHours: 4,
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
    });

    await ensureTask({
      tenantId,
      campaignId: camp2Id,
      clientId: pumaId,
      title: "Redactar copy para posts de Instagram",
      description: "Crear textos atractivos para 10 posts de Instagram sobre beneficios en estaciones Puma Energy",
      type: "copy",
      priority: "medium",
      status: "todo",
      assignedTo: [adminId],
      dueDate: new Date("2024-02-18"),
      estimatedHours: 4,
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
    });

    await ensureTask({
      tenantId,
      campaignId: camp1Id,
      clientId: arcorId,
      title: "Análisis de métricas Q1",
      description: "Revisar y analizar todas las métricas del primer trimestre (reach, CPL, CTR)",
      type: "analysis",
      priority: "medium",
      status: "done",
      assignedTo: [adminId],
      dueDate: new Date("2024-02-10"),
      estimatedHours: 6,
      actualHours: 5,
      usuarios: [
        {
          id: adminId,
          email: adminUser.email,
          permiso: "editar",
        },
      ],
      createdBy: adminId,
    });

    // ASSETS
    await ensureAsset({
      tenantId,
      clientId: arcorId,
      campaignId: camp1Id,
      nombre: "Banner LinkedIn - Snacks Saludables",
      tipo: "imagen",
      url: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg",
      scope: "campaigns",
      creadoPor: adminId,
      tags: ["banner", "linkedin", "arcor", "snacks"],
      permisos: {
        editores: [adminId],
        visores: [adminId],
      },
      metadata: {
        name: "Banner LinkedIn - Snacks Saludables",
        title: "Banner LinkedIn - Snacks Saludables",
        description: "Banner para awareness B2B sobre nueva línea de snacks Arcor",
        category: "social-media",
        notes: "Imagen de Pexels - Free to use",
      },
    });

    await ensureAsset({
      tenantId,
      clientId: pumaId,
      campaignId: camp2Id,
      nombre: "Foto Estación Puma Energy",
      tipo: "imagen",
      url: "https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg",
      scope: "campaigns",
      creadoPor: adminId,
      tags: ["puma", "estacion", "promo", "combustible"],
      permisos: {
        editores: [adminId],
        visores: [adminId],
      },
      metadata: {
        name: "Foto Estación Puma Energy",
        title: "Foto Estación Puma Energy",
        description: "Imagen principal para promoción de estaciones y experiencia de servicio",
        category: "branding",
        notes: "Optimizado para Instagram - Imagen de Pexels",
      },
    });

    await ensureAsset({
      tenantId,
      clientId: pumaId,
      nombre: "Guía de Brand Puma Energy",
      tipo: "documento",
      url: "https://example.com/brandkit-puma.pdf",
      scope: "brandkit",
      creadoPor: adminId,
      tags: ["brandkit", "guidelines", "marca", "puma"],
      permisos: {
        editores: [adminId],
        visores: [adminId],
      },
      metadata: {
        name: "Guía de Brand Puma Energy",
        title: "Guía de Brand Puma Energy",
        description: "Documento con directrices de marca y lineamientos de comunicación para Puma Energy",
        category: "branding",
        notes: "24 páginas - Última actualización: " + new Date().toLocaleDateString(),
      },
    });

    console.log("🎉 Seed completed successfully!");
    console.log("👤 Admin:", adminEmail, "/", adminPassword);
    console.log("👤 Manager: manager@example.com / manager123");
    console.log("👤 User: user@example.com / user123");
    console.log("👤 Client user:", seedClientEmail, "/", seedClientPass);
    console.log("🔐 Roles: Administrador, Manager, Usuario, Cliente");
    console.log("🏢 Clients: Arcor, Puma Energy");
    console.log("📁 Projects: Lanzamiento Nueva Línea Snacks 2024, Programa Experiencia Estaciones Puma");
    console.log("🎯 Campaigns: Lanzamiento Snacks Saludables, Promoción Combustible + Beneficios Ruta");
    console.log("📱 Posts: contenidos sociales / email / push creados");
    console.log("📦 Assets: imágenes y docs de marca cargados");
  } catch (error) {
    console.error("❌ Seed error:", error);
    throw error;
  }
}

/* --------------------------- direct execution --------------------------- */
if (import.meta.url === `file://${process.argv[1]}`) {
  connectDB()
    .then(async () => {
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
