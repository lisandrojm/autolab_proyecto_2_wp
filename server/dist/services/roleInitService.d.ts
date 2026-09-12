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
 * ═══════════════════════════════════════════════════════════════════════
 * MIGRACIÓN: los dos roles Mobile se vuelven permisos, y «responsable» se vuelve del usuario
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Es idempotente y corre en cada arranque, como el resto de las migraciones de este archivo. Hace
 * cuatro cosas, y el orden importa:
 *
 *   1. Marca `isProjectResponsible` en las personas que HOY son elegibles como responsables. Va
 *      primero porque esa elegibilidad se lee de los roles y el paso 2 la borra. El criterio es el
 *      mismo que usaba `GET /users/eligible-responsables`: el permiso, o un rol que diga «responsable».
 *   2. Traduce los permisos cerrados del móvil a los granulares y saca el de elegibilidad.
 *   3. Baja `isSystem` de los dos roles Mobile: dejan de ser intocables y pasan a editarse, renombrarse
 *      o borrarse desde Usuarios → Roles como cualquier otro. NO se borran acá: los permisos viven en
 *      el rol, así que borrarlos dejaría sin app a todos los usuarios importados.
 *   4. Se asegura de que el rol POR DEFECTO del tenant abra la app. Es el que reciben las altas
 *      —import de FRAME y link de registro—, que antes recibían Mobile-Colaborador buscándolo por
 *      nombre con tres expresiones regulares distintas entre sí.
 */
export declare function migrateMobileYResponsable(tenantId: Types.ObjectId | string): Promise<void>;
/**
 * Deprecated: Use ensureDefaultRoles which now handles mobile roles as system roles
 */
export declare function ensureMobileRoles(tenantId: Types.ObjectId | string): Promise<void>;
/**
 * Verifica que todos los tenants existentes tengan los roles correctos
 */
export declare function ensureAllTenantsHaveDefaultRoles(): Promise<void>;
