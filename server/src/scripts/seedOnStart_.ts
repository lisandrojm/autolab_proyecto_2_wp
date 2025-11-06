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

  // Para roles admin y user, usar el servicio centralizado
  let role;
  if (roleName === "admin" || roleName === "user") {
    const roles = await ensureDefaultRoles(tenantId);
    role = roleName === "admin" ? roles.adminRole : roles.userRole;
  } else {
    // Para otros roles (manager, client, superadmin), usar la lógica existente
    role = await Role.findOne({ tenantId, name: { $regex: new RegExp(`^${roleName}$`, "i") } });
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
    // No hasheamos aquí - el hook pre-save del modelo lo hace automáticamente
    user = new User({ tenantId, email, password, roles: [role._id], firstName, lastName, isActive });
    await user.save();

    // Agregar usuario al array userIds del tenant
    await Tenant.findByIdAndUpdate(tenantId, {
      $addToSet: { userIds: user._id },
      $inc: { "usage.users.current": 1 },
    });

    console.log(`✅ ensureUser: created ${email} [${roleName}] with role ID: ${role._id}`);
  } else {
    const updates: any = {};
    // Asegurar que el usuario tiene el rol correcto
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

  // Si el cliente no existe, crearlo con un usuario automático
  if (!client) {
    // Verificar si ya existe usuario con este email
    let clientUser = await User.findOne({ tenantId, email });

    // Si no existe, crear usuario
    if (!clientUser) {
      const clientRole = await Role.findOne({ tenantId, name: { $regex: /^(client|cliente)$/i } });
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

      // Agregar usuario al array userIds del tenant
      await Tenant.findByIdAndUpdate(tenantId, {
        $addToSet: { userIds: clientUser._id },
        $inc: { "usage.users.current": 1 },
      });

      console.log(`✅ ensureUser (auto): created ${email} for client ${name}`);
    }

    // Crear cliente con el usuario en el array usuarios
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

    // Actualizar clientIds del usuario
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

/** Agrega/asegura la relación en Client.usuarios usando 'userId' como campo */
async function addUserToClientUsuarios({ tenantId, clientId, userId, permiso = "editar" }: { tenantId: Types.ObjectId; clientId: Types.ObjectId | string; userId: Types.ObjectId | string; permiso?: "ver" | "editar" }) {
  const cid = new Types.ObjectId(clientId as any);
  const uid = new Types.ObjectId(userId as any);

  // Verificar que el usuario existe
  const user = await User.findById(uid);
  if (!user) {
    console.warn(`⚠️  User ${uid} not found, skipping addUserToClientUsuarios`);
    return;
  }

  // 1) Si no existe la relación, agregarla
  const res = await Client.updateOne({ _id: cid, tenantId, "usuarios.userId": { $ne: uid } }, { $addToSet: { usuarios: { userId: uid, permiso } } });

  // 2) Si ya existía la relación, actualizar permiso
  if (res.matchedCount && !res.modifiedCount) {
    await Client.updateOne({ _id: cid, tenantId, "usuarios.userId": uid }, { $set: { "usuarios.$.permiso": permiso } });
  }

  // 3) Actualizar clientIds en el usuario
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

/**
 * Asegura que siempre exista un usuario superadmin en tenant dedicado
 * Se ejecuta independientemente de SEED_ON_START
 */
export async function ensureSuperAdmin() {
  console.log("🔐 Ensuring superadmin user...");

  try {
    // Crear tenant dedicado para superadmin con flag isSystem
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
          apiCalls: { current: 0, limit: 999999, resetDate: endOfPeriod },
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
      // Asegurar que el tenant existente tenga isSystem = true
      if (!superAdminTenant.isSystem) {
        superAdminTenant.isSystem = true;
        await superAdminTenant.save();
        console.log(`♻️ Updated existing tenant: superadmin to isSystem = true`);
      } else {
        console.log(`✔️ System tenant exists: superadmin with _id: ${superAdminTenant._id}`);
      }
    }

    const superAdminTenantId = new Types.ObjectId(superAdminTenant._id as any);

    // Crear o verificar superadmin
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

    // ========== TENANT ==========
    // El tenant se busca/crea por slug y se usa su ObjectId automáticamente
    const tenant = await ensureTenant({
      name: "Demo Tenant",
      slug: tenantSlug,
    });
    const tenantId = new Types.ObjectId(tenant._id as any);
    console.log(`🏢 Tenant found/created - Slug: ${tenantSlug}, ObjectId: ${String(tenantId)}`);

    // ========== USUARIOS ==========
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

    // ========== CLIENTES ==========
    const techcorp = await ensureClient({
      tenantId,
      name: "TechCorp Solutions",
      email: "contact@techcorp.com",
      data: {
        phone: "+34 600 123 456",
        company: "TechCorp Solutions S.L.",
        industry: "tecnologia",
        website: "https://techcorp.com",
        socialMedia: {
          instagram: "https://instagram.com/techcorp",
          facebook: "https://facebook.com/techcorp",
          linkedin: "https://linkedin.com/company/techcorp",
        },
        brandKit: {
          logos: [
            {
              url: "https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg",
              name: "Logo Principal",
              fileName: "logo-principal.png",
              uploadedAt: new Date(),
            },
            {
              url: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg",
              name: "Logo Fondo Oscuro",
              fileName: "logo-dark.png",
              uploadedAt: new Date(),
            },
            {
              url: "https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg",
              name: "Icono Cuadrado",
              fileName: "icon-square.png",
              uploadedAt: new Date(),
            },
          ],
          colors: ["#3b82f6", "#1e40af", "#f8fafc"],
          fonts: ["Inter", "Roboto"],
          guidelines: "Marca moderna y tecnológica, enfoque en innovación",
        },
        status: "active",
        favorite: true,
      },
    });
    const techcorpId = String(techcorp._id);

    const cafecentral = await ensureClient({
      tenantId,
      name: "Café Central",
      email: "info@cafecentral.es",
      data: {
        phone: "+34 600 789 012",
        company: "Café Central",
        industry: "gastronomia",
        website: "https://cafecentral.es",
        socialMedia: {
          instagram: "https://instagram.com/cafecentral",
          facebook: "https://facebook.com/cafecentral",
        },
        brandKit: {
          logos: [
            {
              url: "https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg",
              name: "Logo Principal",
              fileName: "logo-principal.png",
              uploadedAt: new Date(),
            },
            {
              url: "https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg",
              name: "Logo Versión Clara",
              fileName: "logo-light.png",
              uploadedAt: new Date(),
            },
          ],
          colors: ["#8b4513", "#d2691e", "#f5deb3"],
          fonts: ["Playfair Display", "Open Sans"],
          guidelines: "Marca cálida y acogedora, enfoque en tradición y calidad",
        },
        status: "active",
        favorite: false,
      },
    });
    const cafecentralId = String(cafecentral._id);

    // Vincular usuario cliente al Client principal (TechCorp)
    await addUserToClientUsuarios({
      tenantId,
      clientId: techcorp._id as any,
      userId: clientUser._id as any,
      permiso: "editar",
    });

    // Set owner
    if (!techcorp.ownerUserId || !techcorp.ownerUserId.equals(clientUser._id as any)) {
      await Client.updateOne({ _id: techcorp._id, tenantId }, { $set: { ownerUserId: clientUser._id } });
      console.log("🔗 Linked client user as owner of TechCorp");
    }

    // ========== PROYECTOS ==========
    const project1 = await ensureProject({
      tenantId,
      clientId: techcorpId,
      name: "Transformación Digital 2024",
      description: "Proyecto integral de transformación digital y posicionamiento tecnológico",
      objectives: ["Posicionar como líder tecnológico", "Generar 1000 leads cualificados", "Aumentar awareness 40%"],
      targetAudience: "CTOs y directores de tecnología en empresas medianas y grandes",
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
      clientId: cafecentralId,
      name: "Experiencia Café Premium",
      description: "Proyecto para posicionar la marca como referente en café de especialidad",
      objectives: ["Aumentar ventas 30%", "Fidelizar clientes existentes", "Atraer nuevos segmentos premium"],
      targetAudience: "Amantes del café premium, profesionales de 28-50 años con poder adquisitivo medio-alto",
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

    // Actualizar clientes con proyectos
    await Client.findByIdAndUpdate(techcorp._id, { $addToSet: { proyectos: project1._id } });
    await Client.findByIdAndUpdate(cafecentral._id, { $addToSet: { proyectos: project2._id } });

    // ========== CAMPAÑAS ==========
    const camp1 = await ensureCampaign({
      tenantId,
      clientId: techcorpId,
      projectId: project1Id,
      name: "Lanzamiento Producto 2024",
      description: "Campaña integral para el lanzamiento del nuevo producto tecnológico",
      objectives: ["Generar 1000 leads", "Aumentar awareness 30%"],
      targetAudience: "CTOs y desarrolladores de empresas medianas",
      budget: { total: 10000, allocated: 8000, spent: 2500 },
      timeline: { startDate: new Date("2024-01-15"), endDate: new Date("2024-04-15") },
      status: "active",
      platforms: ["linkedin", "twitter", "google-ads"],
      kpis: [
        { name: "Leads generados", target: 1000, current: 250, unit: "leads" },
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
      clientId: cafecentralId,
      projectId: project2Id,
      name: "Promoción Café de Temporada",
      description: "Campaña para promocionar los nuevos cafés de temporada",
      objectives: ["Aumentar ventas 20%", "Atraer nuevos clientes"],
      targetAudience: "Amantes del café premium en la zona",
      budget: { total: 3000, allocated: 3000, spent: 800 },
      timeline: { startDate: new Date("2024-02-01"), endDate: new Date("2024-03-31") },
      status: "active",
      platforms: ["instagram", "facebook"],
      kpis: [
        { name: "Ventas", target: 20, current: 8, unit: "% incremento" },
        { name: "Engagement", target: 5, current: 3.2, unit: "%" },
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

    // Actualizar proyectos con campañas
    await Project.findByIdAndUpdate(project1._id, { $addToSet: { campaigns: camp1._id } });
    await Project.findByIdAndUpdate(project2._id, { $addToSet: { campaigns: camp2._id } });

    // ========== POSTS ==========
    // Social Media Posts - LinkedIn & Twitter
    await ensurePost({
      tenantId,
      campaignId: camp1Id,
      clientId: techcorpId,
      title: "Innovación que transforma tu negocio",
      postType: "social",
      contentFormat: "post",
      channel: "linkedin_post",
      content: {
        copy: "Descubre cómo nuestra nueva solución tecnológica puede revolucionar tu empresa. #Innovación #Tecnología #Transformación",
        hashtags: ["Innovación", "Tecnología", "Transformación", "B2B"],
        mentions: ["@techcorp"],
      },
      media: [
        {
          type: "image",
          urls: ["https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg"],
          alt: "Equipo trabajando con tecnología",
        },
      ],
      platforms: ["linkedin", "twitter"],
      scheduling: { publishAt: new Date("2024-02-15T10:00:00Z"), timezone: "Europe/Madrid", isScheduled: true },
      status: "approved",
      analytics: { impressions: 5420, engagement: 324, clicks: 89, shares: 12 },
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

    // Social Media - Instagram Post
    await ensurePost({
      tenantId,
      campaignId: camp2Id,
      clientId: cafecentralId,
      title: "Café de temporada disponible",
      postType: "social",
      contentFormat: "post",
      channel: "instagram_post",
      content: {
        copy: "☕ ¡Ya están aquí nuestros cafés de temporada! Sabores únicos que no puedes perderte. Ven y pruébalos. #CaféEspecial #Temporada",
        hashtags: ["CaféEspecial", "Temporada", "SaborÚnico", "CaféCentral"],
        mentions: ["@cafecentral"],
      },
      media: [
        {
          type: "image",
          urls: ["https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg"],
          alt: "Taza de café especial",
        },
      ],
      platforms: ["instagram", "facebook"],
      scheduling: { publishAt: new Date("2024-02-10T08:00:00Z"), timezone: "Europe/Madrid", isScheduled: true },
      status: "published",
      analytics: { impressions: 2150, engagement: 186, clicks: 45, shares: 8 },
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

    // Social Media - Instagram Reel
    await ensurePost({
      tenantId,
      campaignId: camp2Id,
      clientId: cafecentralId,
      title: "Cómo preparamos tu café perfecto",
      postType: "social",
      contentFormat: "reel",
      channel: "instagram_reel",
      content: {
        copy: "✨ El arte de preparar el café perfecto. Cada taza cuenta una historia. #CaféArtesanal #Barista #CaféCentral",
        hashtags: ["CaféArtesanal", "Barista", "CaféCentral", "Reel"],
        mentions: ["@cafecentral"],
      },
      media: [
        {
          type: "video",
          urls: ["https://example.com/video/cafe-preparation.mp4"],
          alt: "Video de preparación de café artesanal",
        },
      ],
      platforms: ["instagram"],
      scheduling: { publishAt: new Date("2024-02-12T17:00:00Z"), timezone: "Europe/Madrid", isScheduled: true },
      status: "approved",
      analytics: { impressions: 8940, engagement: 1247, clicks: 234, shares: 89 },
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

    // Social Media - Instagram Story
    await ensurePost({
      tenantId,
      campaignId: camp2Id,
      clientId: cafecentralId,
      title: "Oferta del día - Story",
      postType: "social",
      contentFormat: "story",
      channel: "instagram_story",
      content: {
        copy: "🔥 OFERTA HOY: 2x1 en todos los cafés de temporada hasta las 6pm",
        hashtags: [],
        mentions: [],
      },
      media: [
        {
          type: "image",
          urls: ["https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg"],
          alt: "Oferta especial del día",
        },
      ],
      platforms: ["instagram"],
      scheduling: { publishAt: new Date("2024-02-11T09:00:00Z"), timezone: "Europe/Madrid", isScheduled: true },
      status: "published",
      analytics: { impressions: 3450, engagement: 287, clicks: 156, shares: 23 },
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

    // Social Media - YouTube Short
    await ensurePost({
      tenantId,
      campaignId: camp1Id,
      clientId: techcorpId,
      title: "Tutorial rápido - Nueva función",
      postType: "social",
      contentFormat: "short",
      channel: "youtube_short",
      content: {
        copy: "🚀 Aprende a usar nuestra nueva función en 60 segundos #TechTutorial #Productividad #TechCorp",
        hashtags: ["TechTutorial", "Productividad", "TechCorp", "Shorts"],
        mentions: [],
      },
      media: [
        {
          type: "video",
          urls: ["https://example.com/video/tutorial-short.mp4"],
          alt: "Tutorial rápido de nueva funcionalidad",
        },
      ],
      platforms: ["youtube"],
      scheduling: { publishAt: new Date("2024-02-14T12:00:00Z"), timezone: "Europe/Madrid", isScheduled: true },
      status: "approved",
      analytics: { impressions: 12340, engagement: 876, clicks: 234, shares: 45 },
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

    // Social Media - TikTok Post
    await ensurePost({
      tenantId,
      campaignId: camp1Id,
      clientId: techcorpId,
      title: "Tech Hack del día",
      postType: "social",
      contentFormat: "post",
      channel: "tiktok_post",
      content: {
        copy: "💡 3 trucos que aumentarán tu productividad hoy mismo #TechHacks #Productividad #TechLife",
        hashtags: ["TechHacks", "Productividad", "TechLife", "FYP"],
        mentions: ["@techcorp"],
      },
      media: [
        {
          type: "video",
          urls: ["https://example.com/video/tech-hacks.mp4"],
          alt: "Video de trucos tecnológicos",
        },
      ],
      platforms: ["tiktok"],
      scheduling: { publishAt: new Date("2024-02-13T19:00:00Z"), timezone: "Europe/Madrid", isScheduled: true },
      status: "scheduled",
      analytics: { impressions: 0, engagement: 0, clicks: 0, shares: 0 },
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

    // Social Media - Facebook Reel
    await ensurePost({
      tenantId,
      campaignId: camp2Id,
      clientId: cafecentralId,
      title: "Receta especial de café helado",
      postType: "social",
      contentFormat: "reel",
      channel: "facebook_reel",
      content: {
        copy: "🧊☕ Receta perfecta para un café helado refrescante. ¡Pruébalo en casa! #CaféHelado #Receta #Verano",
        hashtags: ["CaféHelado", "Receta", "Verano", "CaféCentral"],
        mentions: ["@cafecentral"],
      },
      media: [
        {
          type: "video",
          urls: ["https://example.com/video/cafe-helado.mp4"],
          alt: "Video receta de café helado",
        },
      ],
      platforms: ["facebook"],
      scheduling: { publishAt: new Date("2024-02-16T15:00:00Z"), timezone: "Europe/Madrid", isScheduled: true },
      status: "draft",
      analytics: { impressions: 0, engagement: 0, clicks: 0, shares: 0 },
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

    // Email Marketing - Newsletter
    await ensurePost({
      tenantId,
      campaignId: camp1Id,
      clientId: techcorpId,
      title: "Newsletter Febrero - Novedades TechCorp",
      postType: "email",
      channel: "email",
      channelConfig: {
        subject: "🚀 Novedades de Febrero: Nuevas funcionalidades que amarás",
        body: "Hola,\n\nEste mes tenemos grandes novedades para ti. Hemos lanzado tres nuevas funcionalidades que mejorarán tu productividad:\n\n1. Dashboard personalizable\n2. Integración con IA\n3. Reportes automáticos\n\nDescubre más en nuestro blog.\n\nSaludos,\nEquipo TechCorp",
        bodyHtml: "<h1>Novedades de Febrero</h1><p>Hola,</p><p>Este mes tenemos grandes novedades para ti...</p>",
        recipients: ["subscribers@techcorp.com"],
        replyTo: "support@techcorp.com",
      },
      content: {
        copy: "Newsletter mensual con novedades del producto",
        hashtags: [],
        mentions: [],
      },
      media: [
        {
          type: "image",
          urls: ["https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg"],
          alt: "Banner newsletter",
        },
      ],
      platforms: [],
      scheduling: { publishAt: new Date("2024-02-20T09:00:00Z"), timezone: "Europe/Madrid", isScheduled: true },
      status: "approved",
      analytics: { impressions: 8500, engagement: 680, clicks: 425, shares: 0 },
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

    // Email Marketing - Promocional
    await ensurePost({
      tenantId,
      campaignId: camp2Id,
      clientId: cafecentralId,
      title: "Email Promoción - Descuento 20%",
      postType: "email",
      channel: "email",
      channelConfig: {
        subject: "☕ ¡20% de descuento en cafés de temporada! Solo esta semana",
        body: "Hola amante del café,\n\nEsta semana tenemos una oferta especial para ti: 20% de descuento en todos nuestros cafés de temporada.\n\nUsa el código: TEMP20 al momento de tu compra.\n\nVálido hasta el domingo.\n\n¡Te esperamos!\nCafé Central",
        bodyHtml: "<h2>¡Oferta Especial!</h2><p>20% de descuento en cafés de temporada</p><p><strong>Código: TEMP20</strong></p>",
        recipients: ["customers@cafecentral.es"],
        replyTo: "info@cafecentral.es",
      },
      content: {
        copy: "Email promocional con descuento especial",
        hashtags: [],
        mentions: [],
      },
      media: [
        {
          type: "image",
          urls: ["https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg"],
          alt: "Promoción café de temporada",
        },
      ],
      platforms: [],
      scheduling: { publishAt: new Date("2024-02-18T08:00:00Z"), timezone: "Europe/Madrid", isScheduled: true },
      status: "scheduled",
      analytics: { impressions: 0, engagement: 0, clicks: 0, shares: 0 },
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

    // Push Notification - Producto
    await ensurePost({
      tenantId,
      campaignId: camp1Id,
      clientId: techcorpId,
      title: "Push - Nueva función disponible",
      postType: "push",
      channel: "push_notification",
      channelConfig: {
        title: "🎉 Nueva función disponible",
        body: "Descubre nuestra nueva integración con IA. Pruébala ahora.",
        icon: "https://techcorp.com/icon.png",
        imageUrl: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg",
        clickAction: "/features/ai-integration",
        deepLink: "techcorp://features/ai",
        priority: "high",
        segmentation: {
          tags: ["premium_users", "early_adopters"],
        },
      },
      content: {
        copy: "Push notification para anuncio de nueva funcionalidad",
        hashtags: [],
        mentions: [],
      },
      media: [],
      platforms: [],
      scheduling: { publishAt: new Date("2024-02-21T10:00:00Z"), timezone: "Europe/Madrid", isScheduled: true },
      status: "approved",
      analytics: { impressions: 15200, engagement: 3840, clicks: 1824, shares: 0 },
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

    // Push Notification - Promoción
    await ensurePost({
      tenantId,
      campaignId: camp2Id,
      clientId: cafecentralId,
      title: "Push - Oferta flash 2x1",
      postType: "push",
      channel: "push_notification",
      channelConfig: {
        title: "🔥 Oferta Flash: 2x1 en cafés",
        body: "Solo por 2 horas. ¡Corre!",
        icon: "https://cafecentral.es/icon.png",
        clickAction: "/offers/flash-sale",
        deepLink: "cafecentral://offers/flash",
        priority: "high",
        segmentation: {
          allUsers: true,
        },
      },
      content: {
        copy: "Push notification para oferta flash limitada",
        hashtags: [],
        mentions: [],
      },
      media: [],
      platforms: [],
      scheduling: { publishAt: new Date("2024-02-19T14:00:00Z"), timezone: "Europe/Madrid", isScheduled: true },
      status: "published",
      analytics: { impressions: 4230, engagement: 1689, clicks: 845, shares: 0 },
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

    // Push Notification - Recordatorio
    await ensurePost({
      tenantId,
      campaignId: camp2Id,
      clientId: cafecentralId,
      title: "Push - Recordatorio programa fidelidad",
      postType: "push",
      channel: "push_notification",
      channelConfig: {
        title: "⭐ ¡Casi llegas a tu café gratis!",
        body: "Te faltan solo 2 sellos. Visítanos pronto.",
        icon: "https://cafecentral.es/icon.png",
        clickAction: "/loyalty",
        deepLink: "cafecentral://loyalty",
        priority: "normal",
        segmentation: {
          tags: ["loyalty_program"],
        },
      },
      content: {
        copy: "Push notification de recordatorio de programa de fidelidad",
        hashtags: [],
        mentions: [],
      },
      media: [],
      platforms: [],
      scheduling: { publishAt: new Date("2024-02-22T11:00:00Z"), timezone: "Europe/Madrid", isScheduled: true },
      status: "draft",
      analytics: { impressions: 0, engagement: 0, clicks: 0, shares: 0 },
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

    // ========== BRIEFS ==========
    await ensureBrief({
      tenantId,
      clientId: techcorpId,
      campaignId: camp1Id,
      title: "Brief - Lanzamiento Producto Tecnológico",
      description: "Brief completo para el lanzamiento del nuevo producto B2B",
      objectives: ["Posicionar el producto como líder", "Generar demanda inicial"],
      targetAudience: {
        demographics: { ageRange: "30-50 años", gender: "Todos", location: "España y LATAM", income: "Medio-alto" },
        psychographics: { interests: ["Tecnología", "Innovación", "Productividad"], behaviors: ["Early adopters", "Decisores de compra"], values: ["Eficiencia", "Calidad", "ROI"] },
        painPoints: ["Procesos manuales lentos", "Falta de integración", "Costos elevados"],
      },
      brandGuidelines: {
        toneOfVoice: "Profesional, innovador y confiable",
        keyMessages: ["Innovación que funciona", "Resultados medibles", "Soporte experto"],
        dosDonts: { dos: ["Usar datos y métricas", "Mostrar casos de éxito", "Ser específicos"], donts: ["Promesas vagas", "Jerga técnica excesiva", "Comparaciones directas"] },
        visualStyle: "Moderno, limpio, colores corporativos",
      },
      deliverables: [{ type: "campaign", quantity: 1, format: ["Digital", "Social Media"], platforms: ["linkedin", "twitter", "google-ads"], deadline: new Date("2024-03-01") }],
      budget: {
        total: 10000,
        breakdown: [
          { category: "Publicidad digital", amount: 6000, description: "Google Ads y LinkedIn Ads" },
          { category: "Contenido", amount: 2500, description: "Creación de posts y materiales" },
          { category: "Gestión", amount: 1500, description: "Gestión de campaña" },
        ],
      },
      timeline: {
        startDate: new Date("2024-01-15"),
        endDate: new Date("2024-04-15"),
        milestones: [
          { name: "Kick-off", date: new Date("2024-01-15"), description: "Inicio de campaña" },
          { name: "Review intermedio", date: new Date("2024-02-28"), description: "Evaluación de resultados" },
          { name: "Optimización", date: new Date("2024-03-15"), description: "Ajustes basados en datos" },
        ],
      },
      requirements: {
        mandatory: ["Aprobación de cliente", "Métricas semanales", "Reportes mensuales"],
        preferred: ["A/B testing", "Segmentación avanzada", "Retargeting"],
        restrictions: ["No mencionar competidores", "Cumplir GDPR", "Presupuesto fijo"],
      },
      success_metrics: {
        primary: ["Leads generados", "Costo por lead"],
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

    // ========== TAREAS ==========
    await ensureTask({
      tenantId,
      campaignId: camp1Id,
      clientId: techcorpId,
      title: "Diseñar creatividades para LinkedIn",
      description: "Crear 5 creatividades diferentes para la campaña de LinkedIn",
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
      clientId: cafecentralId,
      title: "Redactar copy para posts de Instagram",
      description: "Crear textos atractivos para 10 posts de Instagram sobre cafés de temporada",
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
      clientId: techcorpId,
      title: "Análisis de métricas Q1",
      description: "Revisar y analizar todas las métricas del primer trimestre",
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

    // ========== ASSETS ==========
    await ensureAsset({
      tenantId,
      clientId: techcorpId,
      campaignId: camp1Id,
      nombre: "Logo TechCorp Principal",
      tipo: "imagen",
      url: "https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg",
      scope: "campaigns",
      creadoPor: adminId,
      tags: ["logo", "branding", "techcorp", "oficial"],
      permisos: {
        editores: [adminId],
        visores: [adminId],
      },
      metadata: {
        name: "Logo TechCorp Principal",
        title: "Logo TechCorp Principal",
        description: "Logo oficial de TechCorp Solutions para uso en campañas",
        category: "branding",
        notes: "Imagen de Pexels - Free to use",
      },
    });

    await ensureAsset({
      tenantId,
      clientId: techcorpId,
      campaignId: camp1Id,
      nombre: "Banner LinkedIn - Innovación",
      tipo: "imagen",
      url: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg",
      scope: "campaigns",
      creadoPor: adminId,
      tags: ["linkedin", "banner", "innovación", "tecnología"],
      permisos: {
        editores: [adminId],
        visores: [adminId],
      },
      metadata: {
        name: "Banner LinkedIn - Innovación",
        title: "Banner LinkedIn - Innovación",
        description: "Banner para posts de LinkedIn sobre innovación tecnológica",
        category: "social-media",
        notes: "Optimizado para LinkedIn - Imagen de Pexels",
      },
    });

    await ensureAsset({
      tenantId,
      clientId: cafecentralId,
      campaignId: camp2Id,
      nombre: "Foto Café de Temporada",
      tipo: "imagen",
      url: "https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg",
      scope: "campaigns",
      creadoPor: adminId,
      tags: ["café", "temporada", "instagram", "producto"],
      permisos: {
        editores: [adminId],
        visores: [adminId],
      },
      metadata: {
        name: "Foto Café de Temporada",
        title: "Foto Café de Temporada",
        description: "Imagen principal para promoción de cafés de temporada",
        category: "producto",
        notes: "Optimizado para Instagram - Imagen de Pexels",
      },
    });

    await ensureAsset({
      tenantId,
      clientId: cafecentralId,
      nombre: "Guía de Brand Kit Café Central",
      tipo: "documento",
      url: "https://example.com/brandkit-cafecentral.pdf",
      scope: "brandkit",
      creadoPor: adminId,
      tags: ["brandkit", "guidelines", "documento", "marca"],
      permisos: {
        editores: [adminId],
        visores: [adminId],
      },
      metadata: {
        name: "Guía de Brand Kit Café Central",
        title: "Guía de Brand Kit Café Central",
        description: "Documento con directrices de marca para Café Central",
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
    console.log("🏢 Clients: TechCorp Solutions, Café Central");
    console.log("📁 Projects: Transformación Digital 2024, Experiencia Café Premium");
    console.log("🎯 Campaigns: Lanzamiento Producto 2024, Promoción Café de Temporada");
    console.log("📱 Posts: 12 posts created");
    console.log("   - Social Media: 7 posts (Instagram, Facebook, LinkedIn, TikTok, YouTube)");
    console.log("   - Email Marketing: 2 campaigns (Newsletter, Promotional)");
    console.log("   - Push Notifications: 3 notifications (Product, Promotion, Reminder)");
    console.log("📦 Assets: 4 assets created (logos, banners, documents)");
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
