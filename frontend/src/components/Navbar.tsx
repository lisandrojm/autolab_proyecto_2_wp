import React, { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { ClientSelector } from './ClientSelector';
import { ClientContextMenu } from './ClientContextMenu';
import { EmpresaSelector } from './EmpresaSelector';
import { EmpresaContextMenu } from './EmpresaContextMenu';
import { Link, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faBars, faRightFromBracket, faUsers, faUserGear, faBuilding, faArrowUpRightFromSquare, faCalendar, faCog, faUser, faUserShield, faChevronDown, faChevronRight, faFileText, faShoppingCart, faFilePdf, faUsersGear, faLayerGroup, faUmbrellaBeach, faUserTag, faBriefcase, faFileContract, faClock, faListCheck, faBuildingColumns, faEarthAmericas, faBriefcaseMedical, faPiggyBank, faIdCard, faRocket, faLandmark, faPlug, faLocationDot, faSitemap, faIndustry, faShieldHeart, faTag, faPeopleGroup, faDatabase, faUserPlus, faFileSignature, faToggleOn, faRankingStar, faCalendarXmark } from '@fortawesome/free-solid-svg-icons';
import { usePermisoInactivo } from '../stores/permisosInactivosStore';
import { faDropbox } from '@fortawesome/free-brands-svg-icons';
import { Logo } from '../components/ui/Logo';
import axios from '../api/axiosConfig';
import { usersAPI } from '../api/users';
import { SettingsModal } from './SettingsModal';
import { useClientContextStore } from '../stores/clientContextStore';
import { useEmpresaContextStore } from '../stores/empresaContextStore';

interface AdminCounts {
  clients: number;
  tenants: number;
  roles: number;
  users: number;
  areas: number;
  projects: number;
}

/**
 * Subgrupo "Plantillas" (dentro de Configuración): agrupa las plantillas de documentos.
 *
 * EL ORDEN DE ESTE ARRAY NO ES EL DEL MENÚ: todo el menú se ordena alfabéticamente al armarse. Acá
 * el array solo dice QUÉ rutas caen en el subgrupo.
 */
// Prerrequisito de las demás plantillas. Eso lo explica su propia pantalla; en el menú entra por su
// nombre, como el resto: quien recorre una lista busca una palabra, no una dependencia.
const MEMBRETE_PATH = '/empresas-membretes';
/**
 * Cómo se llaman los archivos que salen de esas plantillas. Va en el mismo subgrupo porque es
 * transversal a todas: contratos, releases, pedidos y vacaciones.
 */
const NOMENCLATURA_PATH = '/nomenclatura-archivos';
const PLANTILLAS_PATHS = [MEMBRETE_PATH, '/pdfs', '/pdfs-vacaciones', '/contratos-frame', '/releases', NOMENCLATURA_PATH];

/**
 * Subgrupo "ARCA" (dentro de Configuración): todo lo que depende del organismo (ex AFIP).
 *
 * El orden de este array NO es el del menú —los ítems se ordenan alfabéticamente dentro de cada uno
 * de sus dos bloques—; el array dice qué rutas pertenecen al subgrupo y cuáles son nomencladores.
 *
 * Empresas NO va acá, aunque tenga datos de ARCA adentro (sucursales y obra social por defecto):
 * es una entidad transversal —de sus ~18 campos solo 3 son del organismo, y además alimenta
 * contratos, releases, membretes, pedidos y vacaciones—, y su pantalla hermana de membretes
 * ("Plantillas | Empresa/s | Membrete/s y firma") es la MISMA `Company` pero vive en el subgrupo
 * Plantillas. Meterla acá diría que es configuración del organismo y partiría la misma entidad en
 * dos grupos del menú. Para llegar desde ARCA, el ABM de Sucursales ya remite a Empresas.
 */
/*
 * Configuración → ARCA queda SOLO con lo universal.
 *
 * ARCA parte sus datos en dos: "Datos del Empleador" (por CUIT) y los nomencladores del organismo
 * (iguales para todos). Lo primero se mudó al contexto Empresa —obras sociales registradas,
 * convenios registrados, domicilios de explotación— porque son un SUBCONJUNTO por empleadora y
 * mezclarlos con el universo hacía creer que "la" lista era una sola.
 *
 * Lo que queda acá se importa una vez y casi no se toca.
 *
 * CONVENIOS Y CATEGORÍAS TAMBIÉN SON NOMENCLADORES y van arriba de la raya, con el resto. Estaban
 * abajo porque además de la tabla del organismo tienen grupos y escalas salariales —que son del
 * convenio, iguales para todas las empleadoras que lo registren—; pero eso los hace nomencladores
 * *con más cosas*, no otra categoría de pantalla, y abajo quedaban mezclados con lo que no se edita.
 *
 * Debajo de la raya queda solo lo que NO es un catálogo: las dos conexiones y las dos guías.
 *
 * Sigue sin haber ABM de Puesto Desempeñado ni Situación de Revista: no son campos del registro de
 * 130.
 *
 * "Actividades" sí está, pero es un DICCIONARIO y no un nomenclador del que se elija: lo que un
 * contrato puede declarar sale, y solo, de las actividades del domicilio. El catálogo existe para
 * autocompletar el código y normalizar la descripción al cargarlas ahí. Por eso va pegado a
 * Domicilios de Explotación y comparte su permiso.
 */
const ARCA_NOMENCLADOR_PATHS = ['/obras-sociales', '/arca/sucursales', '/arca/actividades', '/arca/tipos-servicio', '/arca/grupos-tipo-servicio', '/arca/modalidades-contratacion', '/arca/modalidades-liquidacion', '/arca/fuentes-paritaria', '/convenios', '/arca/categorias'];
/**
 * La Conexión va DEBAJO DE LA RAYA, con lo que no es nomenclador, y ahí entra por su nombre.
 *
 * Estuvo primera "porque es el prerrequisito de todo lo demás": cierto en el orden de lectura, pero
 * irrelevante en un menú — se configura una vez y no se vuelve a tocar. Lo que importa es que no es
 * un nomenclador y no tiene que leerse como uno más de esa lista; de eso se ocupa la raya, no la
 * posición.
 */
const ARCA_CONEXION_PATH = '/afip';
/**
 * La otra conexión: la que valida obras sociales.
 *
 * Son DOS y funcionan distinto — una habla con un webservice y trae datos del contribuyente; la otra
 * abre un navegador en el servidor y lee la obra social de un trabajador—. Estaban en una sola
 * pantalla y no se entendía cuál hacía qué. Van pegadas y con el mismo prefijo para que se lean como
 * lo que son: dos conexiones del mismo organismo, no dos módulos distintos.
 */
const ARCA_CONEXION_OS_PATH = '/arca/conexion-obras-sociales';
/** Las dos juntas, para el subgrupo «Conexión» que las agrupa adentro de ARCA. */
const ARCA_CONEXION_PATHS = [ARCA_CONEXION_PATH, ARCA_CONEXION_OS_PATH];
/**
 * "Cómo funciona" va debajo de la raya, con lo que no es nomenclador.
 *
 * No es un nomenclador ni una configuración: no se toca nada ahí. Es la explicación de la cadena
 * —qué depende de qué y en qué orden hay que cargarlo—, que no se deduce de ninguna de las pantallas
 * de arriba porque cada una muestra solo su pedazo.
 */
const ARCA_COMO_FUNCIONA_PATH = '/arca/como-funciona';
/** Guía del único trámite del módulo que sale de la app: la validación de obras sociales. */
const ARCA_GUIA_OS_PATH = '/arca/guia-obras-sociales';
const ARCA_PATHS = [...ARCA_NOMENCLADOR_PATHS, ARCA_CONEXION_PATH, ARCA_CONEXION_OS_PATH, ARCA_COMO_FUNCIONA_PATH, ARCA_GUIA_OS_PATH];

/** ABM de Empresas. La ficha de cada una cuelga del mismo grupo: ver `empresasGroup`. */
const EMPRESAS_PATH = '/empresas';

/**
 * USUARIOS, ÁREAS, TURNOS Y ROLES EMPRESA VIVEN EN ADMIN GENERAL. Roles se queda en Configuración.
 *
 * Estaban los cinco juntos en un subgrupo «Usuarios» dentro de Configuración, con el argumento de que
 * son catálogos con los que se clasifica a una persona. La práctica dijo otra cosa: a cuatro de los
 * cinco se entra todos los días —se da de alta gente, se le asigna un área y un turno, se le pone el
 * rol con el que figura en la empresa— y eso es trabajo, no configuración. Quedaban dos clicks abajo
 * de un grupo plegado, al lado de nomencladores que se tocan una vez por año.
 *
 * El que sí es configuración es ROLES: define qué puede ver y hacer cada perfil dentro de la app. Se
 * define una vez, se revisa cuando entra alguien nuevo, y equivocarlo abre o cierra pantallas. Ése se
 * queda donde se toca poco y con cuidado.
 *
 * La división que quedó es la misma de siempre, aplicada bien: en Admin GENERAL lo que se opera, en
 * Configuración lo que se define.
 */
const USUARIOS_PATH = '/users';
/**
 * Subgrupo «Usuarios» de Admin GENERAL. `/roles` NO está: ése tiene el suyo en Configuración.
 *
 * Se muestra alfabético, como el resto del menú. Áreas y Turnos son el mismo tipo de dato —el par
 * con el que se ubica a una persona en un proyecto— y antes iban pegados por eso; el orden por
 * nombre los separa, y a cambio los cuatro se encuentran sin recordar cuál era «la entidad».
 */
const USUARIOS_PATHS_GENERAL = [USUARIOS_PATH, '/areas', '/shifts', '/roles-empresa'];

/**
 * Subgrupo «Contratación» de Admin GENERAL: el ciclo por el que pasa la incorporación de una persona.
 *
 * Las tres pantallas son etapas de lo MISMO y se recorren en este orden: se pide el alta
 * (Solicitudes), se contrata y se hace el trámite impositivo (Contratos), y queda archivado lo
 * firmado (Documentos). Sueltas en el menú se leían como tres cosas sin relación, y para seguir un
 * alta había que saber de antemano en cuál de las tres mirar.
 *
 * Van en ORDEN DE FLUJO y no alfabético, que es la única excepción junto a «Centros de Costos» y
 * «Clientes»: acá el orden es el dato —dice qué va antes y qué después—, y alfabético quedaría
 * Contratos, Documentos, Solicitudes, que es el ciclo contado al revés.
 */
const CONTRATACION_PATHS = ['/admin/solicitudes', '/admin/plantillas-equipo', '/admin/contracts', '/admin/contratos-sin-dias', '/documents'];
/**
 * Subgrupo «Usuarios» de Configuración, con Roles adentro.
 *
 * Es un grupo de un solo hijo, y sí: por sí mismo un plegable con un ítem adentro es un click de más.
 * Se gana el lugar por SIMETRÍA — arriba hay un «Usuarios» y acá otro, así que quien busca algo de
 * personas encuentra el mismo rótulo en las dos secciones y lo que cambia es qué hay adentro: lo que
 * se opera arriba, lo que se define abajo. Sin el grupo, «Roles» quedaba suelto entre nomencladores
 * y no se leía como parte de la misma familia.
 */
// «Permisos» (qué permisos están activos para toda la plataforma) va junto a Roles. Sólo existe en el
// menú del SuperAdmin; para el resto el `filter(Boolean)` de abajo lo descarta.
// «Términos y condiciones» también: es lo que acepta una persona al registrarse, o sea parte de cómo
// se define quién entra a la plataforma.
const ROLES_PATHS = ['/roles', '/permisos', '/terminos-condiciones'];

/**
 * Subgrupo "Documentos" (dentro de Configuración): la integración con Dropbox, entera.
 *
 * Eran dos ítems sueltos y consecutivos, con el mismo ícono y nombres casi iguales —"Dropbox" y
 * "DropboxSign"—, que es la forma más fácil de entrar a la pantalla equivocada. Juntos ocupan una
 * línea y se abren cuando hacen falta.
 *
 * Se llama "Documentos" y no "Dropbox" porque nombra lo que se administra y no al proveedor: es lo
 * mismo que hace "ARCA" con sus nomencladores. El ícono de la marca queda igual, que es lo que dice
 * de un vistazo con qué servicio se hace.
 *
 * Alfabético, como todo el menú. Da igual que el circuito real vaya de la cuenta a la firma: son
 * dos ítems, y el que entra ya sabe a cuál va.
 */
const DOCUMENTOS_PATHS = ["/escaneo-dropbox", "/dropbox-sign"];

/**
 * Subgrupo "DDBB" (dentro de Configuración): la base de datos.
 *
 * Hoy tiene un solo hijo, «MongoDB», y aun así es un grupo: lo que se configura es LA BASE, y el motor
 * es un detalle de implementación que puede no ser el único para siempre. Un ítem suelto llamado
 * «MongoDB» en el menú obligaría a saber qué motor usa la plataforma para encontrar los backups.
 *
 * Las copias en sí NO están acá: viven en Documentos → DDBB, que es donde está la carpeta de Dropbox.
 * Esto es la configuración; aquello es el archivo.
 */
const DDBB_PATHS = ["/ddbb/mongodb"];

/**
 * Subgrupos colapsables de Configuración. `storageKey` persiste el abierto/cerrado y
 * `paths` decide qué items se sacan del listado plano para meterlos adentro del grupo.
 */
const CONFIG_GROUPS = [
  { key: 'plantillas', storageKey: 'configPlantillasOpen', paths: PLANTILLAS_PATHS },
  { key: 'arca', storageKey: 'configArcaOpen', paths: ARCA_PATHS },
  { key: 'documentos', storageKey: 'configDocumentosOpen', paths: DOCUMENTOS_PATHS },
  { key: 'ddbb', storageKey: 'configDdbbOpen', paths: DDBB_PATHS },
  /*
    Los dos «Usuarios». El primero NO está en Configuración sino en Admin GENERAL — esta lista dejó de
    ser solo de esa sección y pasó a ser el registro de todos los grupos plegables del menú, que es lo
    que le da a cada uno su estado abierto/cerrado y su persistencia.
  */
  { key: 'contratacion', storageKey: 'generalContratacionOpen', paths: CONTRATACION_PATHS },
  { key: 'usuariosGeneral', storageKey: 'generalUsuariosOpen', paths: USUARIOS_PATHS_GENERAL },
  { key: 'usuariosConfig', storageKey: 'configUsuariosOpen', paths: ROLES_PATHS },
  // «Empresas»: el ABM y la ficha de una empleadora. Ver `empresasGroup` para por qué van juntos.
  { key: 'empresas', storageKey: 'configEmpresasOpen', paths: [EMPRESAS_PATH] },
  /*
    ANIDADO dentro de «ARCA». Es el único grupo de dos niveles del menú, y se gana el lugar: son dos
    conexiones al mismo organismo que hacen cosas distintas, y sueltas había que ponerles el prefijo
    «Conexión | …» a las dos para que se entendiera que van juntas — con lo cual no entraban en el
    ancho del sidebar y salían cortadas («Conexión | Con…», «Conexión | Obra…»), que es peor que no
    agruparlas. Agrupadas, el padre dice «Conexión» y los hijos dicen para qué es cada una.
  */
  { key: 'arcaConexion', storageKey: 'configArcaConexionOpen', paths: ARCA_CONEXION_PATHS },
] as const;

/** El subgrupo al que pertenece una ruta (o `undefined` si no está en ninguno). */
/**
 * TODOS los subgrupos a los que pertenece una ruta, no solo el primero.
 *
 * Con «Conexión» adentro de «ARCA» una misma ruta cae en dos: si se abriera solo uno, entrar directo
 * a la conexión dejaría al padre colapsado y el ítem activo escondido adentro — el menú marcando
 * como abierta una pantalla que no se ve por ningún lado.
 */
const gruposDeRuta = (pathname: string) => CONFIG_GROUPS.filter((g) => (g.paths as readonly string[]).includes(pathname));

export const MobileNavbar: React.FC = () => {
  const { user, logout, hasPermission } = useAuthStore();
  const { selectedClient } = useClientContextStore();
  const { selectedEmpresa } = useEmpresaContextStore();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // No renderizar el Navbar en rutas públicas
  const publicRoutes = ['/login', '/register', '/register-client'];
  if (publicRoutes.includes(location.pathname)) {
    return null;
  }

  // Estado del acordeón persistente: "general" | "config" | null.
  // Un valor guardado de "users" (la sección que se eliminó) ya no matchea ninguna sección y dejaría
  // las dos colapsadas al entrar: se traduce a "general", que es el default.
  const [openAdminSection, setOpenAdminSection] = useState<string | null>(() => {
    const guardado = localStorage.getItem('adminOpenSection');
    return guardado === 'config' ? 'config' : 'general';
  });

  const toggleAdminSection = (section: 'general' | 'config') => {
    const newVal = openAdminSection === section ? null : section;
    setOpenAdminSection(newVal);
    if (newVal) localStorage.setItem('adminOpenSection', newVal);
    else localStorage.removeItem('adminOpenSection');
  };

  // Subgrupos colapsables dentro de Configuración ("Plantillas", "ARCA", "Usuarios", "Documentos"). Su estado vive acá
  // (y no en NavMenu) porque NavMenu se redefine en cada render del padre y perdería el estado interno.
  // Cada uno arranca abierto si lo dejaste abierto, o si entrás directo a una de sus páginas.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => Object.fromEntries(CONFIG_GROUPS.map((g) => [g.key, localStorage.getItem(g.storageKey) === 'true' || gruposDeRuta(location.pathname).some((x) => x.key === g.key)])));
  const toggleGroup = (key: string) => {
    const group = CONFIG_GROUPS.find((g) => g.key === key);
    if (!group) return;
    setOpenGroups((prev) => {
      const newVal = !prev[key];
      localStorage.setItem(group.storageKey, String(newVal));
      return { ...prev, [key]: newVal };
    });
  };
  // Al NAVEGAR hacia una de sus páginas se abre solo. Se ignora el primer render para no pisar
  // el estado inicial: si no, estando parado en una de esas rutas nunca se podría colapsar.
  const groupsMounted = React.useRef(false);
  useEffect(() => {
    if (!groupsMounted.current) {
      groupsMounted.current = true;
      return;
    }
    const grupos = gruposDeRuta(location.pathname);
    if (grupos.length > 0) setOpenGroups((prev) => ({ ...prev, ...Object.fromEntries(grupos.map((g) => [g.key, true])) }));
  }, [location.pathname]);
  const [adminCounts, setAdminCounts] = useState<AdminCounts>({ clients: 0, tenants: 0, roles: 0, users: 0, areas: 0, projects: 0 });
  const SHOW_MENU_COUNTS = false;

  /*
    LA BANDEJA DE TRABAJO DE CONTRATACIÓN: lo que está esperando que alguien lo resuelva.

    Es OTRA COSA que los `adminCounts` de arriba —esos cuentan cuántos hay (47 clientes, 800
    proyectos) y por eso están apagados—: acá el número es una cola de trabajo, y por eso se ve y
    pinta naranja. Solicitudes cuenta las que esperan decisión; Contratos, los que esperan su trámite
    impositivo; el grupo «Contratación» suma los dos, que es lo que hay para hacer ahí adentro.

    Cada pedido con su `catch`: sin permiso el server contesta 403 y esa parte queda en cero, sin
    llevarse puesto el resto del menú.
  */
  const [pendientes, setPendientes] = useState({ solicitudes: 0, contratos: 0 });
  useEffect(() => {
    let cancelado = false;
    Promise.all([
      hasPermission('admin_users:view') ? usersAPI.contarSolicitudesPendientes().catch(() => 0) : Promise.resolve(0),
      hasPermission('admin_contracts:view') ? usersAPI.contarContratosPendientes().catch(() => 0) : Promise.resolve(0),
    ]).then(([solicitudes, contratos]) => {
      if (!cancelado) setPendientes({ solicitudes, contratos });
    });
    return () => {
      cancelado = true;
    };
    // `location.pathname`: al volver de aprobar o rechazar algo, el número tiene que estar al día.
  }, [hasPermission, user, location.pathname]);

  useEffect(() => {
    const fetchAdminCounts = async () => {
      try {
        const promises: Array<Promise<any>> = [];

        if (hasPermission('admin_clients:view')) promises.push(axios.get('/clients/count').catch(() => ({ data: { count: 0 } })));
        else promises.push(Promise.resolve({ data: { count: 0 } }));

        if (hasPermission('tenants:view')) promises.push(axios.get('/tenants/count').catch(() => ({ data: { count: 0 } })));
        else promises.push(Promise.resolve({ data: { count: 0 } }));

        if (hasPermission('admin_roles:view')) promises.push(axios.get('/roles/count').catch(() => ({ data: { count: 0 } })));
        else promises.push(Promise.resolve({ data: { count: 0 } }));

        if (hasPermission('admin_areas:view')) promises.push(axios.get('/areas/count').catch(() => ({ data: { count: 0 } })));
        else promises.push(Promise.resolve({ data: { count: 0 } }));

        if (hasPermission('admin_users:view')) promises.push(axios.get('/users/count').catch(() => ({ data: { count: 0 } })));
        else promises.push(Promise.resolve({ data: { count: 0 } }));

        if (hasPermission('admin_projects:view')) promises.push(axios.get('/projects/count').catch(() => ({ data: { count: 0 } })));
        else promises.push(Promise.resolve({ data: { count: 0 } }));

        const [clientsRes, tenantsRes, rolesRes, areasRes, usersRes, projectsRes] = await Promise.all(promises);

        setAdminCounts({
          clients: clientsRes?.data?.count || 0,
          tenants: tenantsRes?.data?.count || 0,
          roles: rolesRes?.data?.count || 0,
          areas: areasRes?.data?.count || 0,
          projects: projectsRes?.data?.count || 0,
          users: usersRes?.data?.count || 0,
        });
      } catch (error) {
        console.error('Error fetching admin counts:', error);
      }
    };
    fetchAdminCounts();
  }, [hasPermission, user]);

  const userRoleNames = useMemo(() => {
    if (Array.isArray(user?.roles) && user.roles.length > 0) {
      if (typeof user.roles[0] === 'string') return [...new Set(user.roles)];
      if (typeof user.roles[0] === 'object' && user.roles[0] !== null) {
        const names = user.roles.map((r: any) => r.name || r).filter((n): n is string => typeof n === 'string');
        return [...new Set(names)];
      }
    }
    return user?.primaryRole ? [user.primaryRole] : [];
  }, [user?.roles, user?.primaryRole]);

  /*
    FUNCIONES EN DESARROLLO: si el permiso de un ítem está inactivo (Configuración → Permisos), el ítem
    sigue en el menú de quien lo tiene asignado, pero gris, con «En desarrollo» y sin poder entrar. Se
    decide al dibujar (`renderMenuItem`), así vale para cualquier ítem que traiga `permiso`. Al SuperAdmin
    no le aplica: es quien lo prueba.
  */
  const inactivo = usePermisoInactivo();

  const menuItems = useMemo(() => {
    const isSuperAdminTenant = user?.tenantSlug === 'superadmin';

    const base: Array<{
      path: string;
      icon: any;
      label: string;
      external?: boolean;
      scope?: 'global' | 'client';
      count?: number;
      /** Cuántas cosas esperan que alguien las resuelva acá adentro. Ver `pendientes`. */
      pendientes?: number;
      dividerTop?: boolean;
      badge?: string;
      badgeColor?: string;
      disabled?: boolean;
      /** El permiso que lo habilita: si está inactivo (en desarrollo), el ítem se ve apagado. */
      permiso?: string;
    }> = [];

    if (isSuperAdminTenant) {
      base.push({ path: '/tenants', icon: faBuilding, label: 'Tenants', scope: 'global', count: adminCounts.tenants }, { path: '/users', icon: faUserGear, label: 'Usuarios', scope: 'global', count: adminCounts.users }, { path: '/shifts', icon: faClock, label: 'Turnos', scope: 'global' }, { path: '/roles', icon: faUserShield, label: 'Roles', scope: 'global', count: adminCounts.roles }, { path: '/permisos', icon: faToggleOn, label: 'Permisos', scope: 'global' }, { path: '/areas', icon: faLayerGroup, label: 'Áreas', scope: 'global', count: adminCounts.areas }, { path: '/clients', icon: faUsers, label: 'Clientes', scope: 'global', count: adminCounts.clients }, { path: '/arca/categorias', icon: faListCheck, label: 'Categorías', scope: 'global' });
    } else {
      if (hasPermission('admin_roles:view')) base.push({ permiso: 'admin_roles:view', path: '/roles', icon: faUserShield, label: 'Roles', scope: 'global', count: adminCounts.roles });
      // «Permisos» es del SuperAdmin aunque esté parado en un tenant común: se decide por su rol, no por
      // el tenant. Sin distinguir mayúsculas, como el resto de la app (el rol llega como «SuperAdmin»).
      if (user?.primaryRole?.toLowerCase() === 'superadmin' || (user?.roles || []).some((r: any) => String(typeof r === 'string' ? r : r?.name || '').toLowerCase() === 'superadmin')) base.push({ path: '/permisos', icon: faToggleOn, label: 'Permisos', scope: 'global' });
      // `config_terminos:view` es nuevo: hasta que se tilde en los roles, entra quien administra usuarios,
      // que es quien maneja los registros y sus links.
      if (hasPermission('config_terminos:view') || hasPermission('admin_users:view')) base.push({ path: '/terminos-condiciones', icon: faFileSignature, label: 'Términos y condiciones', scope: 'global' });
      if (hasPermission('admin_roles_empresa:view')) base.push({ permiso: 'admin_roles_empresa:view', path: '/roles-empresa', icon: faUserTag, label: 'Roles Empresa', scope: 'global' });
      if (hasPermission('admin_areas:view')) base.push({ permiso: 'admin_areas:view', path: '/areas', icon: faLayerGroup, label: 'Áreas', scope: 'global', count: adminCounts.areas });
      if (hasPermission('admin_users:view')) base.push({ permiso: 'admin_users:view', path: '/users', icon: faUserGear, label: 'Usuarios', scope: 'global', count: adminCounts.users });
      if (hasPermission('admin_users_import:view')) base.push({ permiso: 'admin_users_import:view', path: '/users/import-wp', icon: faArrowUpRightFromSquare, label: 'Import WP', scope: 'global' });

      // Admin GENERAL Items
      if (hasPermission('admin_clients:view')) base.push({ permiso: 'admin_clients:view', path: '/clients', icon: faUsers, label: 'Clientes', scope: 'global', count: adminCounts.clients });
      // Sin sufijo "| Global": el grupo ya se llama Admin GENERAL, así que dentro de él el calificador
      // repetía lo que dice el título. Las versiones acotadas se distinguen por dónde están —cuelgan
      // de la ficha de un cliente o de una empresa, con el nombre a la vista— y no por su etiqueta.
      if (hasPermission('admin_projects:view')) base.push({ permiso: 'admin_projects:view', path: '/admin/projects', icon: faBriefcase, label: 'Proyectos', scope: 'global', count: adminCounts.projects });
      /*
        VALORACIONES EN ADMIN GENERAL, no en Configuración.

        No es un nomenclador que se carga una vez: es la política comercial —qué margen es Oro y qué
        categoría se ofrece por cada nivel— y se mira junto a Proyectos, que es donde se aplica.

        `config_valoraciones:view` es nuevo y los roles están congelados en la base: hasta que se
        tilde, se muestra a quien ya administra Roles Empresa, que es donde se valora cada categoría.
      */
      if (hasPermission('config_valoraciones:view') || hasPermission('config_frame_functions:view')) base.push({ path: '/valoraciones', icon: faRankingStar, label: 'Valoraciones', scope: 'global' });
      if (hasPermission('admin_sedes:view')) base.push({ permiso: 'admin_sedes:view', path: '/admin/sedes', icon: faBuilding, label: 'Sedes', scope: 'global' });
      if (hasPermission('admin_contracts:view')) base.push({ permiso: 'admin_contracts:view', path: '/admin/contracts', icon: faFileContract, label: 'Contratos', scope: 'global', pendientes: pendientes.contratos });
      // Las plantillas GENERALES de equipo (puestos por rol): cada supervisor las copia en el móvil.
      if (hasPermission('admin_hiring_templates:view')) base.push({ permiso: 'admin_hiring_templates:view', path: '/admin/plantillas-equipo', icon: faPeopleGroup, label: 'Plantillas', scope: 'global' });
      // Los vigentes que no dicen qué días se trabaja (casi todos vienen de FRAME): se completan ahí.
      if (hasPermission('admin_contracts:view')) base.push({ permiso: 'admin_contracts:view', path: '/admin/contratos-sin-dias', icon: faCalendarXmark, label: 'Sin días', scope: 'global' });
      // Solicitudes va pegada a Contratos porque son los dos extremos del mismo ciclo: lo que se
      // pidió y lo que ya se contrató. Comparte permiso con Usuarios —una solicitud es un alta de
      // usuario, no un contrato— igual que el endpoint que la alimenta.
      if (hasPermission('admin_users:view')) base.push({ permiso: 'admin_users:view', path: '/admin/solicitudes', icon: faUserPlus, label: 'Solicitudes', scope: 'global', pendientes: pendientes.solicitudes });
      if (hasPermission('admin_activity_logs:view')) base.push({ permiso: 'admin_activity_logs:view', path: '/requests', icon: faFileText, label: 'Novedades', scope: 'global', dividerTop: true });
      if (hasPermission('admin_orders:view')) base.push({ permiso: 'admin_orders:view', path: '/orders', icon: faShoppingCart, label: 'Pedidos', scope: 'global' });
      if (hasPermission('admin_vacations:view')) base.push({ permiso: 'admin_vacations:view', path: '/vacations', icon: faUmbrellaBeach, label: 'Vacaciones', scope: 'global' });
      // El ícono de Dropbox dice de dónde salen los documentos, así que el nombre no tiene que
      // repetirlo: la marca queda en la imagen y la etiqueta nombra la pantalla.
      if (hasPermission('admin_hr_documents:view')) base.push({ permiso: 'admin_hr_documents:view', path: '/documents', icon: faDropbox, label: 'Documentos', scope: 'global' });

      // CONFIGURACION Items
      if (hasPermission('config_activity_logs:view')) base.push({ permiso: 'config_activity_logs:view', path: '/requests/config', icon: faFileText, label: 'Novedades', scope: 'global' });

      if (hasPermission('config_orders:view')) base.push({ permiso: 'config_orders:view', path: '/order-types', icon: faShoppingCart, label: 'Pedidos', scope: 'global' });
      if (hasPermission('config_shifts:view')) base.push({ permiso: 'config_shifts:view', path: '/shifts', icon: faClock, label: 'Turnos', scope: 'global' });
      if (hasPermission('config_vacations:view')) base.push({ permiso: 'config_vacations:view', path: '/vacations-rules', icon: faUmbrellaBeach, label: 'Vacaciones', scope: 'global' });
      if (hasPermission('config_holidays:view')) base.push({ permiso: 'config_holidays:view', path: '/holidays', icon: faCalendar, label: 'Feriados', scope: 'global' });
      if (hasPermission('config_pdf_templates:view')) base.push({ permiso: 'config_pdf_templates:view', path: '/pdfs', icon: faFilePdf, label: 'Pedidos', scope: 'global' });
      if (hasPermission('config_pdf_templates:view')) base.push({ permiso: 'config_pdf_templates:view', path: '/pdfs-vacaciones', icon: faFilePdf, label: 'Vacaciones', scope: 'global' });
      if (hasPermission('config_releases:view')) base.push({ permiso: 'config_releases:view', path: '/releases', icon: faFilePdf, label: 'Releases', scope: 'global' });
      // Cómo se llaman los archivos que salen de todas esas plantillas. Comparte permiso con ellas:
      // quien puede definir el contenido de un documento puede definir su nombre.
      if (hasPermission('config_releases:view') || hasPermission('config_contratos_frame:view')) base.push({ path: NOMENCLATURA_PATH, icon: faTag, label: 'Nomenclatura de archivos', scope: 'global' });
      if (hasPermission('config_releases:view')) base.push({ permiso: 'config_releases:view', path: '/releases-tipos', icon: faRocket, label: 'Releases', scope: 'global' });
      if (hasPermission('config_categorias_sat:view') || hasPermission('config_frame_functions:view')) base.push({ path: '/arca/categorias', icon: faListCheck, label: 'Categorías', scope: 'global' });
      if (hasPermission('config_bancos:view')) base.push({ permiso: 'config_bancos:view', path: '/bancos', icon: faBuildingColumns, label: 'Entidades Financieras', scope: 'global' });
      if (hasPermission('config_obras_sociales:view')) base.push({ permiso: 'config_obras_sociales:view', path: '/obras-sociales', icon: faBriefcaseMedical, label: 'Obras Sociales', scope: 'global' });
      if (hasPermission('config_convenios:view')) base.push({ permiso: 'config_convenios:view', path: '/convenios', icon: faFileContract, label: 'Convenios', scope: 'global' });
      // `config_sindicatos:view` es nuevo: hasta que se tilde en los roles se muestra a quien ya
      // administra Convenios, que es la configuración más cercana (misma familia de relación laboral).
      // Queda SUELTO en Configuración, no adentro del subgrupo ARCA: Convenios está ahí por ser un
      // nomenclador del organismo, y este catálogo es propio de la plataforma. Ver `configPaths`.
      if (hasPermission('config_sindicatos:view') || hasPermission('config_convenios:view')) base.push({ path: '/sindicatos', icon: faPeopleGroup, label: 'Sindicatos', scope: 'global' });
      // `config_paises_residencia:view` es nuevo y los roles están congelados en la base: hasta que se
      // tilde, se muestra a quien ya administra Entidades Financieras, el otro catálogo propio que
      // alimenta los datos de la persona (registro y ficha). Suelto en Configuración, como Sindicatos.
      if (hasPermission('config_paises_residencia:view') || hasPermission('config_bancos:view')) base.push({ path: '/paises-residencia', icon: faEarthAmericas, label: 'Países de residencia', scope: 'global' });
      if (hasPermission('config_centros_costo:view')) base.push({ permiso: 'config_centros_costo:view', path: '/centros-costo', icon: faPiggyBank, label: 'Centros de Costos', scope: 'global' });
      if (hasPermission('config_contratos_frame:view')) base.push({ permiso: 'config_contratos_frame:view', path: '/contratos-frame', icon: faFilePdf, label: 'Contratos', scope: 'global' });
      // `config_contratos:view` y `config_estados:view` son nuevos: hasta que se tilden en los roles,
      // se muestran a quien ya administra los tipos de contrato (Contratos FRAME).
      // Contratos y Estados viven en un solo ítem con dos tabs: alcanza con cualquiera de los tres permisos.
      if (hasPermission('config_contratos:view') || hasPermission('config_estados:view') || hasPermission('config_contratos_frame:view')) base.push({ path: '/contratos', icon: faFileContract, label: 'Contratos', scope: 'global' });
      if (hasPermission('config_empresas:view')) base.push({ permiso: 'config_empresas:view', path: '/empresas', icon: faBuilding, label: 'Empresas', scope: 'global' });
      if (hasPermission('config_membretes:view')) base.push({ permiso: 'config_membretes:view', path: '/empresas-membretes', icon: faFilePdf, label: 'Empresa/s | Membrete/s y firma', scope: 'global' });
      // Las dos viven adentro del subgrupo "Documentos" (ver DOCUMENTOS_PATHS) y ahí es el grupo el
      // que dice de qué se trata. Cada una se sigue nombrando por el SERVICIO, a secas: qué configura
      // —la cuenta y el escaneo de carpetas acá, la casilla de avisos de firma en la de abajo— lo
      // dice el subtítulo de su pantalla, que es donde hay lugar para explicarlo.
      // «MongoDB», dentro del subgrupo DDBB. Comparte permiso con la configuración de Dropbox porque el
      // backup se guarda justamente ahí; además, la API de backups exige rol admin por su cuenta.
      if (hasPermission('config_escaneo_dropbox:view')) base.push({ permiso: 'config_escaneo_dropbox:view', path: '/ddbb/mongodb', icon: faDatabase, label: 'MongoDB', scope: 'global' });
      if (hasPermission('config_escaneo_dropbox:view')) base.push({ permiso: 'config_escaneo_dropbox:view', path: '/escaneo-dropbox', icon: faDropbox, label: 'Dropbox', scope: 'global' });
      // Comparte permiso con el escaneo de Dropbox: las dos configuran la misma integración.
      if (hasPermission('config_escaneo_dropbox:view')) base.push({ permiso: 'config_escaneo_dropbox:view', path: '/dropbox-sign', icon: faDropbox, label: 'DropboxSign', scope: 'global' });
      // Dentro del subgrupo "ARCA" se muestra como "Conexión" (el organismo ya lo nombra el grupo).
      // El ícono es el de conexión y NO el del organismo: `faLandmark` ya lo lleva el encabezado del
      // grupo, así que repetirlo dejaba dos íconos idénticos uno debajo del otro y no distinguía la
      // pantalla. Es el mismo `faPlug` que la conexión de Dropbox: misma clase de cosa, mismo ícono.
      if (hasPermission('config_afip:view')) base.push({ permiso: 'config_afip:view', path: '/afip', icon: faPlug, label: 'Constancia de CUIT', scope: 'global' });
      // Misma familia, mismo ícono de conexión: lo que cambia es para qué sirve, y eso lo dice el
      // rótulo. Comparte permiso porque es la misma decisión de quién configura la integración.
      // El rótulo nombra las TRES cosas que salen de esta conexión, no solo la primera que resolvió:
      // la obra social y el nombre real vienen del mismo renglón de la pantalla de altas, y el
      // documento se calcula del CUIT. Decía «Obras sociales» y por eso los nombres se buscaban en la
      // conexión de al lado, que es la del certificado y no los tiene.
      if (hasPermission('config_afip:view')) base.push({ permiso: 'config_afip:view', path: ARCA_CONEXION_OS_PATH, icon: faPlug, label: 'Obras sociales y nombres', scope: 'global' });
      // Comparte permiso con la Conexión: quien puede ver cómo se conecta el módulo puede leer cómo
      // funciona. No expone ningún dato — es la explicación del circuito.
      if (hasPermission('config_afip:view')) base.push({ permiso: 'config_afip:view', path: ARCA_COMO_FUNCIONA_PATH, icon: faSitemap, label: 'Cómo funciona', scope: 'global' });
      if (hasPermission('config_afip:view')) base.push({ permiso: 'config_afip:view', path: ARCA_GUIA_OS_PATH, icon: faShieldHeart, label: 'Validar obras sociales', scope: 'global' });
      // Tablas oficiales del organismo: comparten un solo permiso porque son el mismo tipo de
      // nomenclador (se siembran desde ARCA y casi no se editan), no tres módulos distintos.
      if (hasPermission('config_arca_sucursales:view')) base.push({ permiso: 'config_arca_sucursales:view', path: '/arca/sucursales', icon: faLocationDot, label: 'Domicilios de Explotación', scope: 'global' });
      // Va PEGADO a Domicilios y comparte su permiso: es su diccionario, no un catálogo autónomo. Lo
      // que un contrato puede declarar sigue saliendo del domicilio; acá solo viven código y texto.
      if (hasPermission('config_arca_sucursales:view')) base.push({ permiso: 'config_arca_sucursales:view', path: '/arca/actividades', icon: faIndustry, label: 'Actividades', scope: 'global' });
      if (hasPermission('config_arca_tablas:view')) {
        // "Modalidad de Contrato" es como lo llama ARCA. Era "Modalidades de Contratación" acá y
        // "Modalidad de contrato" en el formulario del tipo de contrato: dos nombres para el MISMO
        // catálogo (153 registros, mismos códigos) hacían dudar de si eran dos cosas.
        base.push({ permiso: 'config_arca_tablas:view', path: '/arca/modalidades-contratacion', icon: faFileContract, label: 'Modalidades de Contrato', scope: 'global' });
        base.push({ permiso: 'config_arca_tablas:view', path: '/arca/tipos-servicio', icon: faListCheck, label: 'Tipos de Servicio', scope: 'global' });
        // Va PEGADO a Tipos de Servicio y comparte su permiso, igual que Actividades con Domicilios:
        // son 2 registros que nadie navega, existen para filtrar el de arriba.
        base.push({ permiso: 'config_arca_tablas:view', path: '/arca/grupos-tipo-servicio', icon: faLayerGroup, label: 'Grupos de Tipo de Servicio', scope: 'global' });
        base.push({ permiso: 'config_arca_tablas:view', path: '/arca/fuentes-paritaria', icon: faListCheck, label: 'Fuentes de Paritarias', scope: 'global' });
        base.push({ permiso: 'config_arca_tablas:view', path: '/arca/modalidades-liquidacion', icon: faClock, label: 'Modalidades de Liquidación', scope: 'global' });
      }
    }

    return base;
  }, [hasPermission, adminCounts, user?.tenantSlug]);

  const handleMenuClick = () => {};

  const isActive = (path: string) => location.pathname === path;

  const RoleChips: React.FC<{ className?: string }> = ({ className = 'text-[9px]' }) =>
    userRoleNames.length ? (
      <div className="flex flex-wrap gap-1">
        {userRoleNames.map((label) => {
          const isCoord = label.toLowerCase().includes('coordinador');
          return (
            <div key={label} className={`flex text-transform: capitalize font-semibold items-center justify-center px-3 py-1 rounded ${className} text-xs ${isCoord ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-primary-100 text-primary-800 dark:bg-blue-900/30 dark:text-primary-300'}`}>
              <FontAwesomeIcon icon={faUserShield} className="h-3 w-3 mr-1.5" />
              {label}
            </div>
          );
        })}
      </div>
    ) : (
      <div className="mt-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded ${className} font-medium bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-300 uppercase`}>{user?.primaryRole ?? 'user'}</span>
      </div>
    );

  const UserCard: React.FC = () => {
    const displayName = user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.firstName || user?.lastName || user?.email || 'Usuario';
    return (
      <div>
        {user?.tenantSlug && (
          <div className="flex flex-col lg:flex-row gap-2 w-full lg:justify-between items-center lg:items-start lg:px-2">
            <div className="hidden lg:flex text-transform: capitalize font-semibold items-center justify-center px-3 py-1 rounded text-xs bg-primary-100 text-primary-800 dark:bg-blue-900/30 dark:text-primary-300" title={user.tenantSlug}>
              <FontAwesomeIcon icon={faBuilding} className="h-3 w-3 mr-1.5" />
              {user.tenantSlug}
            </div>
            <div className="flex text-transform: capitalize font-semibold items-center justify-center px-3 py-1 rounded text-xs bg-primary-100 text-primary-800 dark:bg-blue-900/30 dark:text-primary-300" title={displayName}>
              <FontAwesomeIcon icon={faUser} className="h-3 w-3 mr-1.5" /> {displayName}
            </div>
            <div className="hidden lg:block">
              <RoleChips />
            </div>
          </div>
        )}
      </div>
    );
  };

  const NavMenu: React.FC<{ onItemClick?: () => void }> = ({ onItemClick }) => {
    const adminItems = menuItems;
    const isSuperAdminTenant = user?.tenantSlug === 'superadmin';

    // Orden alfabético (respeta español: ignora acentos y mayúsculas)
    const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' });

    // Partición de items: Admin General y Configuración. Usuarios, Áreas, Turnos y Roles Empresa
    // están arriba porque se operan; Roles queda abajo porque se define (ver USUARIOS_PATHS_GENERAL).
    /*
      Los cuatro que se mudaron van en las DOS ramas, y eso no es una repetición al descuido.

      En el tenant superadmin, Admin GENERAL era solo «Tenants» y Usuarios, Áreas y Turnos llegaban a
      la pantalla por el subgrupo de Configuración. Al disolverlo se quedaban sin ningún lugar: no
      están en `configPaths` y ya no hay grupo que los recoja, así que habrían desaparecido del menú
      sin que nada avisara. Se suman acá para que la mudanza no le saque pantallas a nadie.
    */
    // Subgrupo «Usuarios» de Admin GENERAL, alfabético como todo el resto del menú.
    const usuariosGeneralChildren = (USUARIOS_PATHS_GENERAL.map((p) => adminItems.find((item) => item.path === p)).filter(Boolean) as typeof adminItems).sort(byLabel);
    const usuariosGeneralGroup = { path: '#usuarios-general', groupKey: 'usuariosGeneral', icon: faUserGear, label: 'Usuarios', scope: 'global' as const, children: usuariosGeneralChildren };

    /*
      Subgrupo «Contratación». A diferencia de «Usuarios», sus hijos NO se ordenan alfabético: van en
      el orden del ciclo (ver `CONTRATACION_PATHS`), porque ahí el orden dice qué etapa va antes.
    */
    const contratacionChildren = (CONTRATACION_PATHS.map((p) => adminItems.find((item) => item.path === p)).filter(Boolean) as typeof adminItems);
    /*
      El número del grupo es la SUMA de sus hijos, no un tercer contador.

      «Contratación» cerrado tiene que decir cuánto hay para hacer adentro —si no, hay que abrirlo
      para enterarse—, y sumar acá garantiza que diga exactamente lo que se ve al abrirlo.
    */
    const contratacionGroup = {
      path: '#contratacion',
      groupKey: 'contratacion',
      icon: faFileSignature,
      label: 'Contratación',
      scope: 'global' as const,
      children: contratacionChildren,
      pendientes: contratacionChildren.reduce((total, hijo: any) => total + (hijo.pendientes || 0), 0),
    };

    // Los sueltos de la sección. Los grupos entran aparte y ordenan por su propio rótulo.
    // Solicitudes, Contratos y Documentos ya NO están acá: se fueron adentro de «Contratación», y
    // dejarlos también sueltos los duplicaría en el menú.
    const generalSueltos = isSuperAdminTenant ? ['/tenants'] : ['/admin/projects', '/orders', '/vacations', '/requests', '/valoraciones'];
    /*
      «Centros de Costos» y «Clientes» van AL FINAL, después de Vacaciones, y no en el orden alfabético
      del resto de la sección.

      Es deliberado: son dos catálogos que se mudaron desde Configuración porque se consultan a
      diario, pero no son operación como Proyectos o Pedidos. Puestos por nombre caerían primeros y
      encabezarían la sección con lo que menos se abre de ella.

      La otra excepción al alfabético es el INTERIOR de «Contratación», por un motivo distinto: ahí
      el orden cuenta el ciclo (ver `CONTRATACION_PATHS`).
    */
    const generalAlFinal = isSuperAdminTenant ? [] : ['/centros-costo', '/clients'];
    const generalAdminItems = [
      ...[
        ...adminItems.filter((item) => generalSueltos.includes(item.path)),
        ...(contratacionChildren.length > 0 ? [contratacionGroup] : []),
        ...(usuariosGeneralChildren.length > 0 ? [usuariosGeneralGroup] : []),
      ].sort(byLabel),
      ...generalAlFinal.map((ruta) => adminItems.find((item) => item.path === ruta)).filter(Boolean),
    ] as any[];

    // Ojo: los paths de los grupos (Plantillas, ARCA, Documentos, Usuarios) NO van acá: se sacan
    // del listado plano para meterlos adentro de su subgrupo, y dejarlos también acá los duplicaría.
    // «/clients» y «/centros-costo» ya NO están acá: se mudaron a Admin GENERAL (ver `generalAlFinal`).
    const configPaths = ['/requests/config', '/order-types', '/vacations-rules', '/holidays', '/bancos', '/sindicatos', '/paises-residencia', '/contratos', '/releases-tipos', '/admin/sedes'];
    // "Mi Perfil" está en los DOS lados a propósito: como atajo en la barra de arriba (junto al
    // usuario) y acá, para quien lo busca recorriendo el menú. Entra en el orden alfabético.
    const profileItem = { path: '/mi-perfil', icon: faIdCard, label: 'Mi Perfil', scope: 'global' as const, permiso: 'config_profile:view' };

    // Subgrupo "Plantillas", alfabético. El membrete iba primero por ser prerrequisito de las demás;
    // esa relación la explica la propia pantalla, y en el menú lo que se busca es un nombre.
    const plantillasChildren = (PLANTILLAS_PATHS.map((p) => adminItems.find((item) => item.path === p)).filter(Boolean) as typeof adminItems).sort(byLabel);
    const plantillasGroup = { path: '#plantillas', groupKey: 'plantillas', icon: faFilePdf, label: 'Plantillas', scope: 'global' as const, children: plantillasChildren };

    /*
      Subgrupo "ARCA": alfabético DENTRO de cada bloque.

      Los dos bloques se conservan —los nomencladores universales bajo su encabezado, y debajo de la
      raya lo que no lo es— porque esa separación es la distinción que el menú venía escondiendo: qué
      se importa una vez y vale para todos los CUIT, y qué no. Ordenar los trece ítems en una sola
      lista dejaría «Cómo funciona» entre dos nomencladores y borraría el encabezado que lo explica.
    */
    const itemArca = (ruta: string) => adminItems.find((i) => i.path === ruta);
    const arcaNomencladores = (ARCA_NOMENCLADOR_PATHS.map(itemArca).filter(Boolean) as any[]).sort(byLabel);
    const conexionChildren = (ARCA_CONEXION_PATHS.map(itemArca).filter(Boolean) as any[]).sort(byLabel);
    /*
      Lo que no es ni nomenclador ni conexión, DERIVADO de `ARCA_PATHS` en vez de escrito de nuevo:
      una cuarta lista a mano se desincroniza en cuanto alguien agregue una pantalla al módulo, y el
      síntoma sería un ítem que desaparece del menú sin que nada avise.
    */
    const arcaOtros = ARCA_PATHS.filter((ruta) => !ARCA_NOMENCLADOR_PATHS.includes(ruta) && !ARCA_CONEXION_PATHS.includes(ruta))
      .map(itemArca)
      .filter(Boolean) as any[];
    // El subgrupo «Conexión» entra en el orden por su propio rótulo, como un hermano más.
    const arcaResto = [
      ...arcaOtros,
      ...(conexionChildren.length > 0 ? [{ path: '#arca-conexion', groupKey: 'arcaConexion', icon: faPlug, label: 'Conexión', scope: 'global' as const, children: conexionChildren }] : []),
    ].sort(byLabel);
    const arcaChildren: any[] = [
      ...(arcaNomencladores.length > 0 ? [{ path: '#arca-nomencladores', sectionKey: 'nomencladores', section: 'Nomencladores de ARCA', hint: 'Universales: se importan una vez y valen para todos los CUIT.' }] : []),
      ...arcaNomencladores,
      // La raya, solo si hay algo de los dos lados: al principio o al final no separaría nada.
      ...(arcaNomencladores.length > 0 && arcaResto.length > 0 ? [{ path: '#arca-separador', separador: true }] : []),
      ...arcaResto,
    ];
    const arcaGroup = { path: '#arca', groupKey: 'arca', icon: faLandmark, label: 'ARCA', scope: 'global' as const, children: arcaChildren };

    // Subgrupo «DDBB»: la configuración de la base (ver DDBB_PATHS).
    const ddbbChildren = (DDBB_PATHS.map((p) => adminItems.find((item) => item.path === p)).filter(Boolean) as typeof adminItems).sort(byLabel);
    const ddbbGroup = { path: '#ddbb', groupKey: 'ddbb', icon: faDatabase, label: 'DDBB', scope: 'global' as const, children: ddbbChildren };

    // Subgrupo "Documentos", alfabético.
    const documentosChildren = (DOCUMENTOS_PATHS.map((p) => adminItems.find((item) => item.path === p)).filter(Boolean) as typeof adminItems).sort(byLabel);
    const documentosGroup = { path: '#documentos', groupKey: 'documentos', icon: faDropbox, label: 'Documentos', scope: 'global' as const, children: documentosChildren };

    // Subgrupo «Usuarios» de Configuración: Roles, Permisos y Términos y condiciones (ver ROLES_PATHS).
    const usuariosConfigChildren = ROLES_PATHS.map((p) => adminItems.find((item) => item.path === p)).filter(Boolean) as typeof adminItems;
    const usuariosConfigGroup = { path: '#usuarios-config', groupKey: 'usuariosConfig', icon: faUserGear, label: 'Usuarios', scope: 'global' as const, children: usuariosConfigChildren };

    /**
     * SUBGRUPO «EMPRESAS»: el listado y la ficha de una, juntos.
     *
     * Estaban en las dos puntas del menú —el ABM abajo, en Configuración, y el selector de ficha
     * arriba de todo bajo el rótulo «Fichas»— y son la misma entidad: la lista de empleadoras y la
     * configuración de una de ellas. Para pasar de una a otra había que cruzar el sidebar entero, y
     * el rótulo de arriba no decía que ahí adentro se configuraba nada.
     *
     * El selector no es un link, así que entra como ítem `custom`: el grupo dibuja el componente en
     * el lugar donde iría un hijo. Con una empresa elegida, sus secciones (Información, ARCA,
     * Contratos) cuelgan de ahí, que es donde se las va a buscar.
     */
    const empresasItem = adminItems.find((item) => item.path === EMPRESAS_PATH);
    const fichaEmpresaItem = showEmpresaContext
      ? {
          path: '#ficha-empresa',
          custom: (
            <div key="ficha-empresa" className="pt-1">
              <EmpresaSelector />
              {selectedEmpresa && <EmpresaContextMenu />}
            </div>
          ),
        }
      : null;
    // El rótulo del hijo: sin él, el selector aparecía suelto debajo de «Empresas» y no se leía
    // como la segunda opción del grupo. Usa el tipo `section`, que el renderer ya dibuja.
    const fichaEmpresaLabel = { path: "#ficha-empresa-label", section: "Ficha de empresa", hint: "Abrí la ficha de una empleadora para configurar sus obras sociales, convenios, domicilios y contratos." };
    // LA FICHA VA PRIMERO: es lo que se abre todos los días —de ella cuelgan ARCA y los contratos—
    // mientras que el listado se toca cuando se da de alta una empleadora nueva, que es cada tanto.
    const empresasChildren = [...(fichaEmpresaItem ? [fichaEmpresaLabel, fichaEmpresaItem] : []), ...(empresasItem ? [empresasItem] : [])] as any[];
    const empresasGroup = { path: '#empresas', groupKey: 'empresas', icon: faBuilding, label: 'Empresas', scope: 'global' as const, children: empresasChildren };

    const configItems = [
      ...adminItems.filter((item) => configPaths.includes(item.path)),
      ...(hasPermission('config_profile:view') ? [profileItem] : []),
      ...(plantillasChildren.length > 0 ? [plantillasGroup] : []),
      ...(arcaChildren.length > 0 ? [arcaGroup] : []),
      ...(ddbbChildren.length > 0 ? [ddbbGroup] : []),
      ...(documentosChildren.length > 0 ? [documentosGroup] : []),
      ...(usuariosConfigChildren.length > 0 ? [usuariosConfigGroup] : []),
      ...(empresasChildren.length > 0 ? [empresasGroup] : []),
      // «Import WP» es un módulo temporal, y aun así entra por su nombre: colgado al final era el
      // único ítem del menú que no se podía encontrar leyendo en orden.
      ...(adminItems.filter((item) => item.path === '/users/import-wp')),
    ].sort(byLabel) as any[];

    const renderMenuItem = (item: any, isChild = false) => {
      /*
        Hijo que NO es un link: un componente propio (hoy, el selector de ficha de empresa).

        Se dibuja tal cual, sin la fila de ícono + texto que arma el resto: ese componente ya trae su
        propio chip y su submenú, y envolverlo en la plantilla de un ítem lo dejaría con dos marcos.
      */
      if (item.custom) return <React.Fragment key={item.path}>{item.custom}</React.Fragment>;

      // Raya divisoria dentro de un subgrupo. No es navegable ni tiene texto.
      if (item.separador) {
        return <div key={item.path} className="my-2 border-t border-gray-200 dark:border-gray-700" role="separator" />;
      }

      /*
        EL NÚMERO DE LA BANDEJA: entre paréntesis, al lado del nombre.

        Es el mismo gesto que el título de cada pantalla («Solicitudes (1)»), así que el menú y lo
        que se abre dicen el número igual. Con un globo naranja el menú parecía una app de mensajes:
        cinco rótulos tranquilos y una mancha de color que se llevaba toda la atención, todo el
        tiempo, por algo que no es urgente sino pendiente.

        En cero no se dibuja: un «(0)» ocupa el mismo lugar que un «(12)» y dice lo mismo que no
        tener nada, que es justo lo que se quiere leer de un vistazo.
      */
      const bandeja = (item as any).pendientes as number | undefined;
      const pill =
        bandeja && bandeja > 0 ? (
          <span title={`${bandeja} ${bandeja === 1 ? 'cosa' : 'cosas'} para resolver`} className="ml-1.5 shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400">
            ({bandeja > 99 ? '99+' : bandeja})
          </span>
        ) : null;

      // Encabezado de sección dentro de un subgrupo (ej: "Nomencladores de ARCA"). No es navegable:
      // separa lo universal de lo que no lo es, que es la distinción que el menú venía escondiendo.
      if (item.section) {
        return (
          <div key={item.path} className="px-2 pt-3 pb-1 select-none" title={item.hint}>
            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{item.section}</span>
          </div>
        );
      }

      // Subgrupo colapsable (ej: "Plantillas", "ARCA"). No es un link navegable.
      if (item.children) {
        const isOpen = !!openGroups[item.groupKey];
        return (
          <div key={item.path}>
            <button
              type="button"
              onClick={() => toggleGroup(item.groupKey)}
              className="w-full group flex items-center justify-between px-2 py-2 rounded transition-all text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-blue-900/50"
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                {/*
                  Un subgrupo ANIDADO se dibuja como sus hermanos, con el ícono plano.

                  La caja gris es lo que distingue un grupo de primer nivel de los ítems que cuelgan
                  de él. Repetirla un nivel más abajo hacía que «Conexión» pesara más que los
                  nomencladores que tiene al lado, y el menú se leyera como tres jerarquías en vez de
                  dos. Lo que dice que es un grupo es la flecha de la derecha, que ya está.
                */}
                {isChild ? (
                  <span className="h-8 w-8 flex items-center justify-center shrink-0 text-gray-500 dark:text-gray-400">
                    <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
                  </span>
                ) : (
                  <div className="h-8 w-8 flex items-center justify-center rounded-md transition-colors bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 group-hover:bg-gray-300 dark:group-hover:bg-blue-800">
                    <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
                  </div>
                )}
                <span className="font-medium truncate">{item.label}</span>
                {/* Cerrado, el número es lo único que dice que adentro hay trabajo. */}
                {pill}
              </div>
              <FontAwesomeIcon icon={isOpen ? faChevronDown : faChevronRight} className="ml-2 h-3 w-3 shrink-0" />
            </button>

            {isOpen && <nav className="space-y-1 mt-1 ml-5 pl-2 border-l-2 border-gray-200 dark:border-gray-700">{item.children.map((child: any) => renderMenuItem(child, true))}</nav>}
          </div>
        );
      }

      if (item.external) {
        return (
          <a
            key={item.path}
            href={item.path}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              handleMenuClick();
              onItemClick?.();
            }}
            className="group flex items-center justify-between px-2 py-2 transition-colors text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <div className="flex items-center space-x-3">
              <FontAwesomeIcon icon={item.icon} className="h-5 w-5" />
              <span className="font-medium">{item.label}</span>
            </div>
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
          </a>
        );
      }

      if (item.path === '#') {
        return (
          <button
            key={item.label}
            onClick={() => {
              setIsSettingsOpen(true);
              onItemClick?.();
            }}
            className="group relative flex items-center justify-between px-2 py-2 rounded transition-all w-full text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-blue-900/50"
          >
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <FontAwesomeIcon icon={item.icon} className="h-5 w-5 flex-shrink-0" />
              <span className="font-medium truncate">{item.label}</span>
            </div>
            {SHOW_MENU_COUNTS && item.count !== undefined && <span className={`ml-2 flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${item.count > 0 ? 'bg-slate-500/20 text-slate-500 dark:bg-white/20 dark:text-white' : 'bg-red-500/20 text-red-700 dark:bg-red-500/20 dark:text-red-400'}`}>{item.count}</span>}
          </button>
        );
      }

      // Disabled state (también las funciones en desarrollo: ver `usePermisoInactivo`)
      const enDesarrollo = inactivo(item.permiso);
      if (item.disabled || enDesarrollo) {
        const rotulo = enDesarrollo ? 'En desarrollo' : item.badge;
        return (
          <div key={item.path} title={rotulo ? `${item.label}: ${String(rotulo).toLowerCase()}` : undefined} className="group relative flex items-center justify-between px-2 py-2 rounded transition-all cursor-not-allowed opacity-60 bg-gray-100 dark:bg-gray-700 select-none">
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <div className="h-8 w-8 flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-600">
                <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
              </div>
              <span className="font-medium truncate">{item.label}</span>
              {rotulo && <span className={`ml-1 shrink-0 px-2 py-0.5 rounded text-[8px] font-bold ${enDesarrollo ? 'bg-amber-500' : item.badgeColor || 'bg-green-500'} text-white uppercase`}>{rotulo}</span>}
            </div>
          </div>
        );
      }
      return (
        <Link key={item.path} to={item.path} onClick={onItemClick} aria-current={isActive(item.path) ? 'page' : undefined} className={`group relative flex items-center justify-between px-2 py-2 rounded border transition-all ${isActive(item.path) ? (isChild ? 'border-transparent text-primary-700 dark:text-primary-300 font-semibold hover:bg-gray-100 dark:hover:bg-blue-900/50' : 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-blue-300 dark:border-blue-800') : 'border-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-blue-900/50'}`}>
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            {isChild ? (
              <span className="h-8 w-8 flex items-center justify-center shrink-0 text-gray-500 dark:text-gray-400">
                <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
              </span>
            ) : (
              <div className={`h-8 w-8 flex items-center justify-center rounded-md transition-colors ${isActive(item.path) ? 'bg-primary-600 text-white dark:bg-primary-700/30' : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 group-hover:bg-gray-300 dark:group-hover:bg-blue-800'}`}>
                <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
              </div>
            )}
            <span className="font-medium truncate">{item.label}</span>
            {item.badge && <span className={`ml-1 px-2 py-0.5 rounded text-[8px] font-bold ${item.badgeColor || 'bg-green-500'} text-white uppercase`}>{item.badge}</span>}
            {pill}
          </div>

          {SHOW_MENU_COUNTS && item.count !== undefined && <span className={`ml-2 flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${item.count > 0 ? 'bg-slate-500/20 text-slate-500 dark:bg-white/20 dark:text-white' : 'bg-red-500/20 text-red-700 dark:bg-red-500/20 dark:text-red-400'}`}>{item.count}</span>}
        </Link>
      );
    };

    return (
      <div>
        {/* ADMIN GENERAL (RRHH) */}
        {generalAdminItems.length > 0 && (
          <div className="px-2 mb-2">
            <button onClick={() => toggleAdminSection('general')} className="w-full flex items-center justify-between text-sm font-medium text-gray-500 dark:text-gray-400 tracking-wider hover:text-gray-700 dark:hover:text-gray-300 transition-colors pb-2 pt-2">
              <span>
                <FontAwesomeIcon icon={faUsersGear} className="mr-2 h-4 w-4" />
                Admin <span className="uppercase">General</span>
              </span>
              <FontAwesomeIcon icon={openAdminSection === 'general' ? faChevronDown : faChevronRight} className="h-3 w-3" />
            </button>

            {openAdminSection === 'general' && <nav className="space-y-1 pb-2">{generalAdminItems.map((item) => renderMenuItem(item))}</nav>}
          </div>
        )}

        {/* "Admin USUARIOS" ya no es una sección de primer nivel: Áreas, Cargos, Niveles, Roles y
            Usuarios son catálogos, no un módulo de trabajo, y viven en Configuración → Usuarios. */}

        {/* CONFIGURACIÓN */}
        {configItems.length > 0 && (
          <div className="px-2 mb-2">
            <button onClick={() => toggleAdminSection('config')} className="w-full flex items-center justify-between text-sm font-medium text-gray-500 dark:text-gray-400 tracking-wider hover:text-gray-700 dark:hover:text-gray-300 transition-colors pb-2 pt-2">
              <span>
                <FontAwesomeIcon icon={faCog} className="mr-2 h-4 w-4" />
                Configuración
              </span>
              <FontAwesomeIcon icon={openAdminSection === 'config' ? faChevronDown : faChevronRight} className="h-3 w-3" />
            </button>

            {openAdminSection === 'config' && <nav className="space-y-1 pb-2">{configItems.map((item) => renderMenuItem(item))}</nav>}
          </div>
        )}
      </div>
    );
  };

  const showClientContext = useMemo(() => {
    const isSuperAdminTenant = user?.tenantSlug === 'superadmin';
    const hasClientsPermission = hasPermission('client:view');
    return !isSuperAdminTenant && hasClientsPermission;
  }, [user?.tenantSlug, hasPermission]);

  /** Empresa comparte permiso con su ABM: es la misma entidad, vista como eje de trabajo. */
  const showEmpresaContext = useMemo(() => {
    const isSuperAdminTenant = user?.tenantSlug === 'superadmin';
    return !isSuperAdminTenant && hasPermission('config_empresas:view');
  }, [user?.tenantSlug, hasPermission]);

  /**
   * Arriba del menú queda SOLO el cliente, y sin rótulo.
   *
   * Decía «FICHAS» y agrupaba dos cosas que no son lo mismo. La palabra no aclaraba: nombraba una
   * categoría inventada para el menú, que no aparece en ninguna otra parte de la app ni en cómo se
   * habla del trabajo. Quien buscaba la configuración de una empresa no la buscaba bajo «Fichas».
   *
   * La ficha de empresa se mudó a Configuración → Empresas, junto al ABM: son la misma entidad
   * —el listado y la ficha de una— y estaban en dos puntas opuestas del menú.
   *
   * Es un VALOR JSX, no un componente definido acá adentro. Un `const X: React.FC` dentro del cuerpo
   * es un tipo de componente nuevo en cada render del padre, así que React desmonta y vuelve a montar
   * el subárbol y el selector perdería su estado (el desplegable se cerraría solo). Es el mismo
   * motivo por el que el estado de los subgrupos de `NavMenu` vive en el padre.
   */
  const contextBlocks = showClientContext && (
    <div>
      <ClientSelector />
      {selectedClient && <ClientContextMenu />}
    </div>
  );

  const LogoutButton: React.FC<{ onClick?: () => void; className?: string }> = ({ onClick, className = '' }) => (
    <button
      onClick={() => {
        logout();
        onClick?.();
      }}
      className={`flex items-center space-x-3 w-full  py-3 rounded text-red-500 dark:text-red-500 hover:text-red-500/70 dark:hover:text-red-500/80 transition-colors ${className}`}
    >
      <FontAwesomeIcon icon={faRightFromBracket} className="h-5 w-5" />
      <span className="font-medium lg:hidden"></span>
    </button>
  );

  return (
    <>
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="px-4 sm:px-6">
          <div className="flex justify-between items-center h-16">
            <div className="lg:hidden">
              <button onClick={() => setOpen((v) => !v)} className="p-2 rounded hover:bg-gray-1 flex-1 overflow-y-auto space-y-4 mb-4000 dark:hover:bg-gray-700 transition-colors">
                {open ? <FontAwesomeIcon icon={faXmark} className="h-6 w-6 text-gray-600 dark:text-gray-300" /> : <FontAwesomeIcon icon={faBars} className="h-6 w-6 text-gray-600 dark:text-gray-300" />}
              </button>
            </div>
            <div>
              <Logo sizeClass="text-3xl" wrapperClassName="flex items-center select-none" />
            </div>
            <div className="flex items-center justify-center space-x-2">
              <div className="hidden lg:block">
                <UserCard />
              </div>
              {/*               {isDeployButtonVisible() && (
                <button onClick={handleRedeploy} onMouseEnter={loadDeployMeta} disabled={isDeploying} className="relative p-2 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                  <FontAwesomeIcon icon={faRocket} className={`h-5 w-5 text-blue-600 dark:text-blue-400}`} />
                  <div className="absolute top-full left-1/2 mt-2 -translate-x-1/2 flex flex-col items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
                    <div className="w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-800 dark:border-b-gray-700"></div>
                    <span className="rounded-md bg-gray-800 dark:bg-gray-700 text-white text-xs px-2 py-1 shadow-md whitespace-nowrap">
                      <div className="font-semibold flex flex-col">Vercel Deploy</div>
                      {deployMetaLoading ? (
                        <span className="ml-2 opacity-80">cargando…</span>
                      ) : deployMetaError ? (
                        <span className="ml-2 opacity-80">sin datos</span>
                      ) : deployMeta?.shortSha ? (
                        <>
                          <span className="ml-2">•</span>
                          {deployMeta.url ? (
                            <a href={`https://${deployMeta.url}`} target="_blank" rel="noopener noreferrer" className="ml-2 underline underline-offset-2" title={deployMeta.commitMessage || deployMeta.sha}>
                              {deployMeta.shortSha}
                            </a>
                          ) : (
                            <span className="ml-2" title={deployMeta.commitMessage || deployMeta.sha}>
                              {deployMeta.shortSha}
                            </span>
                          )}
                          {deployMeta.branch ? <span className="ml-2 opacity-80">({deployMeta.branch})</span> : null}
                          {deployMeta.createdAt ? (
                            <>
                              <span className="ml-2">•</span>
                              <span className="ml-2 opacity-80">{formatDateTime(deployMeta.createdAt)}</span>
                            </>
                          ) : null}
                        </>
                      ) : (
                        <span className="ml-2 opacity-80">sin datos</span>
                      )}
                    </span>
                  </div>
                </button>
              )} */}

              {/* Acceso rápido a "Mi Perfil". Lleva el texto al lado porque la credencial sola no se
                  entendía: en una fila de íconos sueltos no hay nada que diga qué abre. También está
                  en Configuración, para quien lo busca por el menú. */}
              {hasPermission('config_profile:view') && (
                <Link to="/mi-perfil" title="Mi Perfil" className={`inline-flex items-center gap-2 px-2.5 py-2 rounded text-sm font-medium transition-colors ${isActive('/mi-perfil') ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                  <FontAwesomeIcon icon={faIdCard} className="h-5 w-5" />
                  <span className="hidden sm:inline">Mi Perfil</span>
                </Link>
              )}
              <div className="sticky bottom-0 left-0 right-0 bg-white dark:bg-gray-800 py-2 border-t border-gray-200 lg:border-hidden dark:border-gray-700 px-4 hidden lg:block">
                <LogoutButton onClick={() => setOpen(false)} />
              </div>
            </div>
          </div>
        </div>

        {open && <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />}
        <div className={`fixed top-0 left-0 z-50 h-svh w-80 bg-white dark:bg-gray-800 transform transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : '-translate-x-full'}`} aria-hidden={!open}>
          <div className="p-4 pb-0">
            <div className="flex items-start justify-between border-b border-gray-700 mb-2">
              <div>
                <Logo sizeClass="text-2xl" />
              </div>
              <button onClick={() => setOpen(false)} className="p-3 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <FontAwesomeIcon icon={faXmark} className="h-5 w-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
          </div>

          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-4 pt-1 space-y-3">
              {contextBlocks && <div className="bg-white dark:bg-gray-800 mb-4">{contextBlocks}</div>}
              <div>
                <NavMenu onItemClick={() => setOpen(false)} />
              </div>
            </div>
          </div>

          <div className="lg:hidden sticky bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 flex justify-between items-center">
            <div>
              <UserCard />
            </div>
            <div>
              <LogoutButton onClick={() => setOpen(false)} />
            </div>
          </div>
        </div>
      </nav>

      {/* `lg:w-sidebar` es un token de Tailwind: el contenido usa `lg:pl-sidebar` y los dos tienen
          que moverse juntos (ver `tailwind.config.js`). */}
      <aside className="hidden lg:flex lg:flex-col lg:w-sidebar lg:fixed lg:inset-y-0 lg:bg-white lg:dark:bg-gray-800 lg:border-r lg:border-gray-200 lg:dark:border-gray-700">
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex flex-col pt-5 pb-4 overflow-y-auto mt-12">
            {contextBlocks && (
              <div className="px-3">
                <div className="bg-white dark:bg-gray-800 dark:border-gray-700 pt-4">{contextBlocks}</div>
              </div>
            )}
            <div className="px-3 mb-4">
              <div className={`bg-white dark:bg-gray-800 py-2`}>
                <NavMenu onItemClick={() => setOpen(false)} />
              </div>
            </div>
          </div>
          <div className="px-3 pb-4 lg:hidden">
            <LogoutButton />
          </div>
        </div>
      </aside>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
};
