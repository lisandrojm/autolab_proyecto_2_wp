import { Types } from "mongoose";
import { Role } from "../models/Role.js";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PERMISOS PARA ROL USER - SISTEMA SIMPLIFICADO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * El rol USER tiene acceso a TODO EXCEPTO:
 * - Usuarios del Sistema (users:view)
 * - Roles (roles:view)
 *
 * PERMISOS BASADOS EN ITEMS DEL NAVBAR:
 * - Dashboard: Vista principal
 * - Clientes: Gestión completa (incluye selector de contexto)
 * - Calendario: Vista de calendario
 * - Tareas: Gestión de tareas
 * - Asistente IA: Acceso al asistente inteligente
 * - Creative Suite: Acceso a herramientas creativas
 * - Settings: Configuración de preferencias del usuario
 */
const USER_PERMISSIONS = [
  "dashboard:view",      // Dashboard
  "clients:view",        // Clientes (incluye selector y contexto)
  "calendar:view",       // Calendario
  "tasks:view",          // Tareas
  "assistant:view",      // Asistente IA
  "creative:view",       // Creative Suite
  "settings:view",       // Settings
];

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PERMISOS PARA ROL ADMIN - SISTEMA SIMPLIFICADO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * El rol ADMIN tiene acceso completo a todos los items del navbar:
 * - Dashboard
 * - Clientes (incluye selector y contexto)
 * - Calendario
 * - Tareas
 * - Asistente IA
 * - Roles (exclusivo admin)
 * - Usuarios del Sistema (exclusivo admin)
 * - Creative Suite
 * - Settings (configuración de preferencias)
 *
 * NOTA: Tenants está excluido porque solo es visible para superadmin
 */
const ADMIN_PERMISSIONS = [
  "dashboard:view",      // Dashboard
  "clients:view",        // Clientes (incluye selector y contexto)
  "calendar:view",       // Calendario
  "tasks:view",          // Tareas
  "assistant:view",      // Asistente IA
  "roles:view",          // Roles - SOLO ADMIN
  "users:view",          // Usuarios del Sistema - SOLO ADMIN
  "creative:view",       // Creative Suite
  "settings:view",       // Settings
];

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PERMISOS PARA MÓDULO MOBILE
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Permisos específicos para el acceso a la aplicación mobile:
 * - mobile:access - Permiso base para acceder a /mobile
 * - mobile:collaborator - Permisos de colaborador en la app mobile
 * - mobile:coordinator - Permisos de coordinador en la app mobile
 */
const MOBILE_COLLABORATOR_PERMISSIONS = [
  "mobile:access",       // Acceso base a la app mobile
  "mobile:collaborator", // Permisos de colaborador mobile
];

const MOBILE_COORDINATOR_PERMISSIONS = [
  "mobile:access",       // Acceso base a la app mobile
  "mobile:coordinator",  // Permisos de coordinador mobile
];

/**
 * Asegura que un tenant tenga los roles admin y user configurados correctamente
 */
export async function ensureDefaultRoles(tenantId: Types.ObjectId | string): Promise<{
  userRole: any;
  adminRole: any;
}> {
  const tid = new Types.ObjectId(tenantId);

  console.log(`[RoleInit] Ensuring default roles for tenant: ${tid}`);

  // ════════ CREAR/VERIFICAR ROL USER ════════
  let userRole = await Role.findOne({
    tenantId: tid,
    name: { $regex: /^user$/i },
  });

  if (!userRole) {
    console.log(`[RoleInit] Creating USER role for tenant: ${tid}`);
    userRole = await Role.create({
      tenantId: tid,
      name: "user",
      description: "Usuario estándar - Acceso completo excepto Usuarios y Roles del sistema",
      permissions: USER_PERMISSIONS,
      isDefault: true,
    });
    console.log(`[RoleInit] ✅ USER role created: ${userRole._id}`);
  } else {
    console.log(`[RoleInit] ✔️ USER role already exists: ${userRole._id}`);

    // Actualizar permisos y configuración
    let needsUpdate = false;

    if (!userRole.isDefault) {
      userRole.isDefault = true;
      needsUpdate = true;
    }

    // Actualizar permisos si han cambiado
    const currentPerms = new Set(userRole.permissions);
    const expectedPerms = new Set(USER_PERMISSIONS);
    const permsMatch =
      currentPerms.size === expectedPerms.size &&
      Array.from(currentPerms).every((p) => expectedPerms.has(p));

    if (!permsMatch) {
      userRole.permissions = USER_PERMISSIONS;
      needsUpdate = true;
      console.log(`[RoleInit] ♻️ Updating USER role permissions`);
    }

    if (needsUpdate) {
      await userRole.save();
      console.log(`[RoleInit] ♻️ USER role updated`);
    }
  }

  // ════════ CREAR/VERIFICAR ROL ADMIN ════════
  let adminRole = await Role.findOne({
    tenantId: tid,
    name: { $regex: /^admin$/i },
  });

  if (!adminRole) {
    console.log(`[RoleInit] Creating ADMIN role for tenant: ${tid}`);
    adminRole = await Role.create({
      tenantId: tid,
      name: "admin",
      description: "Administrador - Acceso total incluyendo gestión de usuarios y roles",
      permissions: ADMIN_PERMISSIONS,
      isDefault: false,
    });
    console.log(`[RoleInit] ✅ ADMIN role created: ${adminRole._id}`);
  } else {
    console.log(`[RoleInit] ✔️ ADMIN role already exists: ${adminRole._id}`);

    // Actualizar permisos y configuración
    let needsUpdate = false;

    if (adminRole.isDefault) {
      adminRole.isDefault = false;
      needsUpdate = true;
    }

    // Actualizar permisos si han cambiado
    const currentPerms = new Set(adminRole.permissions);
    const expectedPerms = new Set(ADMIN_PERMISSIONS);
    const permsMatch =
      currentPerms.size === expectedPerms.size &&
      Array.from(currentPerms).every((p) => expectedPerms.has(p));

    if (!permsMatch) {
      adminRole.permissions = ADMIN_PERMISSIONS;
      needsUpdate = true;
      console.log(`[RoleInit] ♻️ Updating ADMIN role permissions`);
    }

    if (needsUpdate) {
      await adminRole.save();
      console.log(`[RoleInit] ♻️ ADMIN role updated`);
    }
  }

  const roleCount = await Role.countDocuments({ tenantId: tid });
  console.log(`[RoleInit] Total roles for tenant ${tid}: ${roleCount}`);

  return { userRole, adminRole };
}

/**
 * Actualiza permisos de roles existentes que usan el sistema antiguo (:read) al nuevo (:view)
 */
export async function migrateRolePermissions(tenantId: Types.ObjectId | string): Promise<void> {
  const tid = new Types.ObjectId(tenantId);

  const PERMISSION_MAPPING: Record<string, string> = {
    'campaigns:read': 'campaigns:view',
    'posts:read': 'posts:view',
    'briefs:read': 'briefs:view',
    'projects:read': 'projects:view',
    'assets:read': 'assets:view',
    'clients:read': 'clients:view',
  };

  // Actualizar rol client si existe
  const clientRole = await Role.findOne({
    tenantId: tid,
    name: { $regex: /^(client|cliente)$/i },
  });

  if (clientRole) {
    let needsUpdate = false;
    const updatedPermissions = clientRole.permissions.map(perm => {
      if (PERMISSION_MAPPING[perm]) {
        needsUpdate = true;
        return PERMISSION_MAPPING[perm];
      }
      return perm;
    });

    if (needsUpdate) {
      clientRole.permissions = updatedPermissions;
      await clientRole.save();
      console.log(`[RoleInit] ♻️ Migrated CLIENT role permissions from :read to :view`);
    }
  }

  // Actualizar rol manager si existe
  const managerRole = await Role.findOne({
    tenantId: tid,
    name: { $regex: /^manager$/i },
  });

  if (managerRole) {
    let needsUpdate = false;
    const updatedPermissions = managerRole.permissions.map(perm => {
      if (PERMISSION_MAPPING[perm]) {
        needsUpdate = true;
        return PERMISSION_MAPPING[perm];
      }
      return perm;
    });

    if (needsUpdate) {
      managerRole.permissions = updatedPermissions;
      await managerRole.save();
      console.log(`[RoleInit] ♻️ Migrated MANAGER role permissions from :read to :view`);
    }
  }
}

/**
 * Asegura que un tenant tenga los roles mobile configurados correctamente
 */
export async function ensureMobileRoles(tenantId: Types.ObjectId | string): Promise<{
  collaboratorRole: any;
  coordinatorRole: any;
}> {
  const tid = new Types.ObjectId(tenantId);

  console.log(`[RoleInit] Ensuring mobile roles for tenant: ${tid}`);

  // ════════ CREAR/VERIFICAR ROL MOBILE COLABORADOR ════════
  let collaboratorRole = await Role.findOne({
    tenantId: tid,
    name: { $regex: /^Mobile - Colaborador$/i },
  });

  if (!collaboratorRole) {
    console.log(`[RoleInit] Creating MOBILE COLLABORATOR role for tenant: ${tid}`);
    collaboratorRole = await Role.create({
      tenantId: tid,
      name: "Mobile - Colaborador",
      description: "Colaborador de la app mobile - Acceso a funciones básicas",
      permissions: MOBILE_COLLABORATOR_PERMISSIONS,
      isDefault: false,
    });
    console.log(`[RoleInit] ✅ MOBILE COLLABORATOR role created: ${collaboratorRole._id}`);
  } else {
    console.log(`[RoleInit] ✔️ MOBILE COLLABORATOR role already exists: ${collaboratorRole._id}`);

    // Actualizar permisos si han cambiado
    const currentPerms = new Set(collaboratorRole.permissions);
    const expectedPerms = new Set(MOBILE_COLLABORATOR_PERMISSIONS);
    const permsMatch =
      currentPerms.size === expectedPerms.size &&
      Array.from(currentPerms).every((p) => expectedPerms.has(p));

    if (!permsMatch) {
      collaboratorRole.permissions = MOBILE_COLLABORATOR_PERMISSIONS;
      await collaboratorRole.save();
      console.log(`[RoleInit] ♻️ Updated MOBILE COLLABORATOR role permissions`);
    }
  }

  // ════════ CREAR/VERIFICAR ROL MOBILE COORDINADOR ════════
  let coordinatorRole = await Role.findOne({
    tenantId: tid,
    name: { $regex: /^Mobile - Coordinador$/i },
  });

  if (!coordinatorRole) {
    console.log(`[RoleInit] Creating MOBILE COORDINATOR role for tenant: ${tid}`);
    coordinatorRole = await Role.create({
      tenantId: tid,
      name: "Mobile - Coordinador",
      description: "Coordinador de la app mobile - Acceso a funciones avanzadas de gestión",
      permissions: MOBILE_COORDINATOR_PERMISSIONS,
      isDefault: false,
    });
    console.log(`[RoleInit] ✅ MOBILE COORDINATOR role created: ${coordinatorRole._id}`);
  } else {
    console.log(`[RoleInit] ✔️ MOBILE COORDINATOR role already exists: ${coordinatorRole._id}`);

    // Actualizar permisos si han cambiado
    const currentPerms = new Set(coordinatorRole.permissions);
    const expectedPerms = new Set(MOBILE_COORDINATOR_PERMISSIONS);
    const permsMatch =
      currentPerms.size === expectedPerms.size &&
      Array.from(currentPerms).every((p) => expectedPerms.has(p));

    if (!permsMatch) {
      coordinatorRole.permissions = MOBILE_COORDINATOR_PERMISSIONS;
      await coordinatorRole.save();
      console.log(`[RoleInit] ♻️ Updated MOBILE COORDINATOR role permissions`);
    }
  }

  return { collaboratorRole, coordinatorRole };
}

/**
 * Verifica que todos los tenants existentes tengan los roles correctos
 */
export async function ensureAllTenantsHaveDefaultRoles(): Promise<void> {
  try {
    const { Tenant } = await import("../models/Tenant.js");
    const tenants = await Tenant.find({});

    console.log(`[RoleInit] Verifying ${tenants.length} tenants have default roles...`);

    let tenantsProcessed = 0;
    let rolesCreated = 0;
    let rolesUpdated = 0;

    for (const tenant of tenants) {
      const tenantId = new Types.ObjectId(tenant._id as any);
      const rolesBefore = await Role.countDocuments({ tenantId });

      await ensureDefaultRoles(tenantId);
      await ensureMobileRoles(tenantId);
      await migrateRolePermissions(tenantId);

      const rolesAfter = await Role.countDocuments({ tenantId });

      if (rolesAfter > rolesBefore) {
        rolesCreated += rolesAfter - rolesBefore;
      }

      tenantsProcessed++;
    }

    console.log(`[RoleInit] Verification complete:`);
    console.log(`  - Tenants processed: ${tenantsProcessed}`);
    console.log(`  - New roles created: ${rolesCreated}`);
    console.log(`  - Roles updated: ${rolesUpdated}`);
  } catch (error) {
    console.error("[RoleInit] Error ensuring roles for all tenants:", error);
    throw error;
  }
}
