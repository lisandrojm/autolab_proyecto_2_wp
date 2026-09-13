import { Types } from 'mongoose';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { ALL_MOBILE_PERMISSIONS, LEGACY_MOBILE_COLLABORATOR, LEGACY_MOBILE_COORDINATOR, LEGACY_PROJECT_RESPONSIBLE, MOBILE_BASE_PERMISSIONS, MOBILE_ORDERS, PERMISOS_COORDINADOR, PERMISOS_SUPERVISOR, PROJECT_COORDINATOR, PROJECT_SUPERVISOR } from '../utils/permisosMobile.js';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PERMISOS PARA ROL USER - SISTEMA SIMPLIFICADO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * El rol USER no da nada de la plataforma, pero SÍ el piso del móvil: es el rol «por defecto» del
 * tenant y, desde este cambio, es el que reciben los usuarios importados de FRAME y los que entran
 * por el link de registro. Si no trajera los permisos del móvil, esas altas quedarían sin poder
 * abrir la app —que es exactamente para lo que se las da de alta—.
 */
const USER_PERMISSIONS: string[] = [...MOBILE_BASE_PERMISSIONS];

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PERMISOS PARA ROL ADMIN - ACCESO COMPLETO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * El rol ADMIN tiene acceso completo a todos los módulos del sistema:
 * - Dashboard, Clientes, Calendario, Tareas, Asistente IA
 * - Roles y Usuarios del Sistema (gestión de accesos)
 * - Creative Suite, Settings
 * - Gestión completa de Campañas, Proyectos, Posts, Briefs, Assets
 * - Módulos de Recursos Humanos (RRHH)
 *
 * NOTA: Tenants es exclusivo para superadmin
 */
const ADMIN_PERMISSIONS = [
  // ──────────── Core Modules ────────────
  'dashboard:view', // Dashboard

  // ──────────── Cliente Context ────────────
  'client:view', // Ver o no Cliente y select de cliente

  // ──────────── Admin GENERAL ────────────
  'admin_clients:view', // Clientes
  'admin_projects:view', // Proyectos
  'admin_sedes:view', // Sedes
  'admin_contracts:view', // Contratos
  'admin_orders:view', // Pedidos
  'admin_vacations:view', // Vacaciones
  'admin_activity_logs:view', // Novedades
  'admin_hr_documents:view', // Documentos RRHH

  // ──────────── Admin USUARIOS ────────────
  'admin_roles:view', // Roles (permisos de la plataforma)
  'admin_roles_empresa:view', // Roles Empresa (los rol_frame: Actor, Animador 2D, …)
  'admin_areas:view', // Areas
  'admin_users:view', // Usuarios
  'admin_users_import:view', // Import WP

  // ──────────── Configuracion ────────────
  'config_orders:view', // Pedidos
  'config_shifts:view', // Turnos
  'config_vacations:view', // Vacaciones
  'config_activity_logs:view', // Novedades
  'config_pdf_templates:view', // Plantillas | Pedidos | Vacaciones
  'config_releases:view', // Releases
  'config_holidays:view', // Feriados
  'config_frame_functions:view', // Funciones FRAME
  'config_categorias_sat:view', // Categorías SAT
  'config_bancos:view', // Bancos
  'config_obras_sociales:view', // Obras Sociales
  'config_arca_sucursales:view', // ARCA: sucursales (domicilios de desempeño)
  'config_arca_tablas:view', // ARCA: tablas oficiales (modalidad de contratación / liquidación, tipo de servicio)
  'config_convenios:view', // Convenios de Trabajo
  'config_sindicatos:view', // Sindicatos (a los que se afilia una persona)
  'config_centros_costo:view', // Centros de Costos
  'config_contratos_frame:view', // Contratos FRAME
  'config_empresas:view', // Empresas
  'config_membretes:view', // Empresa/s | Membrete/s y firma
  'config_profile:view', // Mi Perfil
  'config_escaneo_dropbox:view', // Documentos (Dropbox) — configuración del escaneo automático
  'config_afip:view', // AFIP — conexión con el Padrón de AFIP

  /*
    ──────────── App Mobile ────────────

    Admin es «acceso completo», así que también entra a la app. Hacía falta decirlo: el servidor deja
    pasar a un Admin por cualquier `requirePermission` (ver `middleware/permissions.ts`), pero el
    front NO lo hace —`hasPermission` sólo bypassea a superadmin— y la app mobile lee los permisos
    crudos justamente para no heredar ese bypass. Estaba parchado a mano y de forma desprolija: el
    seed de arranque le daba `mobile_collaborator:view` al Admin y este archivo no.
  */
  ...ALL_MOBILE_PERMISSIONS,
];

/**
 * Helper para asegurar la existencia y sincronización de un rol
 */
/*
  El nombre se ESCAPA antes de meterlo en el regex.

  Los nombres los escribe una persona desde la pantalla de Roles, y cualquier metacarácter —un punto,
  un paréntesis, una barra vertical— convertiría la búsqueda en otra cosa. Pasó con «Mobile |
  Colaborador»: en una expresión regular esa barra significa "o", así que `^Mobile | Colaborador$` se
  leía como "empieza con Mobile " O "termina con Colaborador", y los tres roles se pisaban entre sí.
*/
const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `sincronizarPermisos`: si al rol que ya existe se le agregan en cada arranque los permisos que le
 * falten. Sirve para Admin, que tiene que recibir los módulos nuevos de la plataforma. Para los roles
 * de la app NO: su configuración es de quien los edita, y reinyectar lo que se destildó —«Cargar
 * novedades» en Supervisor, por ejemplo— deshacía el cambio en el próximo reinicio sin avisar.
 */
async function ensureRole(tenantId: Types.ObjectId, name: string, permissions: string[] = [], description = '', isDefault = false, isSystem = false, sincronizarPermisos = true) {
  let role = await Role.findOne({ tenantId, name: { $regex: new RegExp(`^${escaparRegex(name)}$`, 'i') } });

  if (!role) {
    console.log(`[RoleInit] Creating ${name} role for tenant: ${tenantId}`);
    role = await Role.create({
      tenantId,
      name,
      description: description || `${name} role`,
      permissions,
      isDefault,
      isSystem,
    });
    console.log(`[RoleInit] ✅ ${name} role created: ${role._id}`);
  } else {
    // Sincronizar configuración básica
    let hasChanges = false;

    if (role.isDefault !== isDefault) {
      role.isDefault = isDefault;
      hasChanges = true;
    }

    if (role.isSystem !== isSystem) {
      role.isSystem = isSystem;
      hasChanges = true;
    }

    // Sincronizar permisos esenciales (unión)
    const currentPerms = new Set(role.permissions);
    const missingPerms = sincronizarPermisos ? permissions.filter((p) => !currentPerms.has(p)) : [];

    if (missingPerms.length > 0) {
      role.permissions = [...role.permissions, ...missingPerms];
      hasChanges = true;
      console.log(`[RoleInit] ♻️ Adding missing permissions to ${name} role: ${missingPerms.join(', ')}`);
    }

    if (hasChanges) {
      await role.save();
      console.log(`[RoleInit] ♻️ ${name} role updated`);
    }
  }
  return role;
}

/**
 * Asegura que un tenant tenga los roles de sistema configurados correctamente
 */
export async function ensureDefaultRoles(tenantId: Types.ObjectId | string): Promise<{ adminRole: any; userRole: any }> {
  const tid = new Types.ObjectId(tenantId);

  // ════════ SKIP FOR SUPERADMIN TENANT ════════
  const { Tenant } = await import('../models/Tenant.js');
  const tenant = await Tenant.findById(tid);

  if (tenant?.isSystem || tenant?.slug === 'superadmin') {
    console.log(`[RoleInit] Skipping default roles creation for system tenant: ${tenant?.slug}`);
    // Aún así necesitamos devolver los roles si existen para evitar errores en los callers
    const adminRole = await Role.findOne({ tenantId: tid, name: { $regex: /^Admin$/i } });
    const userRole = await Role.findOne({ tenantId: tid, name: { $regex: /^User$/i } });
    return { adminRole, userRole };
  }

  // 1. Admin (Sistema)
  const adminRole = await ensureRole(tid, 'Admin', ADMIN_PERMISSIONS, 'Administrador - Acceso completo a todos los módulos del sistema', false, true);

  /*
    2, 3 y 4. LOS TRES ROLES DEL MÓVIL, que son los que sí tiene sentido que sean de sistema.

    Son los que reciben las altas y los que la gente reconoce por nombre, así que conviene que existan
    siempre y que nadie los borre sin querer. Lo que ven SÍ se edita: son permisos como cualquier otro.

    Nacen con lo de las plantillas del editor: el Coordinador CARGA novedades, el Supervisor SIGUE el
    cumplimiento de sus coordinadores. Los permisos se ponen sólo al CREARLOS (`sincronizarPermisos`
    en false): después son de quien los edita, y destildar algo no se revierte en el próximo arranque.
  */
  await ensureRole(tid, 'Supervisor', PERMISOS_SUPERVISOR, 'Supervisa a los coordinadores: sigue su cumplimiento de novedades', false, true, false);
  await ensureRole(tid, 'Coordinador', PERMISOS_COORDINADOR, 'Tiene áreas y turnos a cargo, y carga las novedades de su gente', false, true, false);
  await ensureRole(tid, 'Colaborador', MOBILE_BASE_PERMISSIONS, 'Sus pedidos y sus vacaciones desde la app', true, true, false);

  /*
    EL ROL «RESPONSABLE DE PROYECTO» YA NO SE CREA, y la migración lo borra.

    Existía para marcar quién podía quedar a cargo de un proyecto, y eso pasó a ser un tilde en la
    ficha de la persona: el rol quedó nombrando algo que ya no decide. Ser responsable de un proyecto
    no es un rol —no destapa pantallas—, es un atributo de la persona, y con el tilde alcanza.
  */

  /*
    EL ROL «USER» YA NO SE CREA, y la migración lo borra.

    Nombraba una categoría, no un trabajo: todo el mundo es un usuario. El rol POR DEFECTO —el que
    reciben las altas importadas de FRAME y las del link de registro— pasa a ser «Colaborador», que
    dice qué hace esa persona y da exactamente lo mismo que daba User: sus pedidos y sus vacaciones.

    `ensureDefaultRoles` devuelve el rol por defecto como `userRole` porque así lo esperan sus
    llamadores; lo que cambió es cuál es, no el contrato de la función.
  */
  const userRole = await Role.findOne({ tenantId: tid, isDefault: true });

  return { adminRole, userRole };
}

/**
 * Actualiza permisos de roles existentes que usan el sistema antiguo (:read) al nuevo (:view)
 */
export async function migrateRolePermissions(tenantId: Types.ObjectId | string): Promise<void> {
  const tid = new Types.ObjectId(tenantId);

  const PERMISSION_MAPPING: Record<string, string> = {
    'campaigns:read': 'campaigns:view',
    'posts:read': 'posts:view',
    'projects:read': 'projects:view',
    'assets:read': 'assets:view',
    'clients:read': 'clients:view',
    'roles:view': 'admin_roles:view',
    'areas:view': 'admin_areas:view',
    'users:view': 'admin_users:view',
    'mobile:access': MOBILE_ORDERS,
  };

  const roles = await Role.find({ tenantId: tid });

  for (const role of roles) {
    let needsUpdate = false;

    // 1) Mapear permisos antiguos a nuevos
    let updatedPermissions = role.permissions.map((perm) => {
      if (PERMISSION_MAPPING[perm]) {
        needsUpdate = true;
        return PERMISSION_MAPPING[perm];
      }
      return perm;
    });

    /*
      2) Filtrar: sólo `:view`, `:eligible`, los del móvil y el comodín `*`.

      Elimina permisos granulares (:edit, :delete, :create) que ya no se usan. `:eligible` estuvo un
      rato fuera de esta lista —cuando el responsable de proyecto era un tilde en la ficha— y hay que
      tenerlo presente: mientras estuvo afuera, este filtro BORRABA las capacidades en cada arranque,
      justo después de que `ensureDefaultRoles` las agregara. El síntoma era un rol que se "actualiza"
      todas las veces y nunca queda como debe.
    */
    const filteredPermissions = updatedPermissions.filter((perm) => perm === '*' || perm.endsWith(':view') || perm.endsWith(':eligible') || perm.startsWith('mobile_'));

    if (filteredPermissions.length !== updatedPermissions.length) {
      needsUpdate = true;
      updatedPermissions = filteredPermissions;
    }

    // 3) Eliminar duplicados
    const finalPermissions = [...new Set(updatedPermissions)];
    if (finalPermissions.length !== updatedPermissions.length) {
      needsUpdate = true;
    }

    if (needsUpdate) {
      role.permissions = finalPermissions;
      await role.save();
      console.log(`[RoleInit] ♻️ Migrated role ${role.name} permissions for tenant ${tid}`);
    }
  }
}

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
/**
 * Lleva el rol viejo al nombre nuevo, sin dejar a su gente por el camino.
 *
 * Los roles del móvil pasaron de «Mobile-Colaborador» a «Colaborador». Renombrar es lo
 * correcto y no mover usuarios de un rol a otro: apuntan al rol por id, así que el rol con los 1371
 * usuarios adentro sigue siendo el mismo, sólo que ahora se llama distinto.
 *
 * El caso feo es que el nombre nuevo YA exista —porque el seed lo creó antes, o porque alguien lo armó
 * a mano—: ahí no se puede renombrar (el índice único de tenant + nombre lo rechaza) y quedarían dos
 * roles que significan lo mismo, con la gente en el que nadie mira. Entonces se fusionan: los permisos
 * del viejo se suman al nuevo, sus usuarios pasan al nuevo, y el viejo se borra.
 */
async function renombrar(tid: Types.ObjectId, patron: RegExp, nombreNuevo: string): Promise<void> {
  const viejo = await Role.findOne({ tenantId: tid, name: { $regex: patron }, $expr: { $ne: ['$name', nombreNuevo] } });
  if (!viejo) return;

  const destino = await Role.findOne({ tenantId: tid, name: nombreNuevo });

  if (!destino) {
    const anterior = viejo.name;
    viejo.name = nombreNuevo;
    viejo.isSystem = true;
    await viejo.save();
    console.log(`[RoleInit] ♻️ Rol "${anterior}" renombrado a "${nombreNuevo}" (tenant ${tid})`);
    return;
  }

  // Fusión. Los permisos se UNEN: si alguien le había agregado algo al viejo, no se pierde.
  const faltantes = viejo.permissions.filter((p) => !destino.permissions.includes(p));
  if (faltantes.length > 0) {
    destino.permissions = [...destino.permissions, ...faltantes];
    await destino.save();
  }

  const movidos = await User.updateMany({ tenantId: tid, roles: viejo._id }, { $addToSet: { roles: destino._id } });
  await User.updateMany({ tenantId: tid, roles: viejo._id }, { $pull: { roles: viejo._id } });
  await Role.deleteOne({ _id: viejo._id });
  console.log(`[RoleInit] ♻️ Rol "${viejo.name}" fusionado en "${nombreNuevo}": ${movidos.modifiedCount} usuario/s movido/s (tenant ${tid})`);
}

/**
 * La descripción con la que una versión anterior de esta migración creó el rol puente «Proyectos».
 * Se usa para reconocerlo y borrarlo sin tocar un rol que el tenant haya armado con ese mismo nombre.
 */
const DESCRIPCION_ROL_PUENTE = 'Acceso de escritorio de quien lleva proyectos (reemplaza al viejo rol Responsable de Proyecto)';

/**
 * Borra el rol «Responsable de Proyecto».
 *
 * Marcaba quién podía quedar a cargo de un proyecto, y eso dejó de ser un rol: es un tilde en la ficha
 * de la persona (`isProjectResponsible`), que es lo único que hace falta para que aparezca en el
 * selector de responsable. El paso 1 de esta migración ya se lo puso a todos los que lo tenían, así
 * que para cuando llega acá no queda nada que rescatar del rol.
 *
 * Lo que el rol traía ADEMÁS eran cinco permisos de escritorio, y quien los siga necesitando va a
 * quedarse sin ellos: es a propósito. Eran de un rol que nombraba otra cosa, y si esas personas tienen
 * que ver Clientes o Pedidos, eso se les da con un rol que diga eso.
 */
async function retirarRolResponsable(tid: Types.ObjectId): Promise<void> {
  const aBorrar = await Role.find({
    tenantId: tid,
    $or: [
      { name: { $regex: /^responsable de proyecto$/i } },
      // El rol puente que creó una versión anterior de esta migración, antes de que quedara claro que
      // el tilde del usuario alcanza. Se reconoce por su descripción, no sólo por el nombre.
      { name: 'Proyectos', description: DESCRIPCION_ROL_PUENTE },
    ],
  });

  for (const rol of aBorrar) {
    const { modifiedCount } = await User.updateMany({ tenantId: tid, roles: rol._id }, { $pull: { roles: rol._id } });
    await Role.deleteOne({ _id: rol._id });
    console.log(`[RoleInit] 🗑️ Rol "${rol.name}" eliminado, desasignado de ${modifiedCount} usuario/s (tenant ${tid})`);
  }
}

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
export async function migrarJerarquiaDeProyecto(tenantId: Types.ObjectId | string): Promise<void> {
  const tid = new Types.ObjectId(tenantId);

  /*
    VA DESPUÉS DE `ensureDefaultRoles`, y el orden importa: necesita el rol Supervisor con su
    capacidad ya puesta, que es lo que `ensureDefaultRoles` acaba de asegurar. Corriendo antes, la
    primera vez no lo encontraría y se saltearía en silencio.

    `retirarRolUser`, en cambio, va ANTES —dentro de `migrateMobileYResponsable`—: ver su comentario.
  */
  await migrarResponsablesASupervisor(tid);
}

async function migrarResponsablesASupervisor(tid: Types.ObjectId): Promise<void> {
  const supervisor = await Role.findOne({ tenantId: tid, permissions: PROJECT_SUPERVISOR }).select('_id name');
  if (!supervisor) return;

  const { modifiedCount } = await User.updateMany({ tenantId: tid, isProjectResponsible: true, roles: { $ne: supervisor._id } }, { $addToSet: { roles: supervisor._id } });

  if (modifiedCount > 0) {
    console.log(`[RoleInit] ♻️ ${modifiedCount} responsable/s de proyecto recibieron el rol "${supervisor.name}" (tenant ${tid})`);
  }
}

/**
 * Retira el rol «User»: su gente pasa a «Colaborador», que queda como rol por defecto.
 *
 * «User» nombraba una categoría, no un trabajo —todo el mundo es un usuario— y daba exactamente lo
 * mismo que Colaborador: los pedidos y las vacaciones propias. El rol por defecto importa: es el que
 * reciben las altas importadas de FRAME y las del link de registro.
 *
 * El orden NO es negociable, y por dos motivos. Uno: el índice `{tenantId, isDefault}` es único y
 * parcial, así que hay que sacarle la marca a «User» antes de ponérsela a Colaborador. El otro: esto
 * tiene que correr ANTES de `ensureDefaultRoles`, que es quien marca a Colaborador como por defecto —
 * si «User» todavía la tiene, ese `save()` muere con un duplicate key.
 */
async function retirarRolUser(tid: Types.ObjectId): Promise<void> {
  const colaborador = await Role.findOne({ tenantId: tid, name: { $regex: /^colaborador$/i } });
  if (!colaborador) return; // Sin a dónde mover a la gente, no se toca nada.

  const viejo = await Role.findOne({ tenantId: tid, name: { $regex: /^user$/i } });
  if (viejo) {
    const { modifiedCount } = await User.updateMany({ tenantId: tid, roles: viejo._id }, { $addToSet: { roles: colaborador._id } });
    await User.updateMany({ tenantId: tid, roles: viejo._id }, { $pull: { roles: viejo._id } });
    await Role.deleteOne({ _id: viejo._id });
    console.log(`[RoleInit] 🗑️ Rol "User" eliminado; ${modifiedCount} usuario/s pasaron a "Colaborador" (tenant ${tid})`);
  }

  if (!colaborador.isDefault) {
    // Por las dudas: si quedó otro marcado, se le saca la marca antes (índice único parcial).
    await Role.updateMany({ tenantId: tid, isDefault: true, _id: { $ne: colaborador._id } }, { $set: { isDefault: false } });
    colaborador.isDefault = true;
    await colaborador.save();
    console.log(`[RoleInit] ♻️ "Colaborador" es ahora el rol por defecto (tenant ${tid})`);
  }
}

export async function migrateMobileYResponsable(tenantId: Types.ObjectId | string): Promise<void> {
  const tid = new Types.ObjectId(tenantId);

  // El tenant de administración de plataforma sólo tiene el rol Superadmin: no tiene app, ni rol por
  // defecto, ni nada que migrar. Sin esto avisaría en cada arranque de algo que está bien así.
  const { Tenant } = await import('../models/Tenant.js');
  const tenant = await Tenant.findById(tid);
  if (tenant?.isSystem || tenant?.slug === 'superadmin') return;

  const roles = await Role.find({ tenantId: tid });

  // ── 1) La elegibilidad de responsable pasa del rol a la persona ──
  const idsElegibles = roles.filter((r) => r.permissions.includes(LEGACY_PROJECT_RESPONSIBLE) || /responsable/i.test(r.name)).map((r) => r._id);

  if (idsElegibles.length > 0) {
    const { modifiedCount } = await User.updateMany({ tenantId: tid, roles: { $in: idsElegibles }, isProjectResponsible: { $ne: true } }, { $set: { isProjectResponsible: true } });
    if (modifiedCount > 0) {
      console.log(`[RoleInit] ♻️ ${modifiedCount} usuario/s marcado/s como Responsable de Proyecto (tenant ${tid})`);
    }
  }

  // ── 2 y 3) Permisos cerrados → granulares; los roles Mobile dejan de ser de sistema ──
  const esRolMobile = /^mobile[ _-]*(colaborador|coordinador)$/i;

  for (const role of roles) {
    const permisos = new Set(role.permissions);

    if (permisos.delete(LEGACY_MOBILE_COLLABORATOR)) {
      MOBILE_BASE_PERMISSIONS.forEach((p) => permisos.add(p));
    }
    if (permisos.delete(LEGACY_MOBILE_COORDINATOR)) {
      // Lo que hace un coordinador, no todo el móvil: el seguimiento de novedades es del supervisor.
      PERMISOS_COORDINADOR.filter((p) => p !== PROJECT_COORDINATOR).forEach((p) => permisos.add(p));
    }
    permisos.delete(LEGACY_PROJECT_RESPONSIBLE);

    const finales = [...permisos];
    const cambioPermisos = finales.length !== role.permissions.length || finales.some((p) => !role.permissions.includes(p));
    const dejaDeSerSistema = role.isSystem && esRolMobile.test(role.name.trim());

    if (cambioPermisos || dejaDeSerSistema) {
      role.permissions = finales;
      if (dejaDeSerSistema) role.isSystem = false;
      await role.save();
      console.log(`[RoleInit] ♻️ Rol "${role.name}" migrado a los permisos nuevos (tenant ${tid})`);
    }
  }

  /*
    ── 4) Los roles del móvil se llaman por el oficio, sin prefijo ──

    Pasaron por «Mobile-Colaborador» y por «Mobile | Colaborador» antes de quedar en «Colaborador». El
    prefijo sobra: el rol se elige desde una pantalla que ya dice de qué se trata, y lo que hace lo
    dicen sus permisos —que son de App Mobile— no su nombre. El patrón acepta las tres formas para que
    cualquier base, sin importar en qué paso quedó, termine en el mismo lugar.
  */
  await renombrar(tid, /^mobile[ |_-]*colaborador$/i, 'Colaborador');
  await renombrar(tid, /^mobile[ |_-]*coordinador$/i, 'Coordinador');
  await renombrar(tid, /^mobile[ |_-]*supervisor$/i, 'Supervisor');

  // ── 5) «Responsable de Proyecto» se retira, sin dejar a nadie sin escritorio ──
  await retirarRolResponsable(tid);

  // ── 6) El rol «User» se retira: el por defecto pasa a ser «Colaborador» ──
  await retirarRolUser(tid);


  // ── 6) El rol por defecto tiene que abrir la app ──
  const rolPorDefecto = await Role.findOne({ tenantId: tid, isDefault: true });
  if (rolPorDefecto) {
    const faltantes = MOBILE_BASE_PERMISSIONS.filter((p) => !rolPorDefecto.permissions.includes(p));
    if (faltantes.length > 0) {
      rolPorDefecto.permissions = [...rolPorDefecto.permissions, ...faltantes];
      await rolPorDefecto.save();
      console.log(`[RoleInit] ♻️ Rol por defecto "${rolPorDefecto.name}": + ${faltantes.join(', ')} (tenant ${tid})`);
    }
  } else if (roles.length > 0) {
    // Un tenant sin NINGÚN rol es uno recién creado: `ensureDefaultRoles`, que corre a continuación,
    // le va a armar el rol por defecto. Avisar ahí sería una alarma por algo que se resuelve solo.
    console.warn(`[RoleInit] ⚠️ El tenant ${tid} no tiene rol por defecto: las altas van a quedar sin acceso a la app.`);
  }
}

/**
 * Deprecated: Use ensureDefaultRoles which now handles mobile roles as system roles
 */
export async function ensureMobileRoles(tenantId: Types.ObjectId | string): Promise<void> {
  await ensureDefaultRoles(tenantId);
}

/**
 * Verifica que todos los tenants existentes tengan los roles correctos
 */
export async function ensureAllTenantsHaveDefaultRoles(): Promise<void> {
  try {
    const { Tenant } = await import('../models/Tenant.js');
    const tenants = await Tenant.find({});

    console.log(`[RoleInit] Verifying ${tenants.length} tenants have default roles...`);

    let tenantsProcessed = 0;
    let rolesCreated = 0;
    let rolesUpdated = 0;

    for (const tenant of tenants) {
      const tenantId = new Types.ObjectId(tenant._id as any);
      const rolesBefore = await Role.countDocuments({ tenantId });

      /*
        LA MIGRACIÓN VA PRIMERO, y el orden no es casual.

        `ensureDefaultRoles` crea los roles «Mobile | …» si no existen. Si corriera antes, encontraría
        el nombre libre y crearía tres roles vacíos; después la migración querría renombrar
        «Mobile-Colaborador» a un nombre ya ocupado y no podría, dejando los 1371 usuarios en el rol
        viejo y tres roles nuevos sin nadie adentro. Migrar primero deja que el renombre agarre el rol
        que tiene a la gente, y recién ahí `ensureDefaultRoles` completa lo que falte.

        (Acá también corría un dedupe automático de los roles Mobile, `cleanupDuplicateMobileRoles`.
        Se retiró: renombraba al ganador como "Mobile - Coordinador" —con espacios—, un nombre que
        ningún seed creaba y que ninguna de las búsquedas del resto del código encontraba.)
      */
      await migrateMobileYResponsable(tenantId);

      await ensureDefaultRoles(tenantId);

      // Necesita los roles que `ensureDefaultRoles` acaba de dejar listos: ver su comentario.
      await migrarJerarquiaDeProyecto(tenantId);

      await migrateRolePermissions(tenantId);

      const rolesAfter = await Role.countDocuments({ tenantId });

      if (rolesAfter > rolesBefore) {
        rolesCreated += rolesAfter - rolesBefore;
      }

      tenantsProcessed++;
    }

    console.log(`[RoleInit] Verification complete:`);
    console.log(`  - Tenants processed: ${tenantsProcessed}`);
    console.log(`  - New roles created: ${rolesCreated}`);
    console.log(`  - Roles updated: ${rolesUpdated}`);
  } catch (error) {
    console.error('[RoleInit] Error ensuring roles for all tenants:', error);
    throw error;
  }
}
