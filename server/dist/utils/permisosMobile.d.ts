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
export declare const MOBILE_ACTIVITY_COMPLIANCE = "mobile_activity_compliance:view";
export declare const MOBILE_TEAMS = "mobile_teams:view";
export declare const MOBILE_ORDERS = "mobile_orders:view";
export declare const MOBILE_VACATIONS = "mobile_vacations:view";
export declare const MOBILE_USERS = "mobile_users:view";
/** Plantillas de equipo: pestaña de Contratación para contratar a un equipo fijo de una vez. */
export declare const MOBILE_HIRING_TEMPLATES = "mobile_hiring_templates:view";
/** Registro: generar el link de registro (7 días, se renueva solo) y ver, sin editar, quiénes se registraron. */
export declare const MOBILE_REGISTRO = "mobile_registro:view";
export declare const ALL_MOBILE_PERMISSIONS: string[];
/** Lo que veía un Colaborador: sus pedidos y sus vacaciones. Es el piso de cualquier alta. */
export declare const MOBILE_BASE_PERMISSIONS: string[];
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
export declare const PROJECT_SUPERVISOR = "project_supervisor:eligible";
export declare const PROJECT_COORDINATOR = "project_coordinator:eligible";
export declare const ALL_CAPACIDADES: string[];
/**
 * Con qué nacen los roles de sistema. Son los mismos que ofrecen las plantillas del editor de roles
 * (`frontend/src/utils/permisosMobile.ts`): si se cambia uno, se cambia el otro.
 */
export declare const PERMISOS_COORDINADOR: string[];
export declare const PERMISOS_SUPERVISOR: string[];
export declare const esCapacidad: (permiso: string) => boolean;
/** Permisos que este cambio retira. Se traducen en `migrateMobileYResponsable`. */
export declare const LEGACY_MOBILE_COLLABORATOR = "mobile_collaborator:view";
export declare const LEGACY_MOBILE_COORDINATOR = "mobile_coordinator:view";
export declare const LEGACY_PROJECT_RESPONSIBLE = "project_responsible:eligible";
export declare const esPermisoMobile: (permiso: string) => boolean;
/**
 * Lo que abre la plataforma: todo lo que no es del móvil NI una capacidad.
 *
 * Las capacidades no dan acceso a ningún lado —dicen si alguien supervisa coordinadores o coordina
 * colaboradores—. Contarlas como plataforma hacía que un rol de campo con «Supervisor del Proyecto»
 * entrara por el selector de portal y se le ofreciera la web.
 */
export declare const esPermisoPlataforma: (permiso: string) => boolean;
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
