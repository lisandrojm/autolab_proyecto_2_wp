import { Types } from 'mongoose';
import { Role } from '../models/Role.js';
import { cleanupDuplicateMobileRoles } from './roleCleanupService.js';
/**
 * ═══════════════════════════════════════════════════════════════════════
 * PERMISOS PARA ROL USER - SISTEMA SIMPLIFICADO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * El rol USER se crea sin permisos por defecto.
 * Los permisos deben ser asignados manualmente según las necesidades.
 */
const USER_PERMISSIONS = [];
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
    'dashboard:view', // Dashboard
    // ──────────── Cliente Context ────────────
    'client:view', // Ver o no Cliente y select de cliente
    // ──────────── Admin GENERAL ────────────
    'admin_clients:view', // Clientes
    'admin_projects:view', // Proyectos
    'admin_sedes:view', // Sedes
    'admin_contracts:view', // Contratos
    'admin_orders:view', // Pedidos
    'admin_vacations:view', // Vacaciones
    'admin_activity_logs:view', // Novedades
    'admin_hr_documents:view', // Documentos RRHH
    // ──────────── Admin USUARIOS ────────────
    'admin_roles:view', // Roles (permisos de la plataforma)
    'admin_roles_empresa:view', // Roles Empresa (los rol_frame: Actor, Animador 2D, …)
    'admin_areas:view', // Areas
    'admin_users:view', // Usuarios
    'admin_users_import:view', // Import WP
    // ──────────── Configuracion ────────────
    'config_orders:view', // Pedidos
    'config_shifts:view', // Turnos
    'config_vacations:view', // Vacaciones
    'config_activity_logs:view', // Novedades
    'config_pdf_templates:view', // Plantillas | Pedidos | Vacaciones
    'config_releases:view', // Releases
    'config_holidays:view', // Feriados
    'config_frame_functions:view', // Funciones FRAME
    'config_categorias_sat:view', // Categorías SAT
    'config_bancos:view', // Bancos
    'config_obras_sociales:view', // Obras Sociales
    'config_arca_sucursales:view', // ARCA: sucursales (domicilios de desempeño)
    'config_arca_tablas:view', // ARCA: tablas oficiales (modalidad de contratación / liquidación, tipo de servicio)
    'config_convenios:view', // Convenios Colectivos de Trabajo
    'config_sindicatos:view', // Sindicatos (a los que se afilia una persona)
    'config_centros_costo:view', // Centros de Costos
    'config_contratos_frame:view', // Contratos FRAME
    'config_empresas:view', // Empresas
    'config_membretes:view', // Empresa/s | Membrete/s y firma
    'config_profile:view', // Mi Perfil
    'config_escaneo_dropbox:view', // Documentos (Dropbox) — configuración del escaneo automático
    'config_afip:view', // AFIP — conexión con el Padrón de AFIP
    // ──────────── Proyectos ────────────
];
const MOBILE_COLLABORATOR_PERMISSIONS = [
    'mobile_collaborator:view', // Permisos de colaborador mobile
];
const MOBILE_COORDINATOR_PERMISSIONS = [
    'mobile_coordinator:view', // Permisos de coordinador mobile
];
/**
 * Helper para asegurar la existencia y sincronización de un rol
 */
async function ensureRole(tenantId, name, permissions = [], description = '', isDefault = false, isSystem = false) {
    let role = await Role.findOne({ tenantId, name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (!role) {
        console.log(`[RoleInit] Creating ${name} role for tenant: ${tenantId}`);
        role = await Role.create({
            tenantId,
            name,
            description: description || `${name} role`,
            permissions,
            isDefault,
            isSystem,
        });
        console.log(`[RoleInit] ✅ ${name} role created: ${role._id}`);
    }
    else {
        // Sincronizar configuración básica
        let hasChanges = false;
        if (role.isDefault !== isDefault) {
            role.isDefault = isDefault;
            hasChanges = true;
        }
        if (role.isSystem !== isSystem) {
            role.isSystem = isSystem;
            hasChanges = true;
        }
        // Sincronizar permisos esenciales (unión)
        const currentPerms = new Set(role.permissions);
        const missingPerms = permissions.filter((p) => !currentPerms.has(p));
        if (missingPerms.length > 0) {
            role.permissions = [...role.permissions, ...missingPerms];
            hasChanges = true;
            console.log(`[RoleInit] ♻️ Adding missing permissions to ${name} role: ${missingPerms.join(', ')}`);
        }
        if (hasChanges) {
            await role.save();
            console.log(`[RoleInit] ♻️ ${name} role updated`);
        }
    }
    return role;
}
/**
 * Asegura que un tenant tenga los roles de sistema configurados correctamente
 */
export async function ensureDefaultRoles(tenantId) {
    const tid = new Types.ObjectId(tenantId);
    // ════════ SKIP FOR SUPERADMIN TENANT ════════
    const { Tenant } = await import('../models/Tenant.js');
    const tenant = await Tenant.findById(tid);
    if (tenant?.isSystem || tenant?.slug === 'superadmin') {
        console.log(`[RoleInit] Skipping default roles creation for system tenant: ${tenant?.slug}`);
        // Aún así necesitamos devolver los roles si existen para evitar errores en los callers
        const adminRole = await Role.findOne({ tenantId: tid, name: { $regex: /^Admin$/i } });
        const userRole = await Role.findOne({ tenantId: tid, name: { $regex: /^User$/i } });
        return { adminRole, userRole };
    }
    // 1. Admin (Sistema)
    const adminRole = await ensureRole(tid, 'Admin', ADMIN_PERMISSIONS, 'Administrador - Acceso completo a todos los módulos del sistema', false, true);
    // 2. Responsable de Proyecto (Sistema)
    const responsablePerms = ['client:view', 'admin_clients:view', 'admin_orders:view', 'admin_vacations:view', 'admin_activity_logs:view', 'mobile_collaborator:view', 'project_responsible:eligible'];
    await ensureRole(tid, 'Responsable de Proyecto', responsablePerms, 'Rol de responsable de proyectos', false, true);
    // 3. Mobile-Coordinador (Sistema)
    await ensureRole(tid, 'Mobile-Coordinador', MOBILE_COORDINATOR_PERMISSIONS, 'Rol de coordinador para app mobile', false, true);
    // 4. Mobile-Colaborador (Sistema)
    await ensureRole(tid, 'Mobile-Colaborador', MOBILE_COLLABORATOR_PERMISSIONS, 'Rol de colaborador para app mobile', false, true);
    // 5. User (Por defecto)
    const userRole = await ensureRole(tid, 'User', USER_PERMISSIONS, 'Usuario estándar - Sin permisos por defecto', true, false);
    return { adminRole, userRole };
}
/**
 * Actualiza permisos de roles existentes que usan el sistema antiguo (:read) al nuevo (:view)
 */
export async function migrateRolePermissions(tenantId) {
    const tid = new Types.ObjectId(tenantId);
    const PERMISSION_MAPPING = {
        'campaigns:read': 'campaigns:view',
        'posts:read': 'posts:view',
        'projects:read': 'projects:view',
        'assets:read': 'assets:view',
        'clients:read': 'clients:view',
        'roles:view': 'admin_roles:view',
        'areas:view': 'admin_areas:view',
        'users:view': 'admin_users:view',
        'mobile:access': 'mobile_collaborator:view',
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
        // 2) Filtrar: Solo permitir permisos que terminen en :view, :eligible o sean el comodín *
        // Esto elimina permisos granulares (:edit, :delete, :create) que ya no son necesarios
        const filteredPermissions = updatedPermissions.filter((perm) => perm === '*' || perm.endsWith(':view') || perm.endsWith(':eligible') || perm.startsWith('mobile_'));
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
 * Deprecated: Use ensureDefaultRoles which now handles mobile roles as system roles
 */
export async function ensureMobileRoles(tenantId) {
    await ensureDefaultRoles(tenantId);
}
/**
 * Verifica que todos los tenants existentes tengan los roles correctos
 */
export async function ensureAllTenantsHaveDefaultRoles() {
    try {
        const { Tenant } = await import('../models/Tenant.js');
        const tenants = await Tenant.find({});
        console.log(`[RoleInit] Verifying ${tenants.length} tenants have default roles...`);
        let tenantsProcessed = 0;
        let rolesCreated = 0;
        let rolesUpdated = 0;
        for (const tenant of tenants) {
            const tenantId = new Types.ObjectId(tenant._id);
            const rolesBefore = await Role.countDocuments({ tenantId });
            await ensureDefaultRoles(tenantId);
            // Automatic cleanup of duplicates on startup
            await cleanupDuplicateMobileRoles(tenantId, false);
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
    }
    catch (error) {
        console.error('[RoleInit] Error ensuring roles for all tenants:', error);
        throw error;
    }
}
