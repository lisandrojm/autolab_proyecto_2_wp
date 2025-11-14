import React from "react";

export type HelpKey = "clients" | "dashboard" | "tasks" | "posts" | "analytics" | "users" | "roles" | "tenants" | "clientDetail" | "clientProjects" | "campaignDetail" | "postDetail" | "clientContextInfo" | "clientContextBrandKit" | "clientContextCampaigns" | "clientContextPosts" | "clientContextUsers" | "clientDashboard" | "calendar" | "assistant" | "platform_dashboard" | "orders" | "clientContextOrders";

export type HelpEntry = {
  title: string;
  size?: "sm" | "md" | "lg" | "xl";
  content: React.ReactNode;
};

// Recursos de ayuda organizados por idioma (estilo i18n)
const helpResources = {
  es: {
    help: {
      // Clients
      "clients.title": "Información de Clientes",
      "clients.description": "Gestión completa de clientes y su información",
      "clients.items": ["**Cliente**: Contiene datos de contacto, empresa e información adicional como redes sociales, brand kit y brief de proyecto", "**Estado**: Puede ser *Activo*, *Inactivo* u *Onboarding* para reflejar su ciclo de vida", "**Gestión**: Crear, editar, clonar y eliminar clientes desde la vista principal", "**Favoritos**: Marcar clientes importantes para acceso rápido"],

      // Dashboard
      "dashboard.title": "Información del Dashboard",
      "dashboard.description": "Panel principal con métricas y accesos rápidos",
      "dashboard.items": ["**Resumen**: Muestra métricas clave, accesos rápidos y estado general de campañas y clientes", "**Navegación**: Acceso directo a todas las secciones del sistema", "**Estado del sistema**: Monitoreo de salud del servidor y conexiones", "**Métricas**: Vista general de rendimiento y KPIs principales"],

      // Platform Dashboard (SUPERADMIN)
      "platform_dashboard.title": "Dashboard de Plataforma",
      "platform_dashboard.description": "Vista de superadmin con métricas globales y estado del sistema",
      "platform_dashboard.items": ["**Tenants**: Total, activos, suspendidos y nuevos (últimos 30 días)", "**Recursos**: Usuarios y clientes totales en toda la plataforma", "**Almacenamiento**: Porcentaje usado, MB utilizados y límite asignado", "**Alertas**: Incidentes por tenant con severidad y tipo", "**Planes**: Distribución por plan (Free, Basic, Pro, Enterprise)", "**Top consumidores**: Tenants con mayor uso de almacenamiento"],

      // Tenants
      "tenants.title": "Información de Tenants",
      "tenants.description": "Gestión de tenants en arquitectura multi-tenant",
      "tenants.items": ["**Tenant**: Entidad aislada que representa una organización con sus propios usuarios, clientes y datos", "**Aislamiento**: Cada tenant tiene su espacio separado, sin acceso a datos de otros tenants", "**Empresa**: Información legal incluyendo razón social, Tax ID, industria y descripción", "**Contacto**: Usuario administrador del tenant con acceso completo a la configuración", "**Configuración**: Zona horaria, moneda e idioma predeterminado para el tenant", "**Suscripción**: Plan activo (Free, Basic, Pro, Enterprise) y estado de la cuenta", "**Uso de recursos**: Límites y consumo actual de usuarios, clientes, campañas y almacenamiento", "**Gestión**: Crear, editar, ver detalles y eliminar tenants desde la vista principal"],

      // Tasks
      "tasks.title": "Información de Tareas",
      "tasks.description": "Sistema Kanban para gestión de flujo de trabajo",
      "tasks.items": ["**Tablero Kanban**: Organización en estados: Por Hacer, En Progreso, Revisión y Completado", "**Tipos**: Diseño, copy, aprobación, publicación, análisis y otros", "**Prioridad**: Baja, media, alta y urgente para organizar el trabajo", "**Asignación**: Asignar tareas a usuarios específicos del equipo", "**Seguimiento**: Fechas de vencimiento y horas estimadas vs reales"],

      // Posts
      "posts.title": "Información de Posts",
      "posts.description": "Gestión de contenido para redes sociales",
      "posts.items": ["**Contenido**: Copy, hashtags, menciones y medios adjuntos para cada post", "**Plataformas**: Publicación en Facebook, Instagram, Twitter, LinkedIn, TikTok y YouTube", "**Estados**: Borrador, pendiente aprobación, aprobado, rechazado, programado y publicado", "**Programación**: Fechas y horarios específicos para publicación automática", "**Analytics**: Métricas de impresiones, engagement, clicks y shares"],

      // Analytics
      "analytics.title": "Información de Analytics",
      "analytics.description": "Métricas y reportes de rendimiento",
      "analytics.items": ["**Métricas**: Impresiones, engagement, clicks y ROI por campaña y plataforma", "**Filtros temporales**: Comparar períodos para identificar tendencias", "**Rendimiento**: CTR, CPM y otras métricas clave de performance", "**Reportes**: Análisis detallado por cliente, campaña y plataforma"],

      // Users
      "users.title": "Información de Usuarios",
      "users.description": "Gestión de usuarios y accesos",
      "users.items": ["**Usuarios**: Cada usuario puede tener uno o varios *roles* que determinan sus permisos", "**Estados**: *Activo/Inactivo* controlan el acceso sin eliminar la cuenta", "**Roles**: Sistema flexible de permisos basado en roles personalizables", "**Gestión**: Crear, editar, cambiar contraseñas y gestionar estados"],

      // Roles
      "roles.title": "Información de Roles",
      "roles.description": "Sistema de permisos y roles",
      "roles.items": ["**Roles**: Agrupan permisos para simplificar la administración (ej: *Viewer*, *Manager*, *Content Creator*)", "**Rol por defecto**: Se asigna automáticamente a usuarios nuevos", "**Permisos**: Agrupados por módulo con opciones *Marcar todo* / *Desmarcar todo*", "**Gestión**: Crear roles personalizados y asignar permisos granulares"],

      // Client Detail
      "clientDetail.title": "Información de Cliente",
      "clientDetail.description": "Vista detallada del cliente",
      "clientDetail.items": ["**Información básica**: Datos de contacto, empresa y estado del cliente", "**Brand Kit**: Logo, colores, fuentes y guías de marca", "**Proyectos**: Listado y gestión de proyectos asociados", "**Favoritos**: Marcar cliente como favorito para acceso rápido"],

      // Client Projects
      "clientProjects.title": "Proyectos del Cliente",
      "clientProjects.description": "Gestión de proyectos por cliente",
      "clientProjects.items": ["**Proyectos**: Agrupan campañas, objetivos y presupuesto para un mismo cliente", "**Gestión**: Crear, buscar, editar y eliminar proyectos", "**Campañas**: Cada proyecto puede contener múltiples campañas", "**Presupuesto**: Control de presupuesto total por proyecto"],

      // Campaign Detail
      "campaignDetail.title": "Sobre esta campaña",
      "campaignDetail.description": "Vista detallada de campaña",
      "campaignDetail.items": ["**Timeline**: Fechas de inicio, fin y duración de la campaña", "**Presupuesto**: Total, asignado y gastado con control de costos", "**Objetivos**: Metas específicas y KPIs de la campaña", "**Plataformas**: Canales donde se ejecuta la campaña", "**Tablero de lanzamientos**: Entregables con estados o devoluciones"],

      // Post Detail
      "postDetail.title": "Sobre este post",
      "postDetail.description": "Vista detallada de post",
      "postDetail.items": ["**Contenido**: Copy completo, hashtags y menciones organizadas", "**Plataformas**: Canales donde se publicará el post", "**Programación**: Fecha, hora y zona horaria de publicación", "**Estado**: Borrador, pendiente, aprobado, rechazado, programado o publicado", "**Analíticas**: Métricas posteriores a la publicación", "**Media**: Imágenes, videos o carruseles asociados"],

      // Client Context Info
      "clientContextInfo.title": "Información del Cliente",
      "clientContextInfo.description": "Datos de contacto y empresa",
      "clientContextInfo.items": ["**Contacto**: Email obligatorio y teléfono opcional", "**Empresa**: Nombre, industria y sitio web", "**Estado**: Ciclo del cliente: *Activo*, *Onboarding*, *Inactivo*", "**Redes sociales**: Enlaces a perfiles", "**Edición**: Actualizar con *Editar → Guardar*"],

      // Client Context Brand Kit
      "clientContextBrandKit.title": "Brand Kit",
      "clientContextBrandKit.description": "Elementos visuales del cliente",
      "clientContextBrandKit.items": ["**Logo**: Formatos recomendados: SVG o PNG", "**Colores**: Tonos principales y secundarios", "**Fuentes**: Fuentes oficiales separadas por coma", "**Guías**: Indicaciones de estilo y uso", "**Consistencia**: Afecta todas las vistas dependientes"],

      // Client Context Campaigns
      "clientContextCampaigns.title": "Campañas del Cliente",
      "clientContextCampaigns.description": "Campañas organizadas por proyecto",
      "clientContextCampaigns.items": ["**Vista unificada**: Todas las campañas en un solo lugar", "**Organización**: Cada campaña muestra su proyecto de origen", "**Búsqueda**: Por nombre, descripción o proyecto", "**Filtros**: Por estado"],

      // Client Context Posts
      "clientContextPosts.title": "Posts del Cliente",
      "clientContextPosts.description": "Posts organizados por campaña y proyecto",
      "clientContextPosts.items": ["**Vista jerárquica**: Posts agrupados por campaña", "**Breadcrumbs**: Muestra proyecto y campaña", "**Búsqueda**: Título, copy, campaña o proyecto", "**Estados**: Filtro por estado de publicación"],

      // Client Context Users
      "clientContextUsers.title": "Usuarios del Cliente",
      "clientContextUsers.description": "Gestión de usuarios vinculados al cliente",
      "clientContextUsers.items": ["**Tipos**: Usuario Cliente", "**Filtros**: Búsqueda por nombre/email", "**Crear usuario**: Email, contraseña y roles", "**Edición**: Datos, estado y roles", "**Contraseña**: Solo para usuarios cliente", "**Permisos**: Nivel de acceso interno", "**Eliminar**: Remueve el usuario definitivamente"],

      // Client Dashboard
      "clientDashboard.title": "Dashboard Cliente",
      "clientDashboard.description": "Vista general con KPIs y accesos rápidos",
      "clientDashboard.items": ["**KPIs**: Campañas activas, aprobaciones, posts programados", "**Acciones rápidas**: Crear solicitud y navegar campañas", "**Actividad reciente**: Últimos elementos actualizados", "**Estado visual**: Indicadores por color"],

      // Calendar
      "calendar.title": "Información del Calendario",
      "calendar.description": "Vista de posts programados y publicados",
      "calendar.items": ["**Vistas**: Mes, semana, día y agenda", "**Coloración**: Según estado del post", "**Tipos de eventos**: Posts, tareas, reuniones, deadlines", "**Navegación**: Click para ver detalles", "**Programación**: Según fecha programada"],

      // Assistant
      "assistant.title": "Información del Asistente IA",
      "assistant.description": "Asistente para marketing y creatividad",
      "assistant.items": ["**Conversación**: Chat en lenguaje natural", "**Marketing**: Ideas, estrategias y análisis", "**Atajos**: Enter para enviar, Shift+Enter para salto", "**Historial**: Se mantiene en la sesión"],

      //
      // ---------------------------------------------------------
      // NUEVO: Gestión de Pedidos (Orders)
      // ---------------------------------------------------------
      //
      "orders.title": "Gestión de Pedidos",
      "orders.description": "Módulo para administrar las solicitudes realizadas por los Coordinadores y Colaboradores. Aquí el área administrativa puede aprobar, rechazar y monitorear el estado de cada pedido.",
      "orders.items": ["**Pedidos**: Cada solicitud contiene título, descripción, categoría y fotografía adjunta opcional.", "**Flujo de estados**: Los pedidos avanzan por etapas: *Pendiente*, *Aprobado*, *Rechazado*, *Entregado*, *Cancelado*.", "**Acciones disponibles**: Aprobar, rechazar y marcar como entregado según la política interna.", "**Categorías de pedidos**: Permite crear grupos organizados (Ej: Equipamiento, Uniformes, Herramientas, Tecnología).", "**Filtros y búsqueda**: Buscar por texto, filtrar por estado o categoría para agilizar la gestión.", "**Estadísticas superiores**: Indicadores por estado para visualizar rápidamente la carga del equipo."],

      //
      // ---------------------------------------------------------
      // NUEVO: Pedidos dentro del contexto del Cliente
      // ---------------------------------------------------------
      //
      "clientContextOrders.title": "Pedidos del Cliente",
      "clientContextOrders.description": "Vista filtrada que muestra únicamente los pedidos asociados al cliente actual.",
      "clientContextOrders.items": ["**Contexto**: Solo muestra las solicitudes generadas dentro del cliente en curso.", "**Filtros**: Búsqueda y filtrado por estado o categoría.", "**Acciones**: Según permisos: visualizar, aprobar, rechazar o marcar como entregado.", "**Orden cronológico**: Incluye fecha de solicitud y el estado actual.", "**Evidencia visual**: Previsualización de imágenes adjuntas."],
    },
  },

  // --------------------------------------------------------------------
  // INGLÉS: Solo como espejo de los textos nuevos
  // --------------------------------------------------------------------
  en: {
    help: {
      "orders.title": "Order Management",
      "orders.description": "Module for managing requests created by Coordinators and Collaborators. Admins can approve, reject and track each order.",
      "orders.items": ["**Orders**: Each request includes title, description, category, optional amount and attached photo.", "**Workflow**: States include *Pending*, *Approved*, *Rejected*, *Delivered* and *Cancelled*.", "**Actions**: Approve, reject or mark as delivered depending on policies.", "**Order categories**: Helps organize requests by type (e.g. Equipment, Uniforms, Tools, Technology).", "**Filters & search**: Filter by state or category, or use free-text search.", "**Top statistics**: Quick visual indicators for each order state.", "**Photo viewer**: Zoom modal for attached images."],

      "clientContextOrders.title": "Client Orders",
      "clientContextOrders.description": "Filtered view showing only the orders associated with the current client.",
      "clientContextOrders.items": ["**Contextual view**: Displays orders created under this client only.", "**Filters**: Search and state/category filtering.", "**Actions**: Depending on permissions: view, approve, reject or deliver.", "**Timeline**: Each order shows request date and state.", "**Evidence viewer**: Enlarged photo preview."],
    },
  },
};

// Función para procesar markdown simple
const processMarkdown = (text: string): React.ReactNode => {
  const parts = text.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("***") && part.endsWith("***")) {
      return (
        <span key={index} className="font-semibold">
          {part.slice(3, -3)}
        </span>
      );
    } else if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <span key={index} className="font-bold">
          {part.slice(2, -2)}
        </span>
      );
    } else if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
};

// Construct help content
const buildHelpContent = (key: HelpKey): React.ReactNode => {
  const currentLang = "es";
  const help = (helpResources as any)[currentLang].help;

  const title = help[`${key}.title`];
  const description = help[`${key}.description`];
  const items = help[`${key}.items`];

  if (!title || !items) {
    return <div className="text-sm text-gray-500">Información no disponible</div>;
  }

  return (
    <div className="space-y-4 text-sm">
      {description && <p className="text-gray-600 dark:text-gray-400 italic">{processMarkdown(description)}</p>}

      <ul className="space-y-3">
        {items.map((item: string, index: number) => (
          <li key={index} className="flex items-start space-x-2">
            <span className="w-1.5 h-1.5 bg-primary-600 rounded-full mt-2 flex-shrink-0"></span>
            <span className="text-gray-700 dark:text-gray-300 leading-relaxed">{processMarkdown(item)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// Contenido compilado
const HELP_CONTENT: Record<HelpKey, HelpEntry> = {
  clients: { title: "Información de Clientes", size: "sm", content: buildHelpContent("clients") },
  dashboard: { title: "Información del Dashboard", size: "sm", content: buildHelpContent("dashboard") },
  platform_dashboard: { title: "Dashboard de Plataforma", size: "sm", content: buildHelpContent("platform_dashboard") },
  tenants: { title: "Información de Tenants", size: "sm", content: buildHelpContent("tenants") },
  tasks: { title: "Información de Tareas", size: "sm", content: buildHelpContent("tasks") },
  posts: { title: "Información de Posts", size: "sm", content: buildHelpContent("posts") },
  analytics: { title: "Información de Analytics", size: "sm", content: buildHelpContent("analytics") },
  users: { title: "Información de Usuarios", size: "sm", content: buildHelpContent("users") },
  roles: { title: "Información de Roles", size: "sm", content: buildHelpContent("roles") },
  clientDetail: { title: "Información de Cliente", size: "sm", content: buildHelpContent("clientDetail") },
  clientProjects: { title: "Proyectos del Cliente", size: "sm", content: buildHelpContent("clientProjects") },
  campaignDetail: { title: "Sobre esta campaña", size: "sm", content: buildHelpContent("campaignDetail") },
  postDetail: { title: "Sobre este post", size: "sm", content: buildHelpContent("postDetail") },
  clientContextInfo: { title: "Información", size: "sm", content: buildHelpContent("clientContextInfo") },
  clientContextBrandKit: { title: "Brand Kit", size: "sm", content: buildHelpContent("clientContextBrandKit") },
  clientContextCampaigns: { title: "Campañas del Cliente", size: "sm", content: buildHelpContent("clientContextCampaigns") },
  clientContextPosts: { title: "Publicaciones del Cliente", size: "sm", content: buildHelpContent("clientContextPosts") },
  clientContextUsers: { title: "Usuarios del Cliente", size: "sm", content: buildHelpContent("clientContextUsers") },
  clientDashboard: { title: "Dashboard Cliente", size: "sm", content: buildHelpContent("clientDashboard") },
  calendar: { title: "Información del Calendario", size: "sm", content: buildHelpContent("calendar") },
  assistant: { title: "Información del Asistente IA", size: "sm", content: buildHelpContent("assistant") },

  //
  // FINAL — CORRECTO
  //
  orders: {
    title: "Gestión de Pedidos",
    size: "sm",
    content: buildHelpContent("orders"),
  },

  clientContextOrders: {
    title: "Pedidos del Cliente",
    size: "sm",
    content: buildHelpContent("clientContextOrders"),
  },
};

export function getHelp(key: HelpKey): HelpEntry {
  return HELP_CONTENT[key];
}

export function hasHelp(key: HelpKey): boolean {
  return Boolean(HELP_CONTENT[key]);
}
