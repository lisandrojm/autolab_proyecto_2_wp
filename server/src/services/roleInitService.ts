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
  "dashboard:view", // Dashboard

  // ──────────── Cliente Context ────────────
  "client:view", // Ver o no Cliente y select de cliente

  // ──────────── Admin GENERAL ────────────
  "admin_clients:view", // Clientes
  "admin_orders:view", // Pedidos
  "admin_vacations:view", // Vacaciones
  "admin_activity_logs:view", // Registro de novedades
  "admin_calendar:view", // Calendario
  "admin_employee_profiles:view", // Perfiles de empleados
  "admin_hr_documents:view", // Documentos RRHH

  // ──────────── Admin USUARIOS ────────────
  "admin_roles:view", // Roles
  "admin_areas:view", // Areas
  "admin_positions:view", // Cargos
  "admin_levels:view", // Niveles
  "admin_users:view", // Usuarios

  // ──────────── Configuracion ────────────
  "config_orders:view", // Pedidos
  "config_vacations:view", // Vacaciones
  "config_activity_logs:view", // Novedades
  "config_pdf_templates:view", // Plantillas PDF
];
const MOBILE_COLLABORATOR_PERMISSIONS = [
  "mobile_collaborator:view", // Permisos de colaborador mobile
];

const MOBILE_COORDINATOR_PERMISSIONS = [
  "mobile_coordinator:view", // Permisos de coordinador mobile
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
    const permsMatch = currentPerms.size === expectedPerms.size && Array.from(currentPerms).every((p) => expectedPerms.has(p));

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
    const permsMatch = currentPerms.size === expectedPerms.size && Array.from(currentPerms).every((p) => expectedPerms.has(p));

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
    "campaigns:read": "campaigns:view",
    "posts:read": "posts:view",
    "projects:read": "projects:view",
    "assets:read": "assets:view",
    "clients:read": "clients:view",
    "roles:view": "admin_roles:view",
    "areas:view": "admin_areas:view",
    "positions:view": "admin_positions:view",
    "levels:view": "admin_levels:view",
    "users:view": "admin_users:view",
    "mobile:access": "mobile_collaborator:view",
  };

  const roles = await Role.find({ tenantId: tid });

  for (const role of roles) {
    let needsUpdate = false;

    // 1) Mapear permisos antiguos a nuevos
    let updatedPermissions = role.permissions.map((perm) => {
      if (PERMISSION_MAPPING[perm]) {
        needsUpdate = true;
        return PERMISSION_MAPPING[perm];
      }
      return perm;
    });

    // 2) Filtrar: Solo permitir permisos que terminen en :view o sean el comodín *
    // Esto elimina permisos granulares (:edit, :delete, :create) que ya no son necesarios
    const filteredPermissions = updatedPermissions.filter(
      (perm) => perm === "*" || perm.endsWith(":view") || perm.startsWith("mobile_") // Mantener roles móviles
    );

    if (filteredPermissions.length !== updatedPermissions.length) {
      needsUpdate = true;
      updatedPermissions = filteredPermissions;
    }

    // 3) Eliminar duplicados
    const finalPermissions = [...new Set(updatedPermissions)];
    if (finalPermissions.length !== updatedPermissions.length) {
      needsUpdate = true;
    }

    if (needsUpdate) {
      role.permissions = finalPermissions;
      await role.save();
      console.log(`[RoleInit] ♻️ Migrated role ${role.name} permissions for tenant ${tid}`);
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
    const permsMatch = currentPerms.size === expectedPerms.size && Array.from(currentPerms).every((p) => expectedPerms.has(p));

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
    const permsMatch = currentPerms.size === expectedPerms.size && Array.from(currentPerms).every((p) => expectedPerms.has(p));

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
