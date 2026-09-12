import React, { useState, useEffect } from "react";
import { BloqueEstado } from "../components/ui/BloqueEstado";
import { fuzzyMatch } from "../utils/searchHelpers";
import { useAuthStore } from "../stores/authStore";
import { rolesAPI, Role } from "../api/roles";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Card } from "../components/ui/Card";
import { InfoModal } from "../components/ui/InfoModal";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash, faUserShield, faEdit, faPlus, faShieldHalved, faSquareCheck, faBuilding, faUserGear, faInfoCircle, faLock, faEye, faMobileAlt, faUsers, faUsersGear, faCog, faUserGraduate, faTable, faGrip, faUserTie, faLayerGroup, faClock, faCheckDouble, faBroom } from "@fortawesome/free-solid-svg-icons";
import { getHelp, hasHelp } from "../data/help/helpContent";
// Un permiso por tarjeta de la app. Ver el porqué y la contraparte del server en ese módulo.
import { esPermisoMobile, MOBILE_ITEMS, MOBILE_PERMISSIONS } from "../utils/permisosMobile";
import { useNavigate } from "react-router-dom";

const HELP_KEY = "roles" as const;



// Definición de módulos con metadatos
interface PermissionModule {
  label: string;
  icon: any;
  description: string;
  permissions: string[];
}

/**
 * Los permisos, agrupados y ordenados COMO EL MENÚ LATERAL.
 *
 * Cada permiso destapa un ítem del menú, así que esta pantalla es el menú visto desde el otro lado:
 * si acá se llaman distinto o están en otro grupo, quien arma un rol no puede saber qué está
 * habilitando. Se había desfasado —"Admin USUARIOS" ya no existe (pasó a ser el subgrupo Usuarios de
 * Configuración), Clientes y Sedes figuraban en Admin GENERAL cuando viven en Configuración, y varias
 * etiquetas eran las de antes de los renombres.
 *
 * Reglas para mantenerlo alineado:
 *   - El orden dentro de cada grupo es el del menú (alfabético, y los subgrupos en su orden propio).
 *   - La etiqueta es la del ítem del menú. Si el permiso destapa un subgrupo, se escribe
 *     "Subgrupo | Ítem", igual que el menú los muestra anidados.
 *   - Si un permiso destapa MÁS de un ítem, la etiqueta los nombra a todos: es la única forma de que
 *     no parezca que falta un permiso.
 */
const AVAILABLE_PERMISSIONS: Record<string, PermissionModule> = {
  client: {
    label: "Fichas",
    icon: faUsers,
    description: 'El bloque de arriba del menú. La ficha de Empresa no tiene permiso propio: la habilita "Empresas", en Configuración.',
    permissions: ["client:view"],
  },
  admin_general: {
    label: "Admin GENERAL",
    icon: faUsersGear,
    description: "Lo que se opera todos los días. Incluye el subgrupo Usuarios.",
    /*
      ESTA LISTA TIENE QUE ESPEJAR AL MENÚ, o los permisos se buscan donde no están.

      Usuarios, Áreas, Turnos y Roles Empresa se mudaron al subgrupo «Usuarios» de Admin GENERAL (ver
      `USUARIOS_PATHS_GENERAL` en Navbar.tsx) y acá seguían listados bajo Configuración. La consecuencia
      no es cosmética: quien arma un rol busca el permiso en el bloque donde ve la pantalla, no lo
      encuentra, y termina dando de más o de menos.

      Van al final y en el orden del menú —la entidad primero, Turnos pegado a Áreas— para que las dos
      listas se lean igual.
    */
    permissions: [
      "admin_contracts:view",
      "admin_hr_documents:view",
      "admin_activity_logs:view",
      "admin_orders:view",
      "admin_projects:view",
      "admin_vacations:view",
      "admin_users:view",
      "admin_areas:view",
      "config_shifts:view",
      "admin_roles_empresa:view",
    ],
  },
  config: {
    label: "Configuración",
    icon: faCog,
    description: "Catálogos y ajustes. Incluye los subgrupos ARCA, Plantillas, Documentos y Usuarios.",
    permissions: [
      // ARCA (subgrupo), en el orden en que el menú los muestra
      "config_obras_sociales:view",
      "config_arca_sucursales:view",
      "config_arca_tablas:view",
      "config_convenios:view",
      "config_categorias_sat:view",
      "config_frame_functions:view",
      "config_afip:view",
      // Resto de Configuración, alfabético como el menú
      "config_centros_costo:view",
      "admin_clients:view",
      "config_contratos:view",
      "config_estados:view",
      "config_escaneo_dropbox:view",
      "config_empresas:view",
      "config_bancos:view",
      "config_sindicatos:view",
      "config_holidays:view",
      "config_profile:view",
      "config_activity_logs:view",
      "config_orders:view",
      // Plantillas (subgrupo): el membrete va primero, igual que en el menú
      "config_membretes:view",
      "config_contratos_frame:view",
      "config_pdf_templates:view",
      "config_releases:view",
      "admin_sedes:view",
      // Usuarios (subgrupo): acá quedó SOLO Roles. Los otros cuatro se mudaron a Admin GENERAL — ver
      // el comentario de ese bloque y `ROLES_PATHS` en Navbar.tsx.
      "admin_roles:view",
      "config_vacations:view",
      // Import WP va último en el menú por ser temporal
      "admin_users_import:view",
    ],
  },
  /*
    «Proyectos → Responsable de Proyecto» ya no está acá.

    Poder quedar a cargo de un proyecto no destapa ninguna pantalla: es un atributo de la persona, y
    como permiso obligaba a inventarle un rol a alguien sólo para poder elegirlo en el selector de
    responsable. Pasó a ser un tilde en la ficha del usuario, pestaña Sistema.
  */
  mobile: {
    label: "App Mobile",
    icon: faMobileAlt,
    description: "Las tarjetas de la pantalla de inicio de la app. Se elige una por una: tener alguna ES el acceso a la app.",
    permissions: MOBILE_PERMISSIONS,
  },
};

/** Los módulos de PLATAFORMA, en el orden del menú. `mobile` va en su propia sección. */
const PLATFORM_MODULE_KEYS = Object.keys(AVAILABLE_PERMISSIONS).filter((key) => key !== "mobile");

const PLATFORM_PERMISSIONS: string[] = PLATFORM_MODULE_KEYS.flatMap((key) => AVAILABLE_PERMISSIONS[key].permissions);


/** El nombre de cada permiso es el del ítem del menú que destapa. Ver el comentario de arriba. */
const MODULE_LABELS: Record<string, string> = {
  // Fichas
  "client:view": "Cliente",

  // Admin GENERAL
  "admin_contracts:view": "Contratos",
  "admin_hr_documents:view": "Documentos",
  "admin_activity_logs:view": "Novedades",
  "admin_orders:view": "Pedidos",
  "admin_projects:view": "Proyectos",
  "admin_vacations:view": "Vacaciones",

  // Configuración → ARCA
  "config_obras_sociales:view": "ARCA | Obras Sociales",
  "config_arca_sucursales:view": "ARCA | Domicilios de Explotación y Actividades",
  // Un permiso, tres pantallas: son el mismo tipo de nomenclador y se siembran juntas.
  "config_arca_tablas:view": "ARCA | Tipos de Servicio y Modalidades",
  "config_convenios:view": "ARCA | Convenios",
  "config_categorias_sat:view": "ARCA | Categorías",
  // Categorías tiene dos pestañas y cada una su permiso: con este solo se ve la de Funciones.
  "config_frame_functions:view": "Usuarios | Roles Empresa (mapeo a categorías)",
  "config_afip:view": "ARCA | Conexión y Cómo funciona",

  // Configuración
  "config_centros_costo:view": "Centros de Costos",
  "admin_clients:view": "Clientes",
  "config_contratos:view": "Contratos",
  "config_estados:view": "Contratos → Estados",
  "config_escaneo_dropbox:view": "Dropbox y DropboxSign",
  "config_empresas:view": "Empresas (y la ficha de Empresa)",
  "config_bancos:view": "Entidades Financieras",
  "config_sindicatos:view": "Sindicatos",
  "config_holidays:view": "Feriados",
  "config_profile:view": "Mi Perfil",
  "config_activity_logs:view": "Novedades",
  "config_orders:view": "Pedidos",

  // Configuración → Plantillas
  "config_membretes:view": "Plantillas | Empresa/s | Membrete/s y firma",
  "config_contratos_frame:view": "Plantillas | Contratos",
  "config_pdf_templates:view": "Plantillas | Pedidos y Vacaciones",
  "config_releases:view": "Plantillas | Releasess (y Configuración → Releases)",

  "admin_sedes:view": "Sedes",

  // Configuración → Usuarios
  "admin_users:view": "Usuarios | Usuarios",
  "admin_areas:view": "Usuarios | Áreas",
  "config_shifts:view": "Usuarios | Turnos",
  "admin_roles:view": "Usuarios | Roles",
  "admin_roles_empresa:view": "Usuarios | Roles Empresa",

  "config_vacations:view": "Vacaciones",
  "admin_users_import:view": "Import WP",

  // App Mobile: una etiqueta por tarjeta de la pantalla de inicio de la app
  ...Object.fromEntries(MOBILE_ITEMS.map((i) => [i.permiso, i.label])),
};

const SUPERADMIN_ONLY_PERMISSIONS: Record<string, PermissionModule> = {
  tenants: {
    label: "Tenants",
    icon: faBuilding,
    description: "Ver y gestionar tenants (organizaciones) - Solo SuperAdmin. Con 'Ver' tienes acceso completo por defecto.",
    permissions: ["tenants:view"],
  },
  system: {
    label: "Sistema",
    icon: faShieldHalved,
    description: "Acceso total al sistema - Solo SuperAdmin",
    permissions: ["*"],
  },
};

/**
 * Una de las dos secciones de permisos, con su interruptor.
 *
 * Plegar la que no se usa es lo que hace legible la pantalla: la lista de la plataforma son unas
 * cincuenta casillas y la del móvil cuatro, así que tenerlas las dos abiertas dejaba lo importante
 * abajo de todo. El contador en la cabecera existe para que, plegada, se siga viendo que ahí hay algo.
 */
/**
 * «Todos» y «Limpiar» para un grupo de permisos.
 *
 * Va en la cabecera de cada sección y en la de cada grupo. Antes había UN par de botones arriba de
 * todo, que marcaba o borraba los cincuenta permisos de golpe: para armar un rol que viera sólo
 * Contratos y Pedidos no servía de nada, y para limpiar un grupo había que destildar de a uno. El
 * alcance de cada par es el grupo en el que está, que es como se piensa un rol.
 */
const BotonesSeleccion: React.FC<{ alcance: string; onTodos: () => void; onLimpiar: () => void }> = ({ alcance, onTodos, onLimpiar }) => (
  <div className="ml-auto flex shrink-0 items-center gap-1">
    <button type="button" onClick={onTodos} title={`Marcar todo en ${alcance}`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30">
      <FontAwesomeIcon icon={faCheckDouble} className="h-3 w-3" />
      Todos
    </button>
    <button type="button" onClick={onLimpiar} title={`Desmarcar todo en ${alcance}`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700">
      <FontAwesomeIcon icon={faBroom} className="h-3 w-3" />
      Limpiar
    </button>
  </div>
);

const SeccionPermisos: React.FC<{
  titulo: string;
  icono: any;
  prendida: boolean;
  cantidad: number;
  onToggle: () => void;
  onTodos: () => void;
  onLimpiar: () => void;
  children: React.ReactNode;
}> = ({ titulo, icono, prendida, cantidad, onToggle, onTodos, onLimpiar, children }) => (
  <div className={`rounded-lg border transition-colors ${prendida ? "border-gray-200 dark:border-gray-700" : "border-dashed border-gray-200 dark:border-gray-700"}`}>
    {/* La fila NO es un botón: adentro hay otros. Lo clickeable es el interruptor con su etiqueta. */}
    <div className="flex w-full items-center gap-3 px-4 py-3">
      <button type="button" onClick={onToggle} aria-pressed={prendida} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${prendida ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${prendida ? "translate-x-4" : "translate-x-0.5"}`} />
        </span>
        <FontAwesomeIcon icon={icono} className={prendida ? "text-blue-600 dark:text-blue-400" : "text-gray-400"} />
        <span className={`text-xs font-bold uppercase tracking-wider ${prendida ? "text-gray-700 dark:text-gray-200" : "text-gray-400"}`}>{titulo}</span>
        <span className="truncate text-xs text-gray-500 dark:text-gray-400">{cantidad > 0 ? `${cantidad} permiso${cantidad > 1 ? "s" : ""}` : prendida ? "sin permisos todavía" : "apagado"}</span>
      </button>
      {/* Apagada no hay nada que marcar ni que limpiar: los botones sobrarían. */}
      {prendida && <BotonesSeleccion alcance={titulo} onTodos={onTodos} onLimpiar={onLimpiar} />}
    </div>
    {prendida && <div className="px-4 pb-4">{children}</div>}
  </div>
);

interface RoleFormData {
  name: string;
  description: string;
  permissions: string[];
  isDefault: boolean;
}

export const RolesPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission, user } = useAuthStore();

  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  // Búsqueda + filtro
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterStatus] = useState<"all" | "default" | "custom">("all");

  // Modal de acción (crear/editar)
  const [showModal, setShowModal] = useState(false);
  /*
    Las dos secciones de permisos, como interruptores.

    No son un dato del rol: se derivan de qué permisos tiene y sólo existen mientras el modal está
    abierto. Sirven para que la pantalla no muestre las cincuenta casillas de la plataforma a quien
    está armando un rol de campo. Apagar una sección borra sus permisos; las dos apagadas no se
    permite, porque un rol sin nada no deja entrar a ningún lado.
  */
  const [seccionPlataforma, setSeccionPlataforma] = useState(false);
  const [seccionMobile, setSeccionMobile] = useState(true);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [formData, setFormData] = useState<RoleFormData>({
    name: "",
    description: "",
    permissions: [],
    isDefault: false,
  });

  // Modal informativo (ⓘ)
  const [openInfo, setOpenInfo] = useState(false);
  const [showPermissionsInfo, setShowPermissionsInfo] = useState(false);
  const [showDefaultInfo, setShowDefaultInfo] = useState(false);

  const helpEntry = getHelp(HELP_KEY);

  // Modal de solo lectura (ver detalle)
  const [viewOpen, setViewOpen] = useState(false);
  const [viewRole, setViewRole] = useState<Role | null>(null);

  // View Mode Logic
  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      const isNowLarge = window.innerWidth >= 1024;
      setIsLarge(isNowLarge);
      if (!isNowLarge) {
        setViewMode("cards");
      }
    };

    if (window.innerWidth >= 1024) {
      const saved = localStorage.getItem("rolesViewMode");
      if (saved === "table" || saved === "cards") {
        setViewMode(saved as "table" | "cards");
      }
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (isLarge) {
      localStorage.setItem("rolesViewMode", viewMode);
    }
  }, [viewMode, isLarge]);

  const canManage = hasPermission("admin_roles:view") || user?.primaryRole?.toLowerCase() === "admin" || user?.primaryRole?.toLowerCase() === "superadmin";
  const isSuperAdmin = user?.primaryRole === "superadmin";

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const response = await rolesAPI.list({});
      setRoles(response.roles);
    } catch (error) {
      console.error("Error fetching roles:", error);
      sweetAlert.error("Error", "No se pudieron cargar los roles");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Expande permisos con comodines (*) en permisos específicos.
   * Por ejemplo: "users:*" se expande a ["users:view", "users:create", "users:update", "users:delete"]
   */
  const expandWildcardPermissions = (permissions: string[]): string[] => {
    const allModules = { ...AVAILABLE_PERMISSIONS, ...SUPERADMIN_ONLY_PERMISSIONS };
    const expanded: string[] = [];

    permissions.forEach((perm) => {
      if (!perm) return;

      if (perm === "*") {
        // Permiso superadmin - agregar todos los permisos disponibles
        Object.values(allModules).forEach((mod) => {
          expanded.push(...mod.permissions);
        });
      } else if (perm.endsWith(":*")) {
        // Comodín de módulo específico (ej: "users:*")
        const [modulePrefix] = perm.split(":");

        // 1. Intentar encontrar por clave de módulo exacta
        let moduleData = allModules[modulePrefix];

        // 2. Si no coincide, buscar cualquier módulo que tenga permisos con ese prefijo
        if (!moduleData) {
          const foundModule = Object.values(allModules).find((mod) => mod.permissions.some((p) => p.startsWith(`${modulePrefix}:`)));
          if (foundModule) {
            moduleData = foundModule;
          }
        }

        if (moduleData) {
          expanded.push(...moduleData.permissions);
        } else {
          // Si no encontramos el módulo, lo dejamos como wildcard
          expanded.push(perm);
        }
      } else {
        // Permiso específico - agregar tal cual
        expanded.push(perm);
      }
    });

    // Eliminar duplicados y ordenar
    return [...new Set(expanded)].sort();
  };

  const openCreate = () => {
    setEditingRole(null);
    setFormData({
      name: "",
      description: "",
      permissions: [],
      isDefault: false,
    });
    /*
      Un rol nuevo arranca siendo del móvil.

      Es el caso de lejos más común —la app es por donde entra casi todo el mundo— y dejar las dos
      secciones apagadas obligaba a un clic que nadie entiende para qué es. La plataforma se prende
      aparte, y recién entonces aparecen sus grupos: así la pantalla no arranca con cincuenta casillas
      para quien sólo quiere dar de alta gente de campo.
    */
    setSeccionMobile(true);
    setSeccionPlataforma(false);
    setShowModal(true);
  };

  const openEdit = (role: Role) => {
    setEditingRole(role);

    // Expandir permisos con comodines
    const expandedPermissions = expandWildcardPermissions(role.permissions);

    setFormData({
      name: role.name,
      description: role.description || "",
      permissions: expandedPermissions,
      isDefault: role.isDefault,
    });
    // Al editar, cada sección arranca prendida si el rol ya tiene algo de ella. Un rol sin nada
    // (los había: "User" nacía vacío) se abre como uno nuevo, con el móvil prendido.
    const tienePlataforma = expandedPermissions.some((p) => !esPermisoMobile(p));
    const tieneMobile = expandedPermissions.some((p) => esPermisoMobile(p));
    setSeccionPlataforma(tienePlataforma);
    setSeccionMobile(tieneMobile || !tienePlataforma);
    setShowModal(true);
  };

  const openView = (role: Role) => {
    setViewRole(role);
    setViewOpen(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingRole(null);
  };

  const closeView = () => {
    setViewOpen(false);
    setViewRole(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    /*
      Un rol sin ningún permiso no deja entrar a ningún lado: ni a la app ni a la plataforma.

      Se podían crear —y existían: el rol "User" nacía vacío— y después nadie entendía por qué la
      persona que lo tenía veía una pantalla en blanco. El rol es el permiso; sin permisos no es nada.
    */
    if (formData.permissions.length === 0) {
      sweetAlert.error("Falta elegir permisos", "Un rol sin permisos no deja entrar a ningún lado. Marcá al menos uno, de Plataforma o de App Mobile.");
      return;
    }

    // Si se marca como predeterminado, verificar si ya existe otro rol predeterminado
    if (formData.isDefault) {
      const currentDefaultRole = roles.find((r) => r.isDefault && r._id !== editingRole?._id);
      if (currentDefaultRole) {
        const result = await sweetAlert.confirm("Cambiar rol predeterminado", `El rol "${currentDefaultRole.name}" es actualmente el predeterminado. Si continúas, "${formData.name}" será el nuevo rol predeterminado y "${currentDefaultRole.name}" dejará de serlo. ¿Deseas continuar?`);
        if (!result.isConfirmed) {
          return;
        }
      }
    }

    try {
      if (editingRole) {
        await rolesAPI.update(editingRole._id, formData);
        sweetAlert.success("Rol actualizado", "Los cambios se han guardado correctamente");
      } else {
        await rolesAPI.create(formData);
        sweetAlert.success("Rol creado", "El rol se ha creado correctamente");
      }
      closeModal();
      fetchRoles();
    } catch (error: any) {
      const message = error.response?.data?.error || "Error al guardar el rol";
      sweetAlert.error("Error", message);
    }
  };

  const handleDelete = async (role: Role) => {
    const result = await sweetAlert.confirm("¿Eliminar rol?", `¿Estás seguro de que quieres eliminar el rol "${role.name}"?`);
    if (result.isConfirmed) {
      try {
        await rolesAPI.remove(role._id);
        sweetAlert.success("Rol eliminado", "El rol ha sido eliminado correctamente");
        fetchRoles();
      } catch (error: any) {
        // Detectar si el error es por usuarios asignados
        if (error.response?.status === 409 && error.response?.data?.code === "ROLE_ASSIGNED_TO_USERS") {
          const usersCount = error.response.data.usersCount;
          const confirmForce = await sweetAlert.confirm("Rol asignado a usuarios", `Este rol está asignado a ${usersCount} usuario(s). Si lo eliminas, estos usuarios perderán este rol. ¿Deseas forzar la eliminación?`, "warning", "Sí, eliminar y desasignar");

          if (confirmForce.isConfirmed) {
            try {
              await rolesAPI.remove(role._id, true);
              sweetAlert.success("Rol eliminado", "El rol ha sido eliminado y desasignado de los usuarios.");
              fetchRoles();
            } catch (forceError: any) {
              const message = forceError.response?.data?.error || "Error al eliminar el rol";
              sweetAlert.error("Error", message);
            }
          }
        } else {
          const message = error.response?.data?.error || "Error al eliminar el rol";
          sweetAlert.error("Error", message);
        }
      }
    }
  };

  /*
    Marcar y limpiar SIEMPRE con un alcance: la sección o el grupo desde donde se llamó.

    Antes era un único par de botones arriba de todo que operaba sobre los cincuenta permisos juntos.
    Para armar un rol que viera sólo Contratos y Pedidos no servía —había que marcar todo y destildar
    cuarenta y ocho—, y tampoco servía para vaciar un grupo. Ahora cada sección y cada grupo tienen el
    suyo, y nada de lo que está fuera de ese alcance se toca.
  */
  const marcarPermisos = (permisos: string[]) => setFormData((prev) => ({ ...prev, permissions: Array.from(new Set([...prev.permissions, ...permisos])) }));

  const limpiarPermisos = (permisos: string[]) => setFormData((prev) => ({ ...prev, permissions: prev.permissions.filter((p) => !permisos.includes(p)) }));

  const togglePermission = (permission: string) => {
    setFormData((prev) => {
      const yaEstaba = prev.permissions.includes(permission);
      return {
        ...prev,
        // La exclusión mutua entre colaborador y coordinador se fue con esos dos permisos: las cuatro
        // tarjetas del móvil se combinan libremente, que era justamente lo que faltaba poder hacer.
        permissions: yaEstaba ? prev.permissions.filter((p) => p !== permission) : [...prev.permissions, permission],
      };
    });
  };

  /**
   * Prende o apaga una sección entera. Apagarla se lleva puestos sus permisos —si no, el rol
   * guardaría cosas que la pantalla no muestra— así que primero se avisa.
   */
  const toggleSeccion = async (seccion: "plataforma" | "mobile") => {
    const esPlataforma = seccion === "plataforma";
    const estaPrendida = esPlataforma ? seccionPlataforma : seccionMobile;
    const setSeccion = esPlataforma ? setSeccionPlataforma : setSeccionMobile;
    const nombre = esPlataforma ? "Plataforma" : "App Mobile";

    if (!estaPrendida) {
      setSeccion(true);
      return;
    }

    // Apagar la única sección prendida dejaría al rol sin nada, y un rol sin permisos no sirve para nada.
    if (esPlataforma ? !seccionMobile : !seccionPlataforma) {
      sweetAlert.error("Tiene que quedar una", "Un rol sin permisos no deja entrar a ningún lado. Prendé la otra sección antes de apagar esta.");
      return;
    }

    const tildados = formData.permissions.filter((p) => (esPlataforma ? !esPermisoMobile(p) : esPermisoMobile(p)));
    if (tildados.length > 0) {
      const result = await sweetAlert.confirm(`Apagar ${nombre}`, `Se van a destildar los ${tildados.length} permiso/s de ${nombre} que tiene este rol. ¿Continuar?`);
      if (!result.isConfirmed) return;
      setFormData((prev) => ({ ...prev, permissions: prev.permissions.filter((p) => (esPlataforma ? esPermisoMobile(p) : !esPermisoMobile(p))) }));
    }
    setSeccion(false);
  };

  const filteredRoles = roles.filter((r) => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch = q.length === 0 || fuzzyMatch(r.name, q) || fuzzyMatch(r.description || "", q);
    const matchesStatus = filterStatus === "all" ? true : filterStatus === "default" ? r.isDefault : !r.isDefault;

    // Filtro de fechas (createdAt)
    let matchesDate = true;
    if (startDate || endDate) {
      const createdAt = r.createdAt ? new Date(r.createdAt).getTime() : 0;
      if (startDate) {
        const start = new Date(startDate).getTime();
        matchesDate = matchesDate && createdAt >= start;
      }
      if (endDate) {
        const end = new Date(endDate).setHours(23, 59, 59, 999);
        matchesDate = matchesDate && createdAt <= end;
      }
    }

    return matchesSearch && matchesStatus && matchesDate;
  });

  return (
    <PageLayout
      title="Roles"
      itemCount={filteredRoles.length}
      subtitle="Gestiona roles y permisos del sistema"
      faIcon={{ icon: faUserShield }}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      headerActions={
        <div className="flex items-center gap-3">
          {canManage && (
            <button onClick={openCreate} title="Nuevo rol" aria-label="Nuevo rol" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              <FontAwesomeIcon icon={faPlus} />
            </button>
          )}
          <button onClick={() => navigate("/users")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserGear} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Usuarios</span>
          </button>
          <button onClick={() => navigate("/positions")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserTie} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Cargos</span>
          </button>
          <button onClick={() => navigate("/levels")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserGraduate} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Niveles</span>
          </button>
          <button onClick={() => navigate("/areas")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Áreas</span>
          </button>
          <button onClick={() => navigate("/shifts")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faClock} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Turnos</span>
          </button>
        </div>
      }
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
          <div className="flex-1 w-full">
            <SearchAndFilters
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar roles..."
              dateFilter={{
                startDate,
                endDate,
                onStartDateChange: setStartDate,
                onEndDateChange: setEndDate,
              }}
            />
          </div>
          {isLarge && (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setViewMode("cards")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "cards" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tarjetas">
                <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode("table")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "table" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tabla">
                <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      }
      // Modal VER (solo lectura)
      viewModal={{
        isOpen: viewOpen,
        onClose: closeView,
        title: viewRole ? viewRole.name : "Rol",
        subtitle: viewRole?.description,
        size: "md",
        actions: [
          ...(canManage && viewRole?.name.toLowerCase() !== "superadmin"
            ? [
                {
                  label: "Editar rol",
                  onClick: () => {
                    if (viewRole) openEdit(viewRole);
                    closeView();
                  },
                  variant: "secondary",
                } as const,
              ]
            : []),
          {
            label: "Cancelar",
            onClick: closeView,
            variant: "ghost",
          },
        ],
        content: viewRole ? (
          <div className="space-y-4">
            {/* Badge siempre presente */}
            <div className="flex items-center gap-2">
              {viewRole.tenant?.name && <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-200 dark:border-blue-800">{viewRole.tenant.name}</span>}
              {viewRole.isSystem && <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-orange-500/10 text-orange-500 border border-orange-500/50">Sistema</span>}
              <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${viewRole.isDefault ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" : "bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300"}`}>{viewRole.isDefault ? "Por defecto" : "Personalizado"}</span>
              {viewRole.permissions.some((p) => p.startsWith("tenants:")) && <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800">SuperAdmin</span>}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Descripción</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">{viewRole.description || "—"}</p>
            </div>

            <div>
              {viewRole.name.toLowerCase() === "superadmin" ? (
                <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">Acceso total al sistema</p>
              ) : viewRole.permissions.length === 0 ? (
                <p className="text-sm text-gray-500">Sin permisos</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries({ ...AVAILABLE_PERMISSIONS, ...SUPERADMIN_ONLY_PERMISSIONS }).map(([moduleKey, moduleData]) => {
                    const modulePermissions = moduleData.permissions.filter((p) => viewRole.permissions.includes(p));
                    if (modulePermissions.length === 0) return null;

                    const isSuperAdminModule = !!SUPERADMIN_ONLY_PERMISSIONS[moduleKey];
                    const isAdminModule = false;

                    return (
                      <div key={moduleKey} className={`border rounded p-3 ${isSuperAdminModule ? "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20" : isAdminModule ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20" : "border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50"}`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${isSuperAdminModule ? "bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/50 dark:to-blue-800/50" : isAdminModule ? "bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900/50 dark:to-green-800/50" : "bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/50 dark:to-primary-800/50"}`}>
                            <FontAwesomeIcon icon={moduleData.icon} className={`h-4 w-4 ${isSuperAdminModule ? "text-blue-600 dark:text-blue-400" : isAdminModule ? "text-green-600 dark:text-green-400" : "text-primary-600 dark:text-primary-400"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h5 className="font-semibold text-gray-900 dark:text-white text-sm">{moduleData.label}</h5>
                              {isSuperAdminModule && <span className="text-xs px-2 py-0.5 rounded bg-blue-200 dark:bg-blue-900 text-blue-800 dark:text-blue-200 font-medium">SuperAdmin</span>}
                              {isAdminModule && <span className="text-xs px-2 py-0.5 rounded bg-green-200 dark:bg-green-900 text-green-800 dark:text-green-200 font-medium">Admin/SuperAdmin</span>}
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{moduleData.description}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null,
      }}
      // Modal CREAR/EDITAR
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: editingRole ? "Editar Rol" : "Nuevo Rol",
        subtitle: "Define nombre, descripción y permisos",
        size: "lg",
        actions: [
          {
            label: editingRole ? "Actualizar" : "Crear",
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>("#role-form");
              form?.requestSubmit();
            },
            variant: "primary",
          },
          {
            label: "Cancelar",
            onClick: closeModal,
            variant: "ghost",
          },
        ],
        content: (
          <form id="role-form" onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} className="input-field" placeholder="Nombre del rol" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
                <textarea value={formData.description} onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))} rows={3} className="input-field resize-none" placeholder="Descripción del rol" />
              </div>

              <div>
                {/*
                  Acá arriba había un «Seleccionar todos» y un «Limpiar» globales. Marcaban o borraban
                  los cincuenta y pico de permisos de un saque, que casi nunca es lo que uno quiere: un
                  rol se piensa por bloques —«que vea Contratos y Pedidos y nada más»—. Ahora cada
                  sección y cada grupo tienen su propio par, con el alcance a la vista.
                */}
                <div className="flex items-center mb-4 gap-2">
                  <label className="block text-lg font-semibold text-gray-700 dark:text-gray-300">Permisos</label>
                  <button type="button" onClick={() => setShowPermissionsInfo(true)} className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors" title="Información sobre permisos">
                    <FontAwesomeIcon icon={faInfoCircle} className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-3">
                  {/*
                    PLATAFORMA Y APP MOBILE, CADA UNA CON SU INTERRUPTOR.

                    Las dos listas estaban siempre desplegadas, una arriba de la otra, y la de la
                    plataforma son cincuenta casillas: quien arma un rol para gente de campo tenía que
                    bajar hasta el final para encontrar las cuatro que le importan. Ahora la sección
                    que no se usa queda plegada, y la que se usa se ve entera.
                  */}
                  <SeccionPermisos
                    titulo="Plataforma"
                    icono={faUserShield}
                    prendida={seccionPlataforma}
                    cantidad={formData.permissions.filter((p) => !esPermisoMobile(p)).length}
                    onToggle={() => toggleSeccion("plataforma")}
                    onTodos={() => marcarPermisos(PLATFORM_PERMISSIONS)}
                    onLimpiar={() => limpiarPermisos(PLATFORM_PERMISSIONS)}
                  >
                    <div className="space-y-3">
                      {Object.entries(AVAILABLE_PERMISSIONS)
                        .filter(([module]) => module !== "mobile")
                        .map(([module, moduleData]) => {
                          return (
                            <div key={module} className="border border-gray-200 dark:border-gray-700 rounded p-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                              <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/30 dark:to-primary-800/30 flex items-center justify-center flex-shrink-0">
                                  <FontAwesomeIcon icon={moduleData.icon} className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold text-gray-900 dark:text-white">{moduleData.label}</h4>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{moduleData.description}</p>
                                </div>
                                <BotonesSeleccion alcance={moduleData.label} onTodos={() => marcarPermisos(moduleData.permissions)} onLimpiar={() => limpiarPermisos(moduleData.permissions)} />
                              </div>
                              <div className="flex flex-wrap gap-3 pl-[36px] mt-3">
                                {moduleData.permissions.map((permission) => {
                                  const permissionLabel = MODULE_LABELS[permission] || permission;

                                  return (
                                    <label key={permission} className="flex items-center gap-2 group cursor-pointer">
                                      <input type="checkbox" checked={formData.permissions.includes(permission)} onChange={() => togglePermission(permission)} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer" />
                                      <span className="text-sm transition-colors text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">{permissionLabel}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}

                      {/* Permisos de SuperAdmin */}
                      {isSuperAdmin &&
                        editingRole?.name.toLowerCase() !== "superadmin" &&
                        Object.entries(SUPERADMIN_ONLY_PERMISSIONS).map(([module, moduleData]) => {
                          return (
                            <div key={module} className="border-2 border-blue-400 dark:border-blue-600 rounded p-4 bg-blue-50 dark:bg-blue-950/30">
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 flex items-center justify-center flex-shrink-0">
                                  <FontAwesomeIcon icon={moduleData.icon} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-semibold text-gray-900 dark:text-white">{moduleData.label}</h4>
                                    <span className="text-xs px-2 py-0.5 rounded bg-blue-200 dark:bg-blue-900 text-blue-800 dark:text-blue-200 font-medium">SuperAdmin</span>
                                  </div>
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{moduleData.description}</p>
                                </div>
                                <BotonesSeleccion alcance={moduleData.label} onTodos={() => marcarPermisos(moduleData.permissions)} onLimpiar={() => limpiarPermisos(moduleData.permissions)} />
                              </div>
                              <div className="flex flex-wrap gap-3 pl-[52px] mt-3">
                                {moduleData.permissions.map((permission) => {
                                  const permissionLabel = MODULE_LABELS[permission] || (permission === "*" ? "Acceso Total" : permission);

                                  return (
                                    <label key={permission} className="flex items-center gap-2 group cursor-pointer">
                                      <input type="checkbox" checked={formData.permissions.includes(permission)} onChange={() => togglePermission(permission)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer" />
                                      <span className="text-sm transition-colors text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">{permissionLabel}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </SeccionPermisos>

                  <SeccionPermisos
                    titulo="App Mobile"
                    icono={faMobileAlt}
                    prendida={seccionMobile}
                    cantidad={formData.permissions.filter((p) => esPermisoMobile(p)).length}
                    onToggle={() => toggleSeccion("mobile")}
                    onTodos={() => marcarPermisos(MOBILE_PERMISSIONS)}
                    onLimpiar={() => limpiarPermisos(MOBILE_PERMISSIONS)}
                  >
                    <div className="space-y-3">
                      {Object.entries(AVAILABLE_PERMISSIONS)
                        .filter(([module]) => module === "mobile")
                        .map(([module, moduleData]) => {
                          return (
                            <div key={module} className="border border-gray-200 dark:border-gray-700 rounded p-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                              <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/30 dark:to-indigo-800/30 flex items-center justify-center flex-shrink-0">
                                  <FontAwesomeIcon icon={moduleData.icon} className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold text-gray-900 dark:text-white">{moduleData.label}</h4>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{moduleData.description}</p>
                                </div>
                                <BotonesSeleccion alcance={moduleData.label} onTodos={() => marcarPermisos(moduleData.permissions)} onLimpiar={() => limpiarPermisos(moduleData.permissions)} />
                              </div>
                              <div className="flex flex-wrap gap-3 pl-[36px] mt-3">
                                {moduleData.permissions.map((permission) => {
                                  const permissionLabel = MODULE_LABELS[permission] || permission;

                                  return (
                                    <label key={permission} className="flex items-center gap-2 group cursor-pointer">
                                      <input type="checkbox" checked={formData.permissions.includes(permission)} onChange={() => togglePermission(permission)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer" />
                                      <span className="text-sm transition-colors text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">{permissionLabel}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </SeccionPermisos>
                </div>
              </div>

              {/*
                «Rol por defecto» va al FINAL y como switch, el mismo bloque que el Estado de un usuario
                o un proyecto (`BloqueEstado`).

                Arriba, como checkbox, quedaba entre la descripción y los permisos: en el medio del
                camino de quien está armando el rol, y con el aspecto de un campo más del formulario.
                Es una propiedad del rol entero —y además excluyente entre roles, que es lo que aclara
                el texto de abajo—, así que corresponde el mismo lugar y el mismo gesto que el resto de
                los estados de cierre de la plataforma.
              */}
              <BloqueEstado
                titulo="Rol por defecto"
                activo={formData.isDefault}
                onChange={(activo) => setFormData((prev) => ({ ...prev, isDefault: activo }))}
                etiquetaActivo="Por defecto"
                etiquetaInactivo="No es el rol por defecto"
                info={
                  <button type="button" onClick={() => setShowDefaultInfo(true)} title="Qué implica el rol por defecto" className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors">
                    <FontAwesomeIcon icon={faInfoCircle} className="h-4 w-4" />
                  </button>
                }
              />
            </div>
          </form>
        ),
      }}
    >
      {/* Loading state */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando roles..." />
        </div>
      ) : (
        <>
          {/* Grid */}
          {viewMode === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
              {filteredRoles.map((role) => {
                const isSuperAdminRole = role.name.toLowerCase() === "superadmin";

                return (
                  <Card
                    key={role._id}
                    onClick={() => openView(role)}
                    className="hover:scale-105 hover:shadow-lg transition-all duration-200"
                    header={{
                      title: role.name,
                      subtitle: role.description,
                      icon: faUserShield,
                      /*
                        Sin el nombre del tenant.

                        Estaba repetido en las nueve tarjetas y decía siempre lo mismo, porque un rol
                        sólo puede ser del tenant en el que estás parado: el que manda es el selector
                        del encabezado. Lo único que hacía era ocupar el primer renglón de cada tarjeta
                        y empujar hacia abajo los dos badges que sí distinguen a un rol de otro.
                      */
                      badges: [
                        ...(role.isSystem
                          ? [
                              {
                                text: "Sistema",
                                variant: "default" as const,
                                className: "bg-orange-500/10 text-orange-500 border border-orange-500/50",
                              },
                            ]
                          : []),
                        ...(role.isDefault
                          ? [
                              {
                                text: "Por defecto",
                                variant: "success" as const,
                              },
                            ]
                          : []),
                        ...(role.permissions.some((p) => p.startsWith("tenants:"))
                          ? [
                              {
                                text: "SuperAdmin",
                                variant: "warning" as const,
                              },
                            ]
                          : []),
                      ],
                    }}
                    footer={{
                      leftContent: isSuperAdminRole ? <span className="text-xs text-gray-500 dark:text-gray-500">Acceso total al sistema</span> : <span className="text-xs text-gray-500 dark:text-gray-500">{role.permissions.length} permisos</span>,
                      actions: isSuperAdminRole
                        ? [
                            {
                              icon: faLock,
                              onClick: (e) => {
                                e.stopPropagation();
                              },
                              title: "Rol protegido",
                              variant: "default",
                              disabled: true,
                            },
                          ]
                        : [
                            {
                              icon: faEdit,
                              onClick: (e) => {
                                e.stopPropagation();
                                openEdit(role);
                              },
                              title: "Editar",
                              variant: "default",
                            },
                            ...(hasPermission("admin_roles:view") && !role.isSystem
                              ? [
                                  {
                                    icon: faTrash,
                                    onClick: (e: React.MouseEvent) => {
                                      e.stopPropagation();
                                      handleDelete(role);
                                    },
                                    title: "Eliminar",
                                    variant: "default" as const,
                                  },
                                ]
                              : []),
                            ...(role.isSystem
                              ? [
                                  {
                                    icon: faLock,
                                    onClick: (e: React.MouseEvent) => {
                                      e.stopPropagation();
                                    },
                                    title: "Rol de sistema protegido",
                                    variant: "default" as const,
                                    disabled: true,
                                  },
                                ]
                              : []),
                          ],
                    }}
                  ></Card>
                );
              })}
              {canManage && (
                <Card
                  variant="create"
                  onClick={openCreate}
                  header={{
                    title: "Nuevo Rol",
                    subtitle: "Crear un nuevo rol con permisos personalizados",
                    icon: faUserShield,
                  }}
                />
              )}
            </div>
          ) : (
            <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm mx-0.5 lg:mx-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rol</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Permisos</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tenant</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {filteredRoles.map((role) => {
                      const isSuperAdminRole = role.name.toLowerCase() === "superadmin";
                      // const isActionDisabled = isSuperAdminRole && !isSuperAdmin; // Removed unsed var
                      return (
                        <tr key={role._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group cursor-pointer" onClick={() => openView(role)}>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                {role.name}
                                {role.permissions.some((p) => p.startsWith("tenants:")) && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">SA</span>}
                                {role.isSystem && <span className="text-[9px] font-bold bg-orange-500/10 text-orange-500 border border-orange-500/50 px-1.5 py-0.5 rounded uppercase tracking-wider">Sistema</span>}
                                {role.isDefault && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">Default</span>}
                              </span>
                              {role.description && <span className="text-xs text-gray-500 dark:text-gray-500 line-clamp-1">{role.description}</span>}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {isSuperAdminRole ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                                <FontAwesomeIcon icon={faShieldHalved} className="h-3 w-3" />
                                Total
                              </span>
                            ) : (
                              <span className="text-sm text-gray-600 dark:text-gray-400">{role.permissions.length} permisos</span>
                            )}
                          </td>
                          <td className="px-6 py-4">{role.tenant && role.tenant.name ? <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-200 dark:border-blue-800">{role.tenant.name}</span> : <span className="text-xs text-gray-400">—</span>}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                              {!isSuperAdminRole && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEdit(role);
                                    }}
                                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                                    title="Editar"
                                  >
                                    <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                                  </button>
                                  {hasPermission("admin_roles:view") && !role.isSystem && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(role);
                                      }}
                                      className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                                      title="Eliminar"
                                    >
                                      <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                                    </button>
                                  )}
                                  {role.isSystem && (
                                    <div className="p-1.5 text-gray-400" title="Rol de sistema protegido">
                                      <FontAwesomeIcon icon={faLock} className="h-4 w-4" />
                                    </div>
                                  )}
                                </>
                              )}
                              {isSuperAdminRole && <FontAwesomeIcon icon={faLock} className="text-gray-400 h-4 w-4 mx-2" title="Rol protegido" />}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && filteredRoles.length === 0 && (
            <EmptyState
              icon={faShieldHalved}
              title={startDate || endDate ? "No hay roles en este rango de fechas" : "No hay roles"}
              description={startDate || endDate ? `No se encontraron roles ${startDate && endDate ? `desde ${new Date(startDate).toLocaleDateString()} hasta ${new Date(endDate).toLocaleDateString()}` : startDate ? `desde ${new Date(startDate).toLocaleDateString()}` : `hasta ${new Date(endDate).toLocaleDateString()}`}` : "Crea tu primer rol para comenzar a gestionar permisos."}
              action={
                hasPermission("admin_roles:view")
                  ? {
                      label: "Nuevo Rol",
                      onClick: openCreate,
                      icon: faPlus,
                    }
                  : undefined
              }
            />
          )}
        </>
      )}

      <InfoModal
        isOpen={showDefaultInfo}
        onClose={() => setShowDefaultInfo(false)}
        title="Rol por defecto"
        size="sm"
        zIndex={60}
        actions={[{ label: "Entendido", onClick: () => setShowDefaultInfo(false), variant: "primary" }]}
      >
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p>
            El rol por defecto <strong>se asigna solo a cada usuario nuevo</strong> del tenant, sin que nadie lo elija en el alta.
          </p>
          <p>
            <strong>Solo puede haber uno por tenant.</strong> Si prendés este switch en un rol y ya había otro marcado, el otro deja de serlo — la pantalla avisa antes de guardar y dice
            cuál era.
          </p>
          <p className="text-xs text-gray-500">Cambiarlo no toca a los usuarios que ya existen: solo cambia con qué rol nacen los que se den de alta de acá en adelante.</p>
        </div>
      </InfoModal>

      {/* Modal de información sobre permisos */}
      <InfoModal
        isOpen={showPermissionsInfo}
        onClose={() => setShowPermissionsInfo(false)}
        title="¿Cómo funcionan los permisos?"
        size="lg"
        zIndex={60}
        actions={[
          {
            label: "Entendido",
            onClick: () => setShowPermissionsInfo(false),
            variant: "primary",
          },
        ]}
      >
        <div className="space-y-5 text-sm">
          {/* Sistema simplificado - destacado primero */}
          <div className="bg-gradient-to-br from-emerald-50 to-cyan-50 dark:from-emerald-950/40 dark:to-cyan-950/40 border-2 border-emerald-300 dark:border-emerald-700 rounded-xl p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded bg-blue-500 dark:bg-blue-700 flex items-center justify-center flex-shrink-0">
                <FontAwesomeIcon icon={faEye} className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-emerald-900 dark:text-emerald-100 text-base mb-1">Sistema simplificado de permisos</h4>
                <p className="text-emerald-800 dark:text-emerald-200 text-sm">Los permisos ahora son simples y basados en visibilidad</p>
              </div>
            </div>
            <div className="bg-white/60 dark:bg-black/20 rounded p-3 space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                <p className="text-emerald-900 dark:text-emerald-100 flex-1">
                  Con el permiso <strong>"Ver"</strong> de un módulo, tienes <strong>acceso completo por defecto</strong> (ver, crear, editar, eliminar)
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                <p className="text-emerald-900 dark:text-emerald-100 flex-1">
                  Si un módulo no aparece en el navbar, es porque no tienes permiso de <strong>"Ver"</strong> para ese módulo
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                <p className="text-emerald-900 dark:text-emerald-100 flex-1">
                  Los roles <strong>superadmin y admin</strong> siempre tienen acceso total al sistema
                </p>
              </div>
            </div>
          </div>

          {/* Ejemplo práctico */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 rounded p-4">
            <div className="flex items-center gap-2 mb-3">
              <FontAwesomeIcon icon={faInfoCircle} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h4 className="font-bold text-blue-900 dark:text-blue-100 text-base">Ejemplo práctico</h4>
            </div>
            <div className="space-y-3 text-blue-900 dark:text-blue-100">
              <div className="bg-white/60 dark:bg-black/20 rounded p-3">
                <p className="text-sm mb-2 font-semibold">Rol "User" (Usuario estándar)</p>
                <p className="text-xs text-blue-800 dark:text-blue-200 mb-2">
                  <strong>Permisos asignados:</strong> Clientes (Ver), Pedidos (Ver)
                </p>
                <p className="text-xs text-blue-800 dark:text-blue-200">→ Verá en el navbar: Clientes, Pedidos</p>
                <p className="text-xs text-blue-800 dark:text-blue-200">→ Al tener permiso de "Ver", podrá gestionar (Crear, Editar, Eliminar) dentro de cada módulo</p>
              </div>

              <div className="bg-white/60 dark:bg-black/20 rounded p-3">
                <p className="text-sm mb-2 font-semibold">Rol "Admin" (Administrador)</p>
                <p className="text-xs text-blue-800 dark:text-blue-200 mb-2">
                  <strong>Permisos asignados:</strong> Admin General, Admin Usuarios
                </p>
                <p className="text-xs text-blue-800 dark:text-blue-200">→ Tiene acceso completo a la gestión de RRHH, Clientes y Usuarios</p>
                <p className="text-xs text-blue-800 dark:text-blue-200">→ Control completo sobre la estructura organizacional y roles</p>
              </div>

              <div className="bg-white/60 dark:bg-black/20 rounded p-3">
                <p className="text-sm mb-2 font-semibold">Rol personalizado "Solo Pedidos"</p>
                <p className="text-xs text-blue-800 dark:text-blue-200 mb-2">
                  <strong>Permisos asignados:</strong> Solo Pedidos (Ver)
                </p>
                <p className="text-xs text-blue-800 dark:text-blue-200">→ Este usuario solo verá Pedidos en el navbar</p>
                <p className="text-xs text-blue-800 dark:text-blue-200">→ Al tener acceso a "Ver", podrá gestionar pedidos completamente</p>
              </div>

              <div className="bg-blue-600/10 dark:bg-blue-400/10 border border-blue-200 dark:border-blue-800 rounded p-3">
                <p className="text-sm mb-2 font-semibold text-blue-800 dark:text-blue-300">Nota sobre el Sistema Simplificado</p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Para simplificar la administración, el permiso de <strong>"Ver"</strong> un módulo otorga automáticamente capacidad de <strong>Crear, Editar y Eliminar</strong> en el mismo. No hace falta asignar permisos granulares adicionales.
                </p>
              </div>
            </div>
          </div>

          {/* Módulos disponibles */}
          <div>
            <h4 className="font-bold text-gray-900 dark:text-white text-base mb-3 flex items-center gap-2">
              <FontAwesomeIcon icon={faSquareCheck} className="h-4 w-4 text-primary-600 dark:text-primary-400" />
              Módulos disponibles
            </h4>

            {/* Permisos generales */}
            <div className="mb-4">
              <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Permisos Generales</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {Object.entries(AVAILABLE_PERMISSIONS).map(([key, moduleData]) => (
                  <div key={key} className="flex items-start gap-2 p-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded hover:border-primary-300 dark:hover:border-primary-700 transition-colors">
                    <FontAwesomeIcon icon={moduleData.icon} className="h-4 w-4 text-primary-600 dark:text-primary-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-white text-xs">{moduleData.label}</div>
                      <div className="text-gray-600 dark:text-gray-400 text-xs mt-0.5">{moduleData.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Permisos de SuperAdmin */}
            <div>
              <h5 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2">Permisos de SuperAdmin</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {Object.entries(SUPERADMIN_ONLY_PERMISSIONS).map(([key, moduleData]) => (
                  <div key={key} className="flex items-start gap-2 p-2.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-700 rounded hover:border-blue-300 dark:hover:border-blue-600 transition-colors">
                    <FontAwesomeIcon icon={moduleData.icon} className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-white text-xs">{moduleData.label}</div>
                      <div className="text-gray-600 dark:text-gray-400 text-xs mt-0.5">{moduleData.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Rol por defecto */}
          <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded p-3">
            <h4 className="font-bold text-gray-900 dark:text-white text-sm mb-2">Rol por defecto</h4>
            <p className="text-gray-700 dark:text-gray-300 text-xs">El rol marcado como "por defecto" se asigna automáticamente a nuevos usuarios cuando se registran. Solo puede haber un rol por defecto por organización.</p>
          </div>
        </div>
      </InfoModal>
    </PageLayout>
  );
};
