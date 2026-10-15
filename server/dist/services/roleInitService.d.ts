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
export declare function migrateMobileYResponsable(tenantId: Types.ObjectId | string): Promise<void>;
/**
 * LAS CAPACIDADES DE PROYECTOS VAN UNA POR ROL DE SISTEMA: «Supervisa áreas y turnos» es del rol
 * Supervisor y «Coordinador del Proyecto» es del rol Coordinador. Es la única configuración de roles que
 * el arranque SÍ corrige, y a propósito: las etiquetas de la ficha de cada persona («Supervisa áreas y
 * turnos») salen de las capacidades de sus roles, y con las dos tildadas en «Coordinador» todo
 * coordinador figuraba como supervisor aunque le sacaran el rol Supervisor. Desde que asignar a alguien
 * a un área/turno le pone solo el rol Supervisor (ver `PUT /projects/:id`), un coordinador que
 * supervisa tiene los dos roles, y cada etiqueta vuelve a decir la verdad.
 *
 * Idempotente: sólo escribe si hay algo que corregir, y sólo en los dos roles de sistema por nombre.
 */
export declare function alinearCapacidadesDeRolesDeSistema(tenantId: Types.ObjectId | string): Promise<void>;
/**
 * Deprecated: Use ensureDefaultRoles which now handles mobile roles as system roles
 */
export declare function ensureMobileRoles(tenantId: Types.ObjectId | string): Promise<void>;
/**
 * Verifica que todos los tenants existentes tengan los roles correctos
 */
export declare function ensureAllTenantsHaveDefaultRoles(): Promise<void>;
