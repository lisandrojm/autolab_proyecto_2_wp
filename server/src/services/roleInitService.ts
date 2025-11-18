import { Types } from "mongoose";
import { Role } from "../models/Role.js";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PERMISOS PARA ROL USER - SISTEMA SIMPLIFICADO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * El rol USER se crea sin permisos por defecto.
 * Los permisos deben ser asignados manualmente según las necesidades.
 */
const USER_PERMISSIONS: string[] = [];

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PERMISOS PARA ROL ADMIN - ACCESO COMPLETO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * El rol ADMIN tiene acceso completo a todos los módulos del sistema:
 * - Dashboard, Clientes, Calendario, Tareas, Asistente IA
 * - Roles y Usuarios del Sistema (gestión de accesos)
 * - Creative Suite, Settings
 * - Gestión completa de Campañas, Proyectos, Posts, Briefs, Assets
 * - Módulos de Recursos Humanos (RRHH)
 *
 * NOTA: Tenants es exclusivo para superadmin
 */
const ADMIN_PERMISSIONS = [
  // ──────────── Core Modules ────────────
  "dashboard:view",      // Dashboard

  // ──────────── Clientes ────────────
  "clients:view",        // Clientes (incluye selector y contexto)
  "clients:create",      // Crear clientes
  "clients:update",      // Actualizar clientes
  "clients:delete",      // Eliminar clientes

  // ──────────── Calendario y Tareas ────────────
  "calendar:view",       // Calendario
  "calendar:create",     // Crear eventos
  "calendar:update",     // Actualizar eventos
  "calendar:delete",     // Eliminar eventos
  "tasks:view",          // Tareas
  "tasks:create",        // Crear tareas
  "tasks:update",        // Actualizar tareas
  "tasks:delete",        // Eliminar tareas

  // ──────────── Asistente y Herramientas ────────────
  "assistant:view",      // Asistente IA
  "creative:view",       // Creative Suite
  "settings:view",       // Settings
  "analytics:view",      // Ver analíticas

  // ──────────── Administración de Accesos (SOLO ADMIN) ────────────
  "roles:view",          // Roles
  "roles:create",        // Crear roles
  "roles:update",        // Actualizar roles
  "roles:delete",        // Eliminar roles
  "users:view",          // Usuarios del Sistema
  "users:create",        // Crear usuarios
  "users:update",        // Actualizar usuarios
  "users:delete",        // Eliminar usuarios

  // ──────────── Gestión de Campañas ────────────
  "campaigns:view",      // Ver campañas
  "campaigns:create",    // Crear campañas
  "campaigns:update",    // Actualizar campañas
  "campaigns:delete",    // Eliminar campañas
  "projects:view",       // Ver proyectos
  "projects:create",     // Crear proyectos
  "projects:update",     // Actualizar proyectos
  "projects:delete",     // Eliminar proyectos
  "posts:view",          // Ver posts
  "posts:create",        // Crear posts
  "posts:update",        // Actualizar posts
  "posts:delete",        // Eliminar posts
  "briefs:view",         // Ver briefs
  "briefs:create",       // Crear briefs
  "briefs:update",       // Actualizar briefs
  "briefs:delete",       // Eliminar briefs
  "assets:view",         // Ver assets
  "assets:create",       // Crear assets
  "assets:update",       // Actualizar assets
  "assets:delete",       // Eliminar assets

  // ──────────── Módulos de Recursos Humanos (RRHH) ────────────
  "activityLogs:view",       // Registro de Actividades del Sistema
  "calendarEvents:view",     // Eventos de Calendario (RRHH)
  "employeeProfiles:view",   // Perfiles de Empleados
  "hrDocuments:view",        // Documentos de RRHH
  "orders:view",             // Pedidos de Material/Equipamiento
  "vacationRequests:view",   // Solicitudes de Vacaciones
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
      description: "Usuario estándar - Sin permisos por defecto, deben asignarse manualmente",
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
      description: "Administrador - Acceso completo a todos los módulos del sistema",
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
