import { matchPath } from "react-router-dom";
import { esPermisoMobile, esPermisoPlataforma } from "../utils/permisosMobile";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * QUIÉN PUEDE ABRIR CADA RUTA, EN UN SOLO LUGAR
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Antes los permisos solo escondían el ítem del menú: la ruta seguía abierta, y quien escribía la URL
 * (o la tenía en el historial del navegador) entraba igual. Destildar un permiso no sacaba a nadie.
 *
 * Ahora esta tabla la leen TRES cosas, y por eso no pueden contradecirse:
 *
 *   · `ProtectedRoute`: sin permiso para la ruta, cierra la sesión y manda al login.
 *   · El menú (`Navbar`): un ítem se muestra sólo si su ruta pasa esta tabla.
 *   · Los botones y links entre pantallas (`usePuedeAbrir`, `LinkSiPuede`): no se ofrece ir a donde
 *     la guarda te echaría.
 *
 * CERRADO POR DEFECTO: una ruta protegida que no está en la tabla no la abre nadie más que el
 * SuperAdmin. Una pantalla nueva no queda pública por olvido; queda inaccesible hasta que se la agrega
 * acá, y en desarrollo la consola avisa cuál falta.
 *
 * PORTALES. Además del permiso de la pantalla, hay que tener acceso al portal: a la plataforma
 * (cualquier permiso que no sea del móvil ni una capacidad) o a la app (`/mobile`, cualquier permiso
 * `mobile_*`). Es la misma regla con que el login decide adónde entra cada uno, así una sesión que
 * quedó abierta en el otro portal no sirve de puerta.
 *
 * Esto es la puerta de la interfaz. La del dato es el server: una ruta cerrada acá no protege un
 * endpoint que no chequea permisos.
 */

export interface ReglaRuta {
  /** Patrón de react-router (`/clients/:clientId`, `/empresas/:empresaId/*`). */
  path: string;
  /** Alcanza con CUALQUIERA. Vacío o ausente: alcanza con tener acceso al portal. */
  permisos?: string[];
  soloSuperAdmin?: boolean;
  /** Puerta de entrada de los dos portales: no muestra nada, redirige (`DashboardRouter`). */
  entrada?: boolean;
}

/**
 * Los permisos son los mismos que usa el menú para mostrar cada ítem. Donde el menú acepta varios
 * (un permiso nuevo y el viejo que lo cubría mientras se tilda en los roles) acá también.
 *
 * El ORDEN importa para una sola cosa: `rutaInicial` elige la primera que la persona puede abrir.
 */
export const REGLAS_RUTAS: ReglaRuta[] = [
  // --- Lo que se abría por defecto -------------------------------------------------------------
  { path: "/users", permisos: ["admin_users:view"] },
  // `client:view` también: el selector de cliente del menú vuelve a esta lista al deseleccionar.
  { path: "/clients", permisos: ["admin_clients:view", "client:view"] },
  { path: "/admin/projects", permisos: ["admin_projects:view"] },

  // --- Usuarios --------------------------------------------------------------------------------
  { path: "/tenants", permisos: ["tenants:view"] },
  { path: "/permisos", soloSuperAdmin: true },
  { path: "/roles", permisos: ["admin_roles:view"] },
  { path: "/roles-empresa", permisos: ["admin_roles_empresa:view"] },
  { path: "/areas", permisos: ["admin_areas:view"] },
  { path: "/shifts", permisos: ["config_shifts:view"] },
  { path: "/users/import-wp", permisos: ["admin_users_import:view"] },
  { path: "/terminos-condiciones", permisos: ["config_terminos:view", "admin_users:view"] },
  { path: "/mi-perfil", permisos: ["config_profile:view"] },

  // --- Cliente ---------------------------------------------------------------------------------
  { path: "/clients/:clientId", permisos: ["client:view", "admin_clients:view"] },
  { path: "/clients/:clientId/projects", permisos: ["client:view", "admin_clients:view"] },
  { path: "/clients/:clientId/users", permisos: ["client:view", "admin_clients:view"] },

  // --- Admin GENERAL ---------------------------------------------------------------------------
  // Al proyecto se llega desde Proyectos, desde la ficha del cliente, desde Contratos y desde los
  // contratos de una empresa: cualquiera de esas puertas lo abre.
  { path: "/projects/:projectId", permisos: ["admin_projects:view", "client:view", "admin_contracts:view", "config_empresas:view"] },
  { path: "/projects/:projectId/team", permisos: ["admin_projects:view", "client:view", "admin_contracts:view", "config_empresas:view"] },
  { path: "/valoraciones", permisos: ["config_valoraciones:view", "config_frame_functions:view"] },
  { path: "/admin/sedes", permisos: ["admin_sedes:view"] },
  { path: "/admin/contracts", permisos: ["admin_contracts:view"] },
  { path: "/admin/contratos-sin-dias", permisos: ["admin_contracts:view"] },
  { path: "/admin/plantillas-equipo", permisos: ["admin_hiring_templates:view"] },
  { path: "/admin/solicitudes", permisos: ["admin_users:view"] },
  { path: "/requests", permisos: ["admin_activity_logs:view"] },
  { path: "/orders", permisos: ["admin_orders:view"] },
  { path: "/vacations", permisos: ["admin_vacations:view"] },
  { path: "/vacations/calendar", permisos: ["admin_vacations:view"] },
  { path: "/documents", permisos: ["admin_hr_documents:view"] },

  // --- Configuración ---------------------------------------------------------------------------
  { path: "/requests/config", permisos: ["config_activity_logs:view"] },
  { path: "/order-types", permisos: ["config_orders:view"] },
  { path: "/vacations-rules", permisos: ["config_vacations:view"] },
  { path: "/holidays", permisos: ["config_holidays:view"] },
  { path: "/pdfs", permisos: ["config_pdf_templates:view"] },
  { path: "/pdfs-vacaciones", permisos: ["config_pdf_templates:view"] },
  { path: "/releases", permisos: ["config_releases:view"] },
  { path: "/releases-tipos", permisos: ["config_releases:view"] },
  { path: "/nomenclatura-archivos", permisos: ["config_releases:view", "config_contratos_frame:view"] },
  { path: "/arca/categorias", permisos: ["config_categorias_sat:view", "config_frame_functions:view"] },
  { path: "/bancos", permisos: ["config_bancos:view"] },
  { path: "/obras-sociales", permisos: ["config_obras_sociales:view"] },
  { path: "/convenios", permisos: ["config_convenios:view"] },
  { path: "/sindicatos", permisos: ["config_sindicatos:view", "config_convenios:view"] },
  { path: "/paises-residencia", permisos: ["config_paises_residencia:view", "config_bancos:view"] },
  { path: "/centros-costo", permisos: ["config_centros_costo:view"] },
  { path: "/contratos-frame", permisos: ["config_contratos_frame:view"] },
  { path: "/contratos", permisos: ["config_contratos:view", "config_estados:view", "config_contratos_frame:view"] },
  { path: "/empresas", permisos: ["config_empresas:view"] },
  { path: "/empresas/:empresaId", permisos: ["config_empresas:view"] },
  { path: "/empresas/:empresaId/*", permisos: ["config_empresas:view"] },
  { path: "/empresas-membretes", permisos: ["config_membretes:view"] },
  { path: "/ddbb/mongodb", permisos: ["config_escaneo_dropbox:view"] },
  { path: "/escaneo-dropbox", permisos: ["config_escaneo_dropbox:view"] },
  { path: "/dropbox-sign", permisos: ["config_escaneo_dropbox:view"] },
  { path: "/afip", permisos: ["config_afip:view"] },
  { path: "/arca/conexion-obras-sociales", permisos: ["config_afip:view"] },
  { path: "/arca/como-funciona", permisos: ["config_afip:view"] },
  { path: "/arca/guia-obras-sociales", permisos: ["config_afip:view"] },
  { path: "/arca/sucursales", permisos: ["config_arca_sucursales:view"] },
  { path: "/arca/actividades", permisos: ["config_arca_sucursales:view"] },
  { path: "/arca/modalidades-contratacion", permisos: ["config_arca_tablas:view"] },
  { path: "/arca/tipos-servicio", permisos: ["config_arca_tablas:view"] },
  { path: "/arca/grupos-tipo-servicio", permisos: ["config_arca_tablas:view"] },
  { path: "/arca/fuentes-paritaria", permisos: ["config_arca_tablas:view"] },
  { path: "/arca/modalidades-liquidacion", permisos: ["config_arca_tablas:view"] },
  { path: "/arca/puestos-desempenados", permisos: ["config_arca_tablas:view"] },
  { path: "/arca/situaciones-revista", permisos: ["config_arca_tablas:view"] },

  // --- Entradas: redirigen a la primera pantalla permitida (ver `rutaInicial`) --------------------
  { path: "/", entrada: true },
  { path: "/dashboard", entrada: true },

  // --- App móvil: cada vista se protege adentro con su permiso (apps/mobile/src/App.tsx) ----------
  { path: "/mobile/*" },
];

/** Lo mínimo del usuario que hace falta para decidir. */
export interface UsuarioAcceso {
  permissions?: string[];
  roles?: Array<string | { name?: string }>;
  primaryRole?: string | null;
  tenantSlug?: string;
}

export const esSuperAdmin = (user: UsuarioAcceso | null | undefined): boolean =>
  !!user &&
  (user.tenantSlug === "superadmin" ||
    user.primaryRole?.toLowerCase() === "superadmin" ||
    (user.roles || []).some((r) => String(typeof r === "string" ? r : r?.name || "").toLowerCase() === "superadmin"));

/** Mismo criterio que `authStore.hasPermission`: el permiso exacto, `*` o `modulo:*`. */
const tiene = (permisos: string[], permiso: string): boolean => {
  const [modulo] = permiso.split(":");
  return permisos.includes(permiso) || permisos.includes("*") || permisos.includes(`${modulo}:*`);
};

export const esRutaMobile = (pathname: string): boolean => pathname === "/mobile" || pathname.startsWith("/mobile/");

/** Mismas reglas que el login (`LoginPage`): qué portal abre cada familia de permisos. */
export const tieneAccesoPlataforma = (user: UsuarioAcceso | null | undefined): boolean => esSuperAdmin(user) || (user?.permissions || []).some(esPermisoPlataforma);
export const tieneAccesoMobile = (user: UsuarioAcceso | null | undefined): boolean => esSuperAdmin(user) || (user?.permissions || []).some(esPermisoMobile);

// Se saca la query y el hash: `/contratos?tab=states` es la ruta `/contratos`.
const soloPath = (destino: string): string => destino.split(/[?#]/)[0] || "/";

export const reglaDeRuta = (pathname: string): ReglaRuta | undefined => {
  const path = soloPath(pathname);
  return REGLAS_RUTAS.find((r) => matchPath({ path: r.path, end: true }, path));
};

const avisadas = new Set<string>();

/** ¿Esta persona puede abrir esta URL? Es LA pregunta: la hacen la guarda, el menú y los links. */
export const puedeAbrirRuta = (user: UsuarioAcceso | null | undefined, destino: string): boolean => {
  if (!user) return false;
  const path = soloPath(destino);
  if (esSuperAdmin(user)) return true;

  const regla = reglaDeRuta(path);
  if (regla?.entrada) return tieneAccesoPlataforma(user) || tieneAccesoMobile(user);

  if (esRutaMobile(path) ? !tieneAccesoMobile(user) : !tieneAccesoPlataforma(user)) return false;

  if (!regla) {
    if (import.meta.env.DEV && !avisadas.has(path)) {
      avisadas.add(path);
      console.error(`[accesoRutas] «${path}» no está en REGLAS_RUTAS (config/accesoRutas.ts): nadie salvo el SuperAdmin la puede abrir.`);
    }
    return false;
  }
  if (regla.soloSuperAdmin) return false;
  if (!regla.permisos?.length) return true;
  const permisos = user.permissions || [];
  return regla.permisos.some((p) => tiene(permisos, p));
};

/**
 * Adónde entra alguien que llega a `/` (o recién se logueó): la primera pantalla de la tabla que puede
 * abrir. `null` si no puede abrir ninguna de la plataforma.
 */
export const rutaInicial = (user: UsuarioAcceso | null | undefined): string | null => {
  if (!user) return null;
  if (user.tenantSlug === "superadmin") return "/tenants";
  const regla = REGLAS_RUTAS.find((r) => !r.entrada && !r.path.includes(":") && !r.path.includes("*") && puedeAbrirRuta(user, r.path));
  return regla?.path ?? null;
};
