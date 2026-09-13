import { Types } from 'mongoose';
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
 * Quien tenía el tilde «Responsable de Proyecto» en su ficha pasa a tener el rol Supervisor.
 *
 * Ser responsable de un proyecto pasó por tres formas: un permiso del rol, un tilde suelto en la ficha
 * de la persona, y ahora una capacidad del rol Supervisor —que es lo que siempre fue, porque eso ES
 * ser Supervisor—. Esta función cierra el círculo: sin ella, los que estaban marcados dejarían de
 * aparecer en el selector de responsable de un proyecto de un día para el otro.
 *
 * El tilde NO se borra. Ya no se lee, pero es el único registro de quiénes estaban marcados y borrarlo
 * no aporta nada: si esto sale mal, es por dónde se empieza a mirar.
 */
export declare function migrarJerarquiaDeProyecto(tenantId: Types.ObjectId | string): Promise<void>;
export declare function migrateMobileYResponsable(tenantId: Types.ObjectId | string): Promise<void>;
/**
 * Deprecated: Use ensureDefaultRoles which now handles mobile roles as system roles
 */
export declare function ensureMobileRoles(tenantId: Types.ObjectId | string): Promise<void>;
/**
 * Verifica que todos los tenants existentes tengan los roles correctos
 */
export declare function ensureAllTenantsHaveDefaultRoles(): Promise<void>;
