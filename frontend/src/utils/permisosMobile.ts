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
 * Tiene que coincidir con `server/src/utils/permisosMobile.ts`.
 *
 * Tres reglas reemplazan a todos los chequeos por NOMBRE de rol que había desparramados por acá:
 *
 *   · Entra a la app quien tenga CUALQUIERA de estos permisos. No hay un permiso aparte de «acceso»:
 *     tener una tarjeta ES el acceso.
 *   · Entra a la plataforma quien tenga cualquier permiso que no sea de esta familia.
 *   · «Es coordinador» = puede cargar novedades. Era lo único que el rol Coordinador hacía de más que
 *     valga la pena preguntar.
 */
export const MOBILE_ACTIVITY_LOGS = "mobile_activity_logs:view"; // Novedades
export const MOBILE_ORDERS = "mobile_orders:view"; // Pedidos
export const MOBILE_VACATIONS = "mobile_vacations:view"; // Vacaciones
// La CLAVE sigue diciendo `users` porque renombrarla es migrar los roles de todos los tenants; lo
// que se ve es «Contratación», que es lo que la tarjeta hace: pedir un alta, no administrar gente.
export const MOBILE_USERS = "mobile_users:view"; // Contratación (solicitudes de alta)

/** En el orden en que se muestran, tanto en el editor de roles como en la ficha del usuario. */
export const MOBILE_ITEMS = [
  { permiso: MOBILE_ACTIVITY_LOGS, label: "Novedades" },
  { permiso: MOBILE_ORDERS, label: "Pedidos" },
  { permiso: MOBILE_VACATIONS, label: "Vacaciones" },
  { permiso: MOBILE_USERS, label: "Contratación" },
];

export const MOBILE_PERMISSIONS = MOBILE_ITEMS.map((i) => i.permiso);

/** Todo lo que no es del móvil es de la plataforma, incluidos el comodín y los permisos de SuperAdmin. */
export const esPermisoMobile = (permiso: string): boolean => permiso.startsWith("mobile_");

/** Los permisos de una persona son la UNIÓN de los de sus roles. Mismo criterio que el login. */
export const permisosDeRoles = (roles: Array<{ permissions?: string[] }> | undefined | null): Set<string> => new Set((roles || []).flatMap((r) => r?.permissions || []));

/** Atajo del caso que más se pregunta: ¿carga las novedades de su equipo? */
export const cargaNovedades = (roles: Array<{ permissions?: string[] }> | undefined | null): boolean => permisosDeRoles(roles).has(MOBILE_ACTIVITY_LOGS);
