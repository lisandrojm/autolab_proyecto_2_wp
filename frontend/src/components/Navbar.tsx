import React, { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { ClientSelector } from './ClientSelector';
import { ClientContextMenu } from './ClientContextMenu';
import { EmpresaSelector } from './EmpresaSelector';
import { EmpresaContextMenu } from './EmpresaContextMenu';
import { FichasHeader } from './context/FichasHeader';
import { Link, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faBars, faRightFromBracket, faUsers, faUserGear, faBuilding, faArrowUpRightFromSquare, faCalendar, faCog, faUser, faUserShield, faChevronDown, faChevronRight, faFileText, faShoppingCart, faFilePdf, faUsersGear, faLayerGroup, faUmbrellaBeach, faUserTag, faBriefcase, faFileContract, faClock, faListCheck, faBuildingColumns, faBriefcaseMedical, faPiggyBank, faIdCard, faRocket, faLandmark, faPlug, faLocationDot, faSitemap, faIndustry, faShieldHeart, faTag, faPeopleGroup } from '@fortawesome/free-solid-svg-icons';
import { faDropbox } from '@fortawesome/free-brands-svg-icons';
import { Logo } from '../components/ui/Logo';
import axios from '../api/axiosConfig';
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
 * Subgrupo "Plantillas" (dentro de Configuración): agrupa las tres plantillas de documentos.
 * El orden del array es el que se muestra en el menú.
 */
// El membrete va PRIMERO (es prerrequisito de las plantillas); el resto se ordena alfabéticamente.
const MEMBRETE_PATH = '/empresas-membretes';
/**
 * Cómo se llaman los archivos que salen de esas plantillas. Va en el mismo subgrupo porque es
 * transversal a todas —contratos, releases, pedidos y vacaciones— y entra en su orden alfabético,
 * como el resto (el membrete es la única excepción: va primero por ser prerrequisito).
 */
const NOMENCLATURA_PATH = '/nomenclatura-archivos';
const PLANTILLAS_PATHS = [MEMBRETE_PATH, '/pdfs', '/pdfs-vacaciones', '/contratos-frame', '/releases', NOMENCLATURA_PATH];

/**
 * Subgrupo "ARCA" (dentro de Configuración): todo lo que depende del organismo (ex AFIP).
 * El orden del array es el que se muestra en el menú (NO se reordena alfabéticamente):
 * la Conexión va primera porque es el prerrequisito de lo demás.
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
 * Lo que queda acá se importa una vez y casi no se toca. El encabezado "Nomencladores de ARCA"
 * separa eso de Convenios, que además de nomenclador tiene sus grupos y escalas salariales (las
 * escalas SON del convenio: la misma para todas las empleadoras que lo tengan registrado).
 *
 * Sigue sin haber ABM de Puesto Desempeñado ni Situación de Revista: no son campos del registro de
 * 130.
 *
 * "Actividades" sí está, pero es un DICCIONARIO y no un nomenclador del que se elija: lo que un
 * contrato puede declarar sale, y solo, de las actividades del domicilio. El catálogo existe para
 * autocompletar el código y normalizar la descripción al cargarlas ahí. Por eso va pegado a
 * Domicilios de Explotación y comparte su permiso.
 */
const ARCA_NOMENCLADOR_PATHS = ['/obras-sociales', '/arca/sucursales', '/arca/actividades', '/arca/tipos-servicio', '/arca/grupos-tipo-servicio', '/arca/modalidades-contratacion', '/arca/modalidades-liquidacion', '/arca/fuentes-paritaria'];
/**
 * La Conexión va ÚLTIMA y separada por una raya.
 *
 * Estaba primera "porque es el prerrequisito de todo lo demás", y en el orden de lectura eso es
 * cierto pero irrelevante: se configura una vez y no se vuelve a tocar. Los nomencladores son lo
 * que se trabaja, así que van arriba, y la Conexión queda abajo del todo — separada, porque no es
 * un nomenclador y no debería leerse como uno más de la lista.
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
 * "Cómo funciona" va DESPUÉS de la Conexión, al final de todo.
 *
 * No es un nomenclador ni una configuración: no se toca nada ahí. Es la explicación de la cadena
 * —qué depende de qué y en qué orden hay que cargarlo—, que no se deduce de ninguna de las pantallas
 * de arriba porque cada una muestra solo su pedazo.
 */
const ARCA_COMO_FUNCIONA_PATH = '/arca/como-funciona';
/** Guía del único trámite del módulo que sale de la app: la validación de obras sociales. */
const ARCA_GUIA_OS_PATH = '/arca/guia-obras-sociales';
const ARCA_PATHS = [...ARCA_NOMENCLADOR_PATHS, '/convenios', '/arca/categorias', ARCA_CONEXION_PATH, ARCA_CONEXION_OS_PATH, ARCA_COMO_FUNCIONA_PATH, ARCA_GUIA_OS_PATH];

/** ABM de Empresas. La ficha de cada una vive aparte, en el bloque FICHAS. */
const EMPRESAS_PATH = '/empresas';

/**
 * Subgrupo "Usuarios" (dentro de Configuración).
 *
 * Era una sección de primer nivel, "Admin USUARIOS", y no se sostenía: no es un módulo de trabajo
 * como Admin GENERAL —donde se opera todos los días con contratos, pedidos y vacaciones—, son los
 * catálogos con los que se clasifica a una persona. Es exactamente el mismo tipo de cosa que ARCA:
 * se configura y casi no se toca.
 *
 * `/users` va PRIMERO porque es la entidad; Áreas, Turnos, Roles y Roles Empresa son los atributos con los
 * que se la describe. Mismo criterio que el membrete en "Plantillas".
 *
 * Turnos rompe el orden alfabético a propósito y va pegado a Áreas: son el mismo tipo de dato —el par
 * área/turno con el que se ubica a una persona en un proyecto y con el que se carga cada novedad—, y
 * separarlos por Cargos y Niveles obligaba a buscar en dos lugares lo que siempre se toca junto.
 * Estaba suelto en Configuración, entre catálogos que no tienen nada que ver.
 */
const USUARIOS_PATH = '/users';
const USUARIOS_PATHS = [USUARIOS_PATH, '/areas', '/shifts', '/roles', '/roles-empresa'];

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
 * El orden es el del circuito, no alfabético: primero la cuenta y el escaneo de carpetas, después la
 * firma, que depende de que lo anterior esté conectado.
 */
const DOCUMENTOS_PATHS = ["/escaneo-dropbox", "/dropbox-sign"];

/**
 * Subgrupos colapsables de Configuración. `storageKey` persiste el abierto/cerrado y
 * `paths` decide qué items se sacan del listado plano para meterlos adentro del grupo.
 */
const CONFIG_GROUPS = [
  { key: 'plantillas', storageKey: 'configPlantillasOpen', paths: PLANTILLAS_PATHS },
  { key: 'arca', storageKey: 'configArcaOpen', paths: ARCA_PATHS },
  { key: 'usuarios', storageKey: 'configUsuariosOpen', paths: USUARIOS_PATHS },
  { key: 'documentos', storageKey: 'configDocumentosOpen', paths: DOCUMENTOS_PATHS },
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

  const menuItems = useMemo(() => {
    const isSuperAdminTenant = user?.tenantSlug === 'superadmin';

    const base: Array<{
      path: string;
      icon: any;
      label: string;
      external?: boolean;
      scope?: 'global' | 'client';
      count?: number;
      dividerTop?: boolean;
      badge?: string;
      badgeColor?: string;
      disabled?: boolean;
    }> = [];

    if (isSuperAdminTenant) {
      base.push({ path: '/tenants', icon: faBuilding, label: 'Tenants', scope: 'global', count: adminCounts.tenants }, { path: '/users', icon: faUserGear, label: 'Usuarios', scope: 'global', count: adminCounts.users }, { path: '/shifts', icon: faClock, label: 'Turnos', scope: 'global' }, { path: '/roles', icon: faUserShield, label: 'Roles', scope: 'global', count: adminCounts.roles }, { path: '/areas', icon: faLayerGroup, label: 'Áreas', scope: 'global', count: adminCounts.areas }, { path: '/clients', icon: faUsers, label: 'Clientes', scope: 'global', count: adminCounts.clients }, { path: '/arca/categorias', icon: faListCheck, label: 'Categorías', scope: 'global' });
    } else {
      if (hasPermission('admin_roles:view')) base.push({ path: '/roles', icon: faUserShield, label: 'Roles', scope: 'global', count: adminCounts.roles });
      if (hasPermission('admin_roles_empresa:view')) base.push({ path: '/roles-empresa', icon: faUserTag, label: 'Roles Empresa', scope: 'global' });
      if (hasPermission('admin_areas:view')) base.push({ path: '/areas', icon: faLayerGroup, label: 'Áreas', scope: 'global', count: adminCounts.areas });
      if (hasPermission('admin_users:view')) base.push({ path: '/users', icon: faUserGear, label: 'Usuarios', scope: 'global', count: adminCounts.users });
      if (hasPermission('admin_users_import:view')) base.push({ path: '/users/import-wp', icon: faArrowUpRightFromSquare, label: 'Import WP', scope: 'global' });

      // Admin GENERAL Items
      if (hasPermission('admin_clients:view')) base.push({ path: '/clients', icon: faUsers, label: 'Clientes', scope: 'global', count: adminCounts.clients });
      // Sin sufijo "| Global": el grupo ya se llama Admin GENERAL, así que dentro de él el calificador
      // repetía lo que dice el título. Las versiones acotadas se distinguen por dónde están —cuelgan
      // de la ficha de un cliente o de una empresa, con el nombre a la vista— y no por su etiqueta.
      if (hasPermission('admin_projects:view')) base.push({ path: '/admin/projects', icon: faBriefcase, label: 'Proyectos', scope: 'global', count: adminCounts.projects });
      if (hasPermission('admin_sedes:view')) base.push({ path: '/admin/sedes', icon: faBuilding, label: 'Sedes', scope: 'global' });
      if (hasPermission('admin_contracts:view')) base.push({ path: '/admin/contracts', icon: faFileContract, label: 'Contratos', scope: 'global' });
      if (hasPermission('admin_activity_logs:view')) base.push({ path: '/requests', icon: faFileText, label: 'Novedades', scope: 'global', dividerTop: true });
      if (hasPermission('admin_orders:view')) base.push({ path: '/orders', icon: faShoppingCart, label: 'Pedidos', scope: 'global' });
      if (hasPermission('admin_vacations:view')) base.push({ path: '/vacations', icon: faUmbrellaBeach, label: 'Vacaciones', scope: 'global' });
      // El ícono de Dropbox dice de dónde salen los documentos, así que el nombre no tiene que
      // repetirlo: la marca queda en la imagen y la etiqueta nombra la pantalla.
      if (hasPermission('admin_hr_documents:view')) base.push({ path: '/documents', icon: faDropbox, label: 'Documentos', scope: 'global' });

      // CONFIGURACION Items
      if (hasPermission('config_activity_logs:view')) base.push({ path: '/requests/config', icon: faFileText, label: 'Novedades', scope: 'global' });

      if (hasPermission('config_orders:view')) base.push({ path: '/order-types', icon: faShoppingCart, label: 'Pedidos', scope: 'global' });
      if (hasPermission('config_shifts:view')) base.push({ path: '/shifts', icon: faClock, label: 'Turnos', scope: 'global' });
      if (hasPermission('config_vacations:view')) base.push({ path: '/vacations-rules', icon: faUmbrellaBeach, label: 'Vacaciones', scope: 'global' });
      if (hasPermission('config_holidays:view')) base.push({ path: '/holidays', icon: faCalendar, label: 'Feriados', scope: 'global' });
      if (hasPermission('config_pdf_templates:view')) base.push({ path: '/pdfs', icon: faFilePdf, label: 'Pedidos', scope: 'global' });
      if (hasPermission('config_pdf_templates:view')) base.push({ path: '/pdfs-vacaciones', icon: faFilePdf, label: 'Vacaciones', scope: 'global' });
      if (hasPermission('config_releases:view')) base.push({ path: '/releases', icon: faFilePdf, label: 'Releases', scope: 'global' });
      // Cómo se llaman los archivos que salen de todas esas plantillas. Comparte permiso con ellas:
      // quien puede definir el contenido de un documento puede definir su nombre.
      if (hasPermission('config_releases:view') || hasPermission('config_contratos_frame:view')) base.push({ path: NOMENCLATURA_PATH, icon: faTag, label: 'Nomenclatura de archivos', scope: 'global' });
      if (hasPermission('config_releases:view')) base.push({ path: '/releases-tipos', icon: faRocket, label: 'Releases', scope: 'global' });
      if (hasPermission('config_categorias_sat:view') || hasPermission('config_frame_functions:view')) base.push({ path: '/arca/categorias', icon: faListCheck, label: 'Categorías', scope: 'global' });
      if (hasPermission('config_bancos:view')) base.push({ path: '/bancos', icon: faBuildingColumns, label: 'Entidades Financieras', scope: 'global' });
      if (hasPermission('config_obras_sociales:view')) base.push({ path: '/obras-sociales', icon: faBriefcaseMedical, label: 'Obras Sociales', scope: 'global' });
      if (hasPermission('config_convenios:view')) base.push({ path: '/convenios', icon: faFileContract, label: 'Convenios', scope: 'global' });
      // `config_sindicatos:view` es nuevo: hasta que se tilde en los roles se muestra a quien ya
      // administra Convenios, que es la configuración más cercana (misma familia de relación laboral).
      // Queda SUELTO en Configuración, no adentro del subgrupo ARCA: Convenios está ahí por ser un
      // nomenclador del organismo, y este catálogo es propio de la plataforma. Ver `configPaths`.
      if (hasPermission('config_sindicatos:view') || hasPermission('config_convenios:view')) base.push({ path: '/sindicatos', icon: faPeopleGroup, label: 'Sindicatos', scope: 'global' });
      if (hasPermission('config_centros_costo:view')) base.push({ path: '/centros-costo', icon: faPiggyBank, label: 'Centros de Costos', scope: 'global' });
      if (hasPermission('config_contratos_frame:view')) base.push({ path: '/contratos-frame', icon: faFilePdf, label: 'Contratos', scope: 'global' });
      // `config_contratos:view` y `config_estados:view` son nuevos: hasta que se tilden en los roles,
      // se muestran a quien ya administra los tipos de contrato (Contratos FRAME).
      // Contratos y Estados viven en un solo ítem con dos tabs: alcanza con cualquiera de los tres permisos.
      if (hasPermission('config_contratos:view') || hasPermission('config_estados:view') || hasPermission('config_contratos_frame:view')) base.push({ path: '/contratos', icon: faFileContract, label: 'Contratos', scope: 'global' });
      if (hasPermission('config_empresas:view')) base.push({ path: '/empresas', icon: faBuilding, label: 'Empresas', scope: 'global' });
      if (hasPermission('config_membretes:view')) base.push({ path: '/empresas-membretes', icon: faFilePdf, label: 'Empresa/s | Membrete/s y firma', scope: 'global' });
      // Las dos viven adentro del subgrupo "Documentos" (ver DOCUMENTOS_PATHS) y ahí es el grupo el
      // que dice de qué se trata. Cada una se sigue nombrando por el SERVICIO, a secas: qué configura
      // —la cuenta y el escaneo de carpetas acá, la casilla de avisos de firma en la de abajo— lo
      // dice el subtítulo de su pantalla, que es donde hay lugar para explicarlo.
      if (hasPermission('config_escaneo_dropbox:view')) base.push({ path: '/escaneo-dropbox', icon: faDropbox, label: 'Dropbox', scope: 'global' });
      // Comparte permiso con el escaneo de Dropbox: las dos configuran la misma integración.
      if (hasPermission('config_escaneo_dropbox:view')) base.push({ path: '/dropbox-sign', icon: faDropbox, label: 'DropboxSign', scope: 'global' });
      // Dentro del subgrupo "ARCA" se muestra como "Conexión" (el organismo ya lo nombra el grupo).
      // El ícono es el de conexión y NO el del organismo: `faLandmark` ya lo lleva el encabezado del
      // grupo, así que repetirlo dejaba dos íconos idénticos uno debajo del otro y no distinguía la
      // pantalla. Es el mismo `faPlug` que la conexión de Dropbox: misma clase de cosa, mismo ícono.
      if (hasPermission('config_afip:view')) base.push({ path: '/afip', icon: faPlug, label: 'Constancia de CUIT', scope: 'global' });
      // Misma familia, mismo ícono de conexión: lo que cambia es para qué sirve, y eso lo dice el
      // rótulo. Comparte permiso porque es la misma decisión de quién configura la integración.
      if (hasPermission('config_afip:view')) base.push({ path: ARCA_CONEXION_OS_PATH, icon: faPlug, label: 'Obras sociales', scope: 'global' });
      // Comparte permiso con la Conexión: quien puede ver cómo se conecta el módulo puede leer cómo
      // funciona. No expone ningún dato — es la explicación del circuito.
      if (hasPermission('config_afip:view')) base.push({ path: ARCA_COMO_FUNCIONA_PATH, icon: faSitemap, label: 'Cómo funciona', scope: 'global' });
      if (hasPermission('config_afip:view')) base.push({ path: ARCA_GUIA_OS_PATH, icon: faShieldHeart, label: 'Validar obras sociales', scope: 'global' });
      // Tablas oficiales del organismo: comparten un solo permiso porque son el mismo tipo de
      // nomenclador (se siembran desde ARCA y casi no se editan), no tres módulos distintos.
      if (hasPermission('config_arca_sucursales:view')) base.push({ path: '/arca/sucursales', icon: faLocationDot, label: 'Domicilios de Explotación', scope: 'global' });
      // Va PEGADO a Domicilios y comparte su permiso: es su diccionario, no un catálogo autónomo. Lo
      // que un contrato puede declarar sigue saliendo del domicilio; acá solo viven código y texto.
      if (hasPermission('config_arca_sucursales:view')) base.push({ path: '/arca/actividades', icon: faIndustry, label: 'Actividades', scope: 'global' });
      if (hasPermission('config_arca_tablas:view')) {
        // "Modalidad de Contrato" es como lo llama ARCA. Era "Modalidades de Contratación" acá y
        // "Modalidad de contrato" en el formulario del tipo de contrato: dos nombres para el MISMO
        // catálogo (153 registros, mismos códigos) hacían dudar de si eran dos cosas.
        base.push({ path: '/arca/modalidades-contratacion', icon: faFileContract, label: 'Modalidades de Contrato', scope: 'global' });
        base.push({ path: '/arca/tipos-servicio', icon: faListCheck, label: 'Tipos de Servicio', scope: 'global' });
        // Va PEGADO a Tipos de Servicio y comparte su permiso, igual que Actividades con Domicilios:
        // son 2 registros que nadie navega, existen para filtrar el de arriba.
        base.push({ path: '/arca/grupos-tipo-servicio', icon: faLayerGroup, label: 'Grupos de Tipo de Servicio', scope: 'global' });
        base.push({ path: '/arca/fuentes-paritaria', icon: faListCheck, label: 'Fuentes de Paritarias', scope: 'global' });
        base.push({ path: '/arca/modalidades-liquidacion', icon: faClock, label: 'Modalidades de Liquidación', scope: 'global' });
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

    // Partición de items: Admin General y Configuración. Lo que era "Admin Usuarios" pasó a ser un
    // subgrupo de Configuración (ver `usuariosGroup`), así arriba queda solo el módulo de trabajo.
    const generalAdminItems = (isSuperAdminTenant ? adminItems.filter((item) => ['/tenants'].includes(item.path)) : adminItems.filter((item) => ['/admin/projects', '/admin/contracts', '/orders', '/vacations', '/requests', '/documents'].includes(item.path))).sort(byLabel);

    // Ojo: los paths de CONFIG_GROUPS (Plantillas, ARCA, Usuarios, Documentos) NO van acá: se sacan
    // del listado plano para meterlos adentro de su subgrupo, y dejarlos también acá los duplicaría.
    const configPaths = ['/requests/config', '/order-types', '/vacations-rules', '/holidays', '/clients', '/centros-costo', '/bancos', '/sindicatos', '/contratos', '/releases-tipos', '/admin/sedes'];
    // "Mi Perfil" está en los DOS lados a propósito: como atajo en la barra de arriba (junto al
    // usuario) y acá, para quien lo busca recorriendo el menú. Entra en el orden alfabético.
    const profileItem = { path: '/mi-perfil', icon: faIdCard, label: 'Mi Perfil', scope: 'global' as const };

    // Subgrupo "Plantillas": el membrete va primero (prerrequisito) y el resto alfabético.
    const plantillasBuilt = PLANTILLAS_PATHS.map((p) => adminItems.find((item) => item.path === p)).filter(Boolean) as typeof adminItems;
    const plantillasChildren = [
      ...plantillasBuilt.filter((i) => i.path === MEMBRETE_PATH),
      ...plantillasBuilt.filter((i) => i.path !== MEMBRETE_PATH).sort(byLabel),
    ];
    const plantillasGroup = { path: '#plantillas', groupKey: 'plantillas', icon: faFilePdf, label: 'Plantillas', scope: 'global' as const, children: plantillasChildren };

    // Subgrupo "ARCA": respeta el orden de ARCA_PATHS (ver el comentario de esa constante). A
    // diferencia de los demás, NO se ordena alfabéticamente. El encabezado se inserta antes del
    // primer nomenclador presente, para que no quede colgado si el usuario no tiene ese permiso.
    const arcaChildren: any[] = [];
    for (const p of ARCA_PATHS) {
      const item = adminItems.find((i) => i.path === p);
      if (!item) continue;
      if (ARCA_NOMENCLADOR_PATHS.includes(p) && !arcaChildren.some((c) => c.sectionKey === 'nomencladores')) {
        arcaChildren.push({ path: '#arca-nomencladores', sectionKey: 'nomencladores', section: 'Nomencladores de ARCA', hint: 'Universales: se importan una vez y valen para todos los CUIT.' });
      }
      // Raya antes de la Conexión: no es un nomenclador y no tiene que leerse como uno más. Solo se
      // dibuja si arriba quedó algo — si no, sería una raya colgada al principio del grupo.
      if (p === ARCA_CONEXION_PATH && arcaChildren.length > 0) arcaChildren.push({ path: '#arca-separador', separador: true });

      /*
        Las dos conexiones entran en un subgrupo propio, no sueltas.

        Se arma cuando aparece la primera y la segunda se le agrega adentro. Así el orden de
        `ARCA_PATHS` sigue mandando —la Conexión queda donde estaba— y no hace falta una lista aparte
        que se pueda desincronizar de aquella.
      */
      if (ARCA_CONEXION_PATHS.includes(p)) {
        let grupo = arcaChildren.find((c) => c.groupKey === 'arcaConexion');
        if (!grupo) {
          grupo = { path: '#arca-conexion', groupKey: 'arcaConexion', icon: faPlug, label: 'Conexión', scope: 'global' as const, children: [] as any[] };
          arcaChildren.push(grupo);
        }
        grupo.children.push(item);
        continue;
      }

      arcaChildren.push(item);
    }
    const arcaGroup = { path: '#arca', groupKey: 'arca', icon: faLandmark, label: 'ARCA', scope: 'global' as const, children: arcaChildren };

    // Subgrupo "Documentos": en el orden del circuito (ver DOCUMENTOS_PATHS), no alfabético.
    const documentosChildren = DOCUMENTOS_PATHS.map((p) => adminItems.find((item) => item.path === p)).filter(Boolean) as typeof adminItems;
    const documentosGroup = { path: '#documentos', groupKey: 'documentos', icon: faDropbox, label: 'Documentos', scope: 'global' as const, children: documentosChildren };

    // Subgrupo "Usuarios": la entidad primero y sus catálogos detrás, en el orden de USUARIOS_PATHS.
    const usuariosChildren = USUARIOS_PATHS.map((p) => adminItems.find((item) => item.path === p)).filter(Boolean) as typeof adminItems;
    const usuariosGroup = { path: '#usuarios', groupKey: 'usuarios', icon: faUserGear, label: 'Usuarios', scope: 'global' as const, children: usuariosChildren };

    /**
     * En Configuración queda solo el LISTADO de empresas.
     *
     * Abrir la ficha de una empleadora subió al bloque FICHAS: es la operación de todos los días, no
     * configuración. Lo que queda acá es el ABM, y no necesita calificador: lo distingue estar en
     * otro bloque del menú, y la ficha abierta muestra el nombre de la empresa.
     */
    const empresasItem = adminItems.find((item) => item.path === EMPRESAS_PATH);

    const configItems = [
      ...adminItems.filter((item) => configPaths.includes(item.path)),
      ...(hasPermission('config_profile:view') ? [profileItem] : []),
      ...(plantillasChildren.length > 0 ? [plantillasGroup] : []),
      ...(arcaChildren.length > 0 ? [arcaGroup] : []),
      ...(usuariosChildren.length > 0 ? [usuariosGroup] : []),
      ...(documentosChildren.length > 0 ? [documentosGroup] : []),
      ...(empresasItem ? [empresasItem] : []),
    ].sort(byLabel) as any[];
    // "Import WP" es un módulo temporal → va al FINAL de Configuración (después del orden alfabético).
    const importItem = adminItems.find((item) => item.path === '/users/import-wp');
    if (importItem) configItems.push(importItem);

    const renderMenuItem = (item: any, isChild = false) => {
      // Raya divisoria dentro de un subgrupo. No es navegable ni tiene texto.
      if (item.separador) {
        return <div key={item.path} className="my-2 border-t border-gray-200 dark:border-gray-700" role="separator" />;
      }

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
              </div>
              <FontAwesomeIcon icon={isOpen ? faChevronDown : faChevronRight} className="h-3 w-3 shrink-0" />
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

      // Disabled state
      if (item.disabled) {
        return (
          <div key={item.path} className="group relative flex items-center justify-between px-2 py-2 rounded transition-all cursor-not-allowed opacity-40 bg-gray-100 dark:bg-gray-700 select-none">
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <div className="h-8 w-8 flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-600">
                <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
              </div>
              <span className="font-medium truncate">{item.label}</span>
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
   * Bloque FICHAS: abrir la ficha de una empleadora o de un cliente.
   *
   * Se llamaba "Contexto" y era una promesa incumplida: NINGUNO de los dos filtra nada fuera de sus
   * propias subpáginas, que además resuelven a quién muestran desde la URL y no desde el store.
   * Admin GENERAL y Configuración muestran todo igual. Ver `FichasHeader` para el detalle.
   *
   * Empresa va PRIMERO: de ella cuelga la operación de ARCA, que es el trabajo de todos los días.
   *
   * Es un VALOR JSX, no un componente definido acá adentro. Un `const X: React.FC` dentro del cuerpo
   * es un tipo de componente nuevo en cada render del padre, así que React desmonta y vuelve a montar
   * el subárbol y los selectores perderían su estado (el desplegable se cerraría solo). Es el mismo
   * motivo por el que el estado de los subgrupos de `NavMenu` vive en el padre.
   */
  const contextBlocks = (showClientContext || showEmpresaContext) && (
    <div>
      <FichasHeader />
      {/* Los dos ejes se separan con AIRE, no con una línea: con la ficha de empresa abierta, sus
          secciones (Información, ARCA, Contratos) quedaban pegadas al chip de CLIENTE y se leían como
          si CLIENTE colgara de la empresa. La línea alcanzaba para eso pero cortaba el sidebar en dos
          con los dos chips cerrados, que es el estado más frecuente. */}
      <div className="space-y-3">
        {showEmpresaContext && (
          <div>
            <EmpresaSelector />
            {selectedEmpresa && <EmpresaContextMenu />}
          </div>
        )}
        {showClientContext && (
          <div>
            <ClientSelector />
            {selectedClient && <ClientContextMenu />}
          </div>
        )}
      </div>
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
