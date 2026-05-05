import { Types } from "mongoose";
/**
 * Asegura que un tenant tenga los roles de sistema configurados correctamente
 */
export declare function ensureDefaultRoles(tenantId: Types.ObjectId | string): Promise<{
    adminRole: any;
    userRole: any;
}>;
/**
 * Actualiza permisos de roles existentes que usan el sistema antiguo (:read) al nuevo (:view)
 */
export declare function migrateRolePermissions(tenantId: Types.ObjectId | string): Promise<void>;
/**
 * Deprecated: Use ensureDefaultRoles which now handles mobile roles as system roles
 */
export declare function ensureMobileRoles(tenantId: Types.ObjectId | string): Promise<void>;
/**
 * Verifica que todos los tenants existentes tengan los roles correctos
 */
export declare function ensureAllTenantsHaveDefaultRoles(): Promise<void>;
