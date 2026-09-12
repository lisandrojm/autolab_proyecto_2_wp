import { Types } from "mongoose";
import { Role } from "../models/Role.js";

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
export const MOBILE_ACTIVITY_LOGS = "mobile_activity_logs:view"; // Novedades
export const MOBILE_ORDERS = "mobile_orders:view"; // Pedidos
export const MOBILE_VACATIONS = "mobile_vacations:view"; // Vacaciones
export const MOBILE_USERS = "mobile_users:view"; // Usuarios (solicitud de contratación)

export const ALL_MOBILE_PERMISSIONS = [MOBILE_ACTIVITY_LOGS, MOBILE_ORDERS, MOBILE_VACATIONS, MOBILE_USERS];

/** Lo que veía un Colaborador: sus pedidos y sus vacaciones. Es el piso de cualquier alta. */
export const MOBILE_BASE_PERMISSIONS = [MOBILE_ORDERS, MOBILE_VACATIONS];

/** Permisos que este cambio retira. Se traducen en `migrateMobileYResponsable`. */
export const LEGACY_MOBILE_COLLABORATOR = "mobile_collaborator:view";
export const LEGACY_MOBILE_COORDINATOR = "mobile_coordinator:view";
export const LEGACY_PROJECT_RESPONSIBLE = "project_responsible:eligible";

export const esPermisoMobile = (permiso: string): boolean => permiso.startsWith("mobile_");

/** Los permisos de una persona son la UNIÓN de los de sus roles. Mismo criterio que el login. */
export function permisosDeRoles(roles: Array<{ permissions?: string[] }> | undefined | null): Set<string> {
  return new Set((roles || []).flatMap((r) => r?.permissions || []));
}

/**
 * Resuelve los permisos efectivos a partir de una lista de IDs de rol. Se usa donde sólo se tienen
 * los ids —por ejemplo al validar el PATCH de un usuario contra los roles que vienen en el body—.
 */
export async function permisosDeRolesIds(tenantId: Types.ObjectId | string, roleIds: Array<Types.ObjectId | string>): Promise<Set<string>> {
  if (roleIds.length === 0) return new Set();
  const roles = await Role.find({ tenantId, _id: { $in: roleIds } }).select("permissions").lean();
  return permisosDeRoles(roles as Array<{ permissions?: string[] }>);
}

/** Los ids de los roles del tenant que otorgan un permiso dado. Para filtrar usuarios por permiso. */
export async function rolesConPermiso(tenantId: Types.ObjectId | string, permiso: string): Promise<Types.ObjectId[]> {
  const roles = await Role.find({ tenantId, permissions: permiso }).select("_id").lean();
  return roles.map((r) => r._id as Types.ObjectId);
}
