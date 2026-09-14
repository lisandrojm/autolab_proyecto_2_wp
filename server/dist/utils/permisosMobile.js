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
/*
  NOVEDADES SON DOS COSAS DISTINTAS, y por eso dos permisos.

  El coordinador CARGA las novedades de su gente. El supervisor no carga nada: SIGUE cómo vienen
  cumpliendo sus coordinadores, en el calendario de cumplimiento. Con un solo tilde no había forma de
  darle a uno sin darle al otro. La clave de «cargar» es la de siempre, así los roles existentes no cambian.
*/
export const MOBILE_ACTIVITY_LOGS = "mobile_activity_logs:view"; // Cargar novedades (coordinador)
export const MOBILE_ACTIVITY_COMPLIANCE = "mobile_activity_compliance:view"; // Seguimiento de novedades (supervisor)
export const MOBILE_TEAMS = "mobile_teams:view"; // Mis equipos
export const MOBILE_ORDERS = "mobile_orders:view"; // Pedidos
export const MOBILE_VACATIONS = "mobile_vacations:view"; // Vacaciones
export const MOBILE_USERS = "mobile_users:view"; // Contratación (solicitudes de alta)
/** Registro: generar el link de registro (7 días, se renueva solo) y ver, sin editar, quiénes se registraron. */
export const MOBILE_REGISTRO = "mobile_registro:view";
export const ALL_MOBILE_PERMISSIONS = [MOBILE_ACTIVITY_LOGS, MOBILE_ACTIVITY_COMPLIANCE, MOBILE_TEAMS, MOBILE_ORDERS, MOBILE_VACATIONS, MOBILE_USERS, MOBILE_REGISTRO];
/** Lo que veía un Colaborador: sus pedidos y sus vacaciones. Es el piso de cualquier alta. */
export const MOBILE_BASE_PERMISSIONS = [MOBILE_ORDERS, MOBILE_VACATIONS];
/**
 * ═══════════════════════════════════════════════════════════════════════
 * CAPACIDADES: PARA QUÉ SE PUEDE ELEGIR A ALGUIEN
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Los permisos de arriba dicen QUÉ PANTALLAS ve una persona. Estos dos dicen otra cosa: para qué se
 * la puede elegir. No destapan nada, y por eso van en su propio grupo en el editor de roles.
 *
 * Hacen falta porque la jerarquía del proyecto no se puede deducir de lo que cada uno ve: Supervisor
 * y Coordinador miran las mismas cuatro tarjetas de la app, y sin embargo uno aprueba lo que hace el
 * otro. Preguntar «¿puede coordinar un área?» por las tarjetas devolvía que sí para los dos, y eso
 * rompía la asignación de área y turno: cualquiera aparecía como candidato a coordinador.
 *
 *   Supervisor  — es el responsable del proyecto. Aprueba, controla y desaprueba lo de los coordinadores.
 *   Coordinador — tiene áreas y turnos a cargo, y carga las novedades de su gente.
 *   Colaborador — carga lo suyo.
 *
 * Van en el rol y no en la ficha de la persona: ser responsable de un proyecto ES lo que significa ser
 * Supervisor, no un atributo suelto que se tilda aparte.
 */
export const PROJECT_SUPERVISOR = "project_supervisor:eligible"; // Responsable de Proyecto
export const PROJECT_COORDINATOR = "project_coordinator:eligible"; // Coordina áreas y turnos
export const ALL_CAPACIDADES = [PROJECT_SUPERVISOR, PROJECT_COORDINATOR];
/**
 * Con qué nacen los roles de sistema. Son los mismos que ofrecen las plantillas del editor de roles
 * (`frontend/src/utils/permisosMobile.ts`): si se cambia uno, se cambia el otro.
 */
export const PERMISOS_COORDINADOR = [MOBILE_ACTIVITY_LOGS, MOBILE_TEAMS, MOBILE_USERS, MOBILE_REGISTRO, MOBILE_ORDERS, MOBILE_VACATIONS, PROJECT_COORDINATOR];
export const PERMISOS_SUPERVISOR = [MOBILE_ACTIVITY_COMPLIANCE, MOBILE_TEAMS, MOBILE_USERS, MOBILE_REGISTRO, PROJECT_SUPERVISOR];
export const esCapacidad = (permiso) => permiso.endsWith(":eligible");
/** Permisos que este cambio retira. Se traducen en `migrateMobileYResponsable`. */
export const LEGACY_MOBILE_COLLABORATOR = "mobile_collaborator:view";
export const LEGACY_MOBILE_COORDINATOR = "mobile_coordinator:view";
/*
  El responsable de proyecto pasó por tres formas: este permiso, después un tilde en la ficha de la
  persona (`User.isProjectResponsible`), y ahora `PROJECT_SUPERVISOR`. Las dos primeras se traducen a
  la tercera en la migración; se conservan acá sólo para poder reconocerlas.
*/
export const LEGACY_PROJECT_RESPONSIBLE = "project_responsible:eligible";
export const esPermisoMobile = (permiso) => permiso.startsWith("mobile_");
/**
 * Lo que abre la plataforma: todo lo que no es del móvil NI una capacidad.
 *
 * Las capacidades no dan acceso a ningún lado —dicen si alguien supervisa coordinadores o coordina
 * colaboradores—. Contarlas como plataforma hacía que un rol de campo con «Supervisor del Proyecto»
 * entrara por el selector de portal y se le ofreciera la web.
 */
export const esPermisoPlataforma = (permiso) => !esPermisoMobile(permiso) && !esCapacidad(permiso);
/** Los permisos de una persona son la UNIÓN de los de sus roles. Mismo criterio que el login. */
export function permisosDeRoles(roles) {
    return new Set((roles || []).flatMap((r) => r?.permissions || []));
}
/**
 * Resuelve los permisos efectivos a partir de una lista de IDs de rol. Se usa donde sólo se tienen
 * los ids —por ejemplo al validar el PATCH de un usuario contra los roles que vienen en el body—.
 */
export async function permisosDeRolesIds(tenantId, roleIds) {
    if (roleIds.length === 0)
        return new Set();
    const roles = await Role.find({ tenantId, _id: { $in: roleIds } }).select("permissions").lean();
    return permisosDeRoles(roles);
}
/** Los ids de los roles del tenant que otorgan un permiso dado. Para filtrar usuarios por permiso. */
export async function rolesConPermiso(tenantId, permiso) {
    const roles = await Role.find({ tenantId, permissions: permiso }).select("_id").lean();
    return roles.map((r) => r._id);
}
