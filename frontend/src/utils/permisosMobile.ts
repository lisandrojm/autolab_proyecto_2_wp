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
/*
  NOVEDADES SON DOS COSAS DISTINTAS, y por eso dos permisos: el coordinador CARGA las novedades de su
  gente; el supervisor no carga nada, SIGUE cómo vienen cumpliendo sus coordinadores. La clave de
  «cargar» es la de siempre, así los roles existentes no cambian.
*/
export const MOBILE_ACTIVITY_LOGS = "mobile_activity_logs:view"; // Cargar novedades
export const MOBILE_ACTIVITY_COMPLIANCE = "mobile_activity_compliance:view"; // Seguimiento de novedades
export const MOBILE_TEAMS = "mobile_teams:view"; // Mis equipos
export const MOBILE_ORDERS = "mobile_orders:view"; // Pedidos
export const MOBILE_VACATIONS = "mobile_vacations:view"; // Vacaciones
// La CLAVE sigue diciendo `users` porque renombrarla es migrar los roles de todos los tenants; lo
// que se ve es «Contratación», que es lo que la tarjeta hace: pedir un alta, no administrar gente.
export const MOBILE_USERS = "mobile_users:view"; // Contratación (solicitudes de alta)
export const MOBILE_REGISTRO = "mobile_registro:view"; // Registro: link de registro y registrados

/**
 * En el orden en que se muestran, tanto en el editor de roles como en la ficha del usuario.
 *
 * `grupo` es el tema de la tarjeta en el editor (una acción nueva se suma como otra línea de su grupo)
 * y `ayuda` dice para quién es, que es lo que hace falta saber al tildar.
 *
 * `dentroDe` dice que esa acción no abre una pantalla propia sino una PESTAÑA de la del permiso
 * padre. El editor la dibuja indentada debajo, para que se lea dónde va a aparecer. No la subordina:
 * se puede tildar sola —el Coordinador tiene Cumplimiento y no carga novedades— y en ese caso la
 * pantalla se abre mostrando únicamente esa pestaña.
 */
export const MOBILE_ITEMS = [
  { permiso: MOBILE_ACTIVITY_LOGS, label: "Cargar novedades", grupo: "Novedades", ayuda: "Abre la pantalla Novedades, en la pestaña Historial: carga la asistencia de las personas de sus áreas y turnos. Es del supervisor." },
  // Ya no es una tarjeta propia del móvil: es la otra pestaña de Novedades, por eso va `dentroDe`.
  { permiso: MOBILE_ACTIVITY_COMPLIANCE, label: "Cumplimiento de novedades", grupo: "Novedades", dentroDe: MOBILE_ACTIVITY_LOGS, ayuda: "Agrega a Novedades la pestaña Cumplimiento: quién envió las suyas y a quién le falta. Es del coordinador. Se puede dar solo: quien no carga novedades entra y ve únicamente esta pestaña." },
  { permiso: MOBILE_TEAMS, label: "Mis equipos", grupo: "Equipo", ayuda: "Agrega «Equipos» a la barra de abajo de la app: las áreas y turnos que tiene a cargo, con su gente. Lo llevan las dos plantillas que trabajan con equipo, Supervisor y Coordinador." },
  { permiso: MOBILE_USERS, label: "Contratación", grupo: "Contratación", ayuda: "Pedir altas de personal." },
  { permiso: MOBILE_REGISTRO, label: "Registro", grupo: "Contratación", ayuda: "Compartir el link para que la gente se registre (vence según lo configurado en Usuarios → Link y se renueva solo) y ver, sin editar, quiénes se registraron." },
  { permiso: MOBILE_ORDERS, label: "Pedidos", grupo: "Personal", ayuda: "Sus propios pedidos." },
  { permiso: MOBILE_VACATIONS, label: "Vacaciones", grupo: "Personal", ayuda: "Sus propias vacaciones." },
];

export const MOBILE_GRUPOS = [...new Set(MOBILE_ITEMS.map((i) => i.grupo))];

export const MOBILE_PERMISSIONS = MOBILE_ITEMS.map((i) => i.permiso);

/**
 * CAPACIDADES: para qué se puede elegir a alguien, no qué pantallas ve.
 *
 * La jerarquía del proyecto no se puede deducir de lo que cada uno ve: Supervisor y Coordinador miran
 * las mismas cuatro tarjetas de la app y sin embargo uno aprueba lo que hace el otro. Preguntar
 * «¿puede coordinar un área?» por las tarjetas devolvía que sí para los dos.
 *
 * Tiene que coincidir con `server/src/utils/permisosMobile.ts`.
 */
export const PROJECT_SUPERVISOR = "project_supervisor:eligible";
export const PROJECT_COORDINATOR = "project_coordinator:eligible";

export const CAPACIDAD_ITEMS = [
  { permiso: PROJECT_SUPERVISOR, label: "Coordinador del Proyecto" },
  { permiso: PROJECT_COORDINATOR, label: "Supervisa áreas y turnos" },
];

export const CAPACIDAD_PERMISSIONS = CAPACIDAD_ITEMS.map((i) => i.permiso);

/**
 * PLANTILLAS DEL EDITOR DE ROLES: un punto de partida, no un rol cerrado.
 *
 * Aplicar una reemplaza lo de App Mobile y Proyectos por lo recomendado y deja intacto lo de
 * Plataforma; después se ajusta tildando. Son los mismos permisos con que nacen los roles de sistema
 * (`server/src/utils/permisosMobile.ts`): si se cambia uno, se cambia el otro.
 */
export const PLANTILLAS_ROL = [
  { nombre: "Colaborador", descripcion: "Carga lo suyo: pedidos y vacaciones.", permisos: [MOBILE_ORDERS, MOBILE_VACATIONS] },
  { nombre: "Supervisor", descripcion: "Supervisa áreas y turnos y carga las novedades de su gente.", permisos: [MOBILE_ACTIVITY_LOGS, MOBILE_TEAMS, MOBILE_USERS, MOBILE_REGISTRO, MOBILE_ORDERS, MOBILE_VACATIONS, PROJECT_COORDINATOR] },
  { nombre: "Coordinador", descripcion: "Coordina a los supervisores: sigue su cumplimiento y pide altas.", permisos: [MOBILE_ACTIVITY_COMPLIANCE, MOBILE_TEAMS, MOBILE_USERS, MOBILE_REGISTRO, PROJECT_SUPERVISOR] },
];

/**
 * Combinaciones que se pueden guardar pero no van a funcionar como uno espera. Se AVISAN, no se
 * bloquean: puede haber un motivo (un rol a medio armar, alguien que todavía no tiene equipo).
 */
export const avisosDeRol = (permisos: string[]): string[] => {
  const p = new Set(permisos);
  const avisos: string[] = [];
  if (p.has(MOBILE_ACTIVITY_LOGS) && !p.has(PROJECT_COORDINATOR)) avisos.push("«Cargar novedades» sin «Supervisa áreas y turnos»: no va a tener áreas ni turnos donde cargarlas.");
  if (p.has(PROJECT_COORDINATOR) && !p.has(MOBILE_ACTIVITY_LOGS)) avisos.push("«Supervisa áreas y turnos» sin «Cargar novedades»: puede quedar a cargo de turnos pero no va a poder cargar sus novedades, y aparecerán vencidas.");
  if (p.has(MOBILE_ACTIVITY_COMPLIANCE) && !p.has(PROJECT_SUPERVISOR)) avisos.push("«Seguimiento de novedades» sin «Coordinador del Proyecto»: no va a tener supervisores que seguir.");
  if (p.has(MOBILE_TEAMS) && !p.has(PROJECT_COORDINATOR) && !p.has(PROJECT_SUPERVISOR)) avisos.push("«Mis equipos» sin «Supervisa áreas y turnos» ni «Coordinador del Proyecto»: la pantalla va a estar vacía.");
  return avisos;
};


export const esPermisoMobile = (permiso: string): boolean => permiso.startsWith("mobile_");

/** Supervisor del Proyecto y Coordina áreas y turnos: el poder dentro del equipo, no una pantalla. */
export const esCapacidad = (permiso: string): boolean => permiso.endsWith(":eligible");

/**
 * Lo que abre la plataforma: todo lo que no es del móvil NI una capacidad (incluye el comodín y los
 * de SuperAdmin).
 *
 * Las capacidades no dan acceso a ningún lado: dicen si alguien supervisa coordinadores o coordina
 * colaboradores. Contarlas como plataforma hacía que un rol de campo con «Supervisor del Proyecto»
 * sumara «1 permiso» de Plataforma y que el login le ofreciera entrar a la web.
 */
export const esPermisoPlataforma = (permiso: string): boolean => !esPermisoMobile(permiso) && !esCapacidad(permiso);

/** Los permisos de una persona son la UNIÓN de los de sus roles. Mismo criterio que el login. */
export const permisosDeRoles = (roles: Array<{ permissions?: string[] }> | undefined | null): Set<string> => new Set((roles || []).flatMap((r) => r?.permissions || []));

/** Atajo del caso que más se pregunta: ¿carga las novedades de su equipo? */
export const cargaNovedades = (roles: Array<{ permissions?: string[] }> | undefined | null): boolean => permisosDeRoles(roles).has(MOBILE_ACTIVITY_LOGS);

/**
 * Quién puede recibir un área y un turno a cargo.
 *
 * Reemplaza al viejo «¿carga novedades?»: esa pregunta también la contestaba que sí el Supervisor, y
 * por eso cualquiera aparecía como candidato a coordinador.
 */
export const coordinaAreas = (roles: Array<{ permissions?: string[] }> | undefined | null): boolean => permisosDeRoles(roles).has(PROJECT_COORDINATOR);
