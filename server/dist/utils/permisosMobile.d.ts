import { Types } from "mongoose";
/**
 * ═══════════════════════════════════════════════════════════════════════
 * LOS PERMISOS DE LA APP MOBILE, EN UN SOLO LUGAR
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Un permiso por tarjeta de la pantalla de inicio del móvil. Antes esto eran DOS roles cerrados
 * —Mobile-Colaborador y Mobile-Coordinador— y lo que cada uno mostraba estaba escrito en el código de
 * la app: no había manera de decir «este rol ve Pedidos pero no Vacaciones». Ahora se tildan de a uno
 * en Usuarios → Roles, igual que los de la plataforma.
 *
 * Dos reglas que reemplazan a todos los chequeos por NOMBRE de rol que había desparramados:
 *
 *   · Entra a la app quien tenga CUALQUIERA de estos permisos. No hay un permiso aparte de «acceso»:
 *     tener una tarjeta ES el acceso.
 *   · Entra a la plataforma quien tenga cualquier permiso que no sea de esta familia.
 *
 * Y una tercera, la que más se busca: «es coordinador» = puede cargar novedades. Era lo único que el
 * rol Coordinador hacía de más que valga la pena preguntar.
 */
export declare const MOBILE_ACTIVITY_LOGS = "mobile_activity_logs:view";
export declare const MOBILE_ORDERS = "mobile_orders:view";
export declare const MOBILE_VACATIONS = "mobile_vacations:view";
export declare const MOBILE_USERS = "mobile_users:view";
export declare const ALL_MOBILE_PERMISSIONS: string[];
/** Lo que veía un Colaborador: sus pedidos y sus vacaciones. Es el piso de cualquier alta. */
export declare const MOBILE_BASE_PERMISSIONS: string[];
/** Permisos que este cambio retira. Se traducen en `migrateMobileYResponsable`. */
export declare const LEGACY_MOBILE_COLLABORATOR = "mobile_collaborator:view";
export declare const LEGACY_MOBILE_COORDINATOR = "mobile_coordinator:view";
export declare const LEGACY_PROJECT_RESPONSIBLE = "project_responsible:eligible";
export declare const esPermisoMobile: (permiso: string) => boolean;
/** Los permisos de una persona son la UNIÓN de los de sus roles. Mismo criterio que el login. */
export declare function permisosDeRoles(roles: Array<{
    permissions?: string[];
}> | undefined | null): Set<string>;
/**
 * Resuelve los permisos efectivos a partir de una lista de IDs de rol. Se usa donde sólo se tienen
 * los ids —por ejemplo al validar el PATCH de un usuario contra los roles que vienen en el body—.
 */
export declare function permisosDeRolesIds(tenantId: Types.ObjectId | string, roleIds: Array<Types.ObjectId | string>): Promise<Set<string>>;
/** Los ids de los roles del tenant que otorgan un permiso dado. Para filtrar usuarios por permiso. */
export declare function rolesConPermiso(tenantId: Types.ObjectId | string, permiso: string): Promise<Types.ObjectId[]>;
