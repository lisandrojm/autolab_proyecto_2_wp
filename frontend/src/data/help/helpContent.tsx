import React from "react";

export type HelpKey = "clients" | "dashboard" | "tasks" | "posts" | "analytics" | "users" | "roles" | "tenants" | "clientDetail" | "clientProjects" | "campaignDetail" | "postDetail" | "clientContextInfo" | "clientContextBrandKit" | "clientContextCampaigns" | "clientContextPosts" | "clientContextUsers" | "clientDashboard" | "calendar" | "assistant" | "platform_dashboard";

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
      "campaignDetail.items": ["**Timeline**: Fechas de inicio, fin y duración de la campaña", "**Presupuesto**: Total, asignado y gastado con control de costos", "**Objetivos**: Metas específicas y KPIs de la campaña", "**Plataformas**: Canales donde se ejecuta la campaña", "**Tablero de lanzamientos**: Entregables con estados y devoluciones"],

      // Post Detail
      "postDetail.title": "Sobre este post",
      "postDetail.description": "Vista detallada de post",
      "postDetail.items": ["**Contenido**: Copy completo, hashtags y menciones organizadas", "**Plataformas**: Canales donde se publicará el post", "**Programación**: Fecha, hora y zona horaria de publicación", "**Estado**: Borrador, pendiente, aprobado, rechazado, programado o publicado", "**Analíticas**: Métricas disponibles después de la publicación (impresiones, engagement, clicks, shares)", "**Media**: Imágenes, videos o carruseles asociados al post"],

      // Client Context Info
      "clientContextInfo.title": "Información",
      "clientContextInfo.description": "Datos de contacto y empresa del cliente",
      "clientContextInfo.items": ["**Contacto**: Email (obligatorio) y teléfono (opcional) para comunicación", "**Empresa**: Nombre de empresa, industria y sitio web", "**Estado**: Ciclo del cliente - *Activo*, *Onboarding* o *Inactivo*", "**Redes sociales**: Enlaces a perfiles en diferentes plataformas", "**Edición**: Usar *Editar* → *Guardar* para actualizar información"],

      // Client Context Brand Kit
      "clientContextBrandKit.title": "Brand Kit",
      "clientContextBrandKit.description": "Elementos de marca del cliente",
      "clientContextBrandKit.items": ["**Logo**: URL directa al archivo. Ideal formatos *SVG* (vector) o *PNG* con fondo transparente", "**Colores**: Lista de tonos en *HEX*. Incluir color primario, secundarios y de apoyo", "**Fuentes**: Nombres separados por coma (ej: 'Inter, Poppins')", "**Guías**: Notas de uso, tamaños mínimos, márgenes seguros y tono de marca", "**Consistencia**: Los cambios impactan en todas las vistas que usan el brand kit"],

      // Client Context Campaigns
      "clientContextCampaigns.title": "Campañas del Cliente",
      "clientContextCampaigns.description": "Todas las campañas organizadas por proyecto",
      "clientContextCampaigns.items": ["**Vista unificada**: Todas las campañas del cliente en un solo lugar", "**Organización**: Cada campaña muestra su proyecto de origen", "**Búsqueda**: Por nombre de campaña, descripción o proyecto", "**Filtros**: Por estado de campaña para organizar la vista"],

      // Client Context Posts
      "clientContextPosts.title": "Posts del Cliente",
      "clientContextPosts.description": "Todos los posts organizados por proyecto y campaña",
      "clientContextPosts.items": ["**Vista unificada**: Todos los posts del cliente organizados jerárquicamente", "**Breadcrumbs**: Cada post muestra su proyecto y campaña de origen", "**Búsqueda**: Por título, contenido, campaña o proyecto", "**Estados**: Filtrar por estado de publicación y aprobación"],

      // Client Context Users (NUEVO)
      "clientContextUsers.title": "Usuarios del Cliente",
      "clientContextUsers.description": "Gestión de usuarios vinculados a un cliente: creación, edición, contraseñas y asignaciones",
      "clientContextUsers.items": ["**Tipos de usuario**: *Usuario Cliente* (creado para este cliente)", "**Buscar y filtrar**: Búsqueda por nombre/email y filtro por estado *Activo/Inactivo*", "**Crear usuario cliente**: Email y contraseña obligatorios; opcional nombre y apellido; seleccionar *Roles de Cliente* aplicables", "**Editar usuario cliente**: Actualizar datos, estados y roles sin afectar otras cuentas", "**Cambiar contraseña**: Disponible solo para *Usuarios Cliente*", "**Permisos**: El campo *permiso* indica el nivel de acceso (ej.: ver/editar) dentro del contexto del cliente", "**Eliminar**: Borra el Usuario Cliente"],

      // Client Dashboard
      "clientDashboard.title": "Dashboard Cliente",
      "clientDashboard.description": "Panel principal para clientes con métricas y accesos rápidos",
      "clientDashboard.items": ["**KPIs principales**: Campañas activas, aprobaciones pendientes, publicaciones programadas y solicitudes totales", "**Acciones rápidas**: Crear solicitud, ver aprobaciones y acceder a campañas desde el dashboard", "**Actividad reciente**: Últimos 5 elementos (posts, campañas, briefs) ordenados por fecha de actualización", "**Navegación**: Acceso directo a todas las secciones del portal cliente", "**Estado visual**: Indicadores de color para identificar rápidamente el estado de cada elemento"],

      // Calendar
      "calendar.title": "Información del Calendario",
      "calendar.description": "Vista de posts programados y publicados en formato calendario",
      "calendar.items": ["**Vistas**: Mes, semana, día y agenda para diferentes niveles de detalle", "**Estados visuales**: Código de colores según estado del post (publicado, programado, aprobado, pendiente, rechazado, borrador)", "**Tipos de eventos**: Posts, tareas, reuniones, fechas límite y campañas (próximamente)", "**Navegación**: Click en cualquier evento para ver detalles completos del post", "**Programación**: Muestra posts según su fecha programada o fecha de creación"],

      // Assistant
      "assistant.title": "Información del Asistente IA",
      "assistant.description": "Tu asistente personal para marketing y creatividad",
      "assistant.items": ["**Conversación**: Chatea en lenguaje natural con el asistente IA para obtener ayuda", "**Marketing**: Solicita estrategias, ideas creativas y análisis de campañas", "**Contexto**: El asistente tiene conocimiento sobre marketing digital y gestión de contenidos", "**Atajos**: Usa Enter para enviar mensajes y Shift+Enter para nueva línea", "**Historial**: Las conversaciones se mantienen durante la sesión actual"],
    },
  },
  en: {
    help: {
      // Clients
      "clients.title": "Client Information",
      "clients.description": "Complete client management and information",
      "clients.items": ["**Client**: Contains contact data, company info and additional details like social media, brand kit and project brief", "**Status**: Can be *Active*, *Inactive* or *Onboarding* to reflect their lifecycle", "**Management**: Create, edit, clone and delete clients from main view", "**Favorites**: Mark important clients for quick access"],

      // Dashboard
      "dashboard.title": "Dashboard Information",
      "dashboard.description": "Main panel with metrics and quick access",
      "dashboard.items": ["**Overview**: Shows key metrics, quick access and general status of campaigns and clients", "**Navigation**: Direct access to all system sections", "**System status**: Server health and connection monitoring", "**Metrics**: General view of performance and main KPIs"],

      // Platform Dashboard (SUPERADMIN)
      "platform_dashboard.title": "Platform Dashboard",
      "platform_dashboard.description": "Superadmin view with global metrics and system status",
      "platform_dashboard.items": ["**Tenants**: Total, active, suspended, and new (last 30 days)", "**Resources**: Total users and clients across the platform", "**Storage**: Percentage used, MB used, and assigned limit", "**Alerts**: Incidents per tenant with severity and type", "**Plans**: Distribution by plan (Free, Basic, Pro, Enterprise)", "**Top consumers**: Tenants with highest storage usage"],

      // Tenants
      "tenants.title": "Tenants Information",
      "tenants.description": "Multi-tenant architecture management",
      "tenants.items": ["**Tenant**: Isolated entity representing an organization with its own users, clients and data", "**Isolation**: Each tenant has its separate space, with no access to other tenants' data", "**Company**: Legal information including legal name, Tax ID, industry and description", "**Contact**: Tenant administrator user with full access to configuration", "**Settings**: Default timezone, currency and language for the tenant", "**Subscription**: Active plan (Free, Basic, Pro, Enterprise) and account status", "**Resource usage**: Limits and current consumption of users, clients, campaigns and storage", "**Management**: Create, edit, view details and delete tenants from main view"],

      // Tasks
      "tasks.title": "Tasks Information",
      "tasks.description": "Kanban system for workflow management",
      "tasks.items": ["**Kanban Board**: Organization in states: To Do, In Progress, Review and Done", "**Types**: Design, copy, approval, publishing, analysis and others", "**Priority**: Low, medium, high and urgent to organize work", "**Assignment**: Assign tasks to specific team users", "**Tracking**: Due dates and estimated vs actual hours"],

      // Posts
      "posts.title": "Posts Information",
      "posts.description": "Social media content management",
      "posts.items": ["**Content**: Copy, hashtags, mentions and attached media for each post", "**Platforms**: Publishing on Facebook, Instagram, Twitter, LinkedIn, TikTok and YouTube", "**States**: Draft, pending approval, approved, rejected, scheduled and published", "**Scheduling**: Specific dates and times for automatic publishing", "**Analytics**: Metrics for impressions, engagement, clicks and shares"],

      // Analytics
      "analytics.title": "Analytics Information",
      "analytics.description": "Performance metrics and reports",
      "analytics.items": ["**Metrics**: Impressions, engagement, clicks and ROI by campaign and platform", "**Time filters**: Compare periods to identify trends", "**Performance**: CTR, CPM and other key performance metrics", "**Reports**: Detailed analysis by client, campaign and platform"],

      // Users
      "users.title": "Users Information",
      "users.description": "User and access management",
      "users.items": ["**Users**: Each user can have one or multiple *roles* that determine their permissions", "**States**: *Active/Inactive* control access without deleting the account", "**Roles**: Flexible permission system based on customizable roles", "**Management**: Create, edit, change passwords and manage states"],

      // Roles
      "roles.title": "Roles Information",
      "roles.description": "Permission and role system",
      "roles.items": ["**Roles**: Group permissions to simplify administration (e.g: *Viewer*, *Manager*, *Content Creator*)", "**Default role**: Automatically assigned to new users", "**Permissions**: Grouped by module with *Select all* / *Deselect all* options", "**Management**: Create custom roles and assign granular permissions"],

      // Client Detail
      "clientDetail.title": "Client Information",
      "clientDetail.description": "Detailed client view",
      "clientDetail.items": ["**Basic information**: Contact data, company and client status", "**Brand Kit**: Logo, colors, fonts and brand guidelines", "**Projects**: List and management of associated projects", "**Favorites**: Mark client as favorite for quick access"],

      // Client Projects
      "clientProjects.title": "Client Projects",
      "clientProjects.description": "Project management by client",
      "clientProjects.items": ["**Projects**: Group campaigns, objectives and budget for the same client", "**Management**: Create, search, edit and delete projects", "**Campaigns**: Each project can contain multiple campaigns", "**Budget**: Total budget control per project"],

      // Campaign Detail
      "campaignDetail.title": "About this campaign",
      "campaignDetail.description": "Detailed campaign view",
      "campaignDetail.items": ["**Timeline**: Start, end dates and campaign duration", "**Budget**: Total, allocated and spent with cost control", "**Objectives**: Specific goals and campaign KPIs", "**Platforms**: Channels where the campaign runs", "**Launch board**: Deliverables with states and feedback"],

      // Post Detail
      "postDetail.title": "About this post",
      "postDetail.description": "Detailed post view",
      "postDetail.items": ["**Content**: Complete copy, hashtags and organized mentions", "**Platforms**: Channels where the post will be published", "**Scheduling**: Publication date, time and timezone", "**Status**: Draft, pending, approved, rejected, scheduled or published", "**Analytics**: Metrics available after publication (impressions, engagement, clicks, shares)", "**Media**: Images, videos or carousels associated with the post"],

      // Client Context Info
      "clientContextInfo.title": "Basic Information",
      "clientContextInfo.description": "Client contact and company data",
      "clientContextInfo.items": ["**Contact**: Email (required) and phone (optional) for communication", "**Company**: Company name, industry and website", "**Status**: Client lifecycle - *Active*, *Onboarding* or *Inactive*", "**Social media**: Links to profiles on different platforms", "**Editing**: Use *Edit* → *Save* to update information"],

      // Client Context Brand Kit
      "clientContextBrandKit.title": "Brand Kit",
      "clientContextBrandKit.description": "Client brand elements",
      "clientContextBrandKit.items": ["**Logo**: Direct URL to file. Ideal formats *SVG* (vector) or *PNG* with transparent background", "**Colors**: List of tones in *HEX*. Include primary, secondary and support colors", "**Fonts**: Names separated by comma (e.g: 'Inter, Poppins')", "**Guidelines**: Usage notes, minimum sizes, safe margins and brand tone", "**Consistency**: Changes impact all views that use the brand kit"],

      // Client Context Campaigns
      "clientContextCampaigns.title": "Client Campaigns",
      "clientContextCampaigns.description": "All campaigns organized by project",
      "clientContextCampaigns.items": ["**Unified view**: All client campaigns in one place", "**Organization**: Each campaign shows its origin project", "**Search**: By campaign name, description or project", "**Filters**: By campaign status to organize the view"],

      // Client Context Posts
      "clientContextPosts.title": "Client Posts",
      "clientContextPosts.description": "All posts organized by project and campaign",
      "clientContextPosts.items": ["**Unified view**: All client posts organized hierarchically", "**Breadcrumbs**: Each post shows its origin project and campaign", "**Search**: By title, content, campaign or project", "**States**: Filter by publication and approval status"],

      // Client Context Users (NEW)
      "clientContextUsers.title": "Client Users",
      "clientContextUsers.description": "Manage users linked to a client: creation, editing, passwords and assignments",
      "clientContextUsers.items": ["**User types**: *Client User* (created for this client) and *Assigned User* (internal user added to the client)", "**Search & filter**: Search by name/email and filter by *Active/Inactive*", "**Create client user**: Email and password required; optional first/last name; choose applicable *Client Roles*", "**Edit client user**: Update data, status and roles without affecting other accounts", "**Change password**: Available only for *Client Users*", "**Assign existing**: Add an internal user without client role and not already assigned", "**Permissions**: *permiso* field indicates access level (e.g., view/edit) inside the client context", "**Delete vs Unassign**: *Delete* removes the Client User; *Unassign* only detaches from the client and keeps the internal account"],

      // Client Dashboard
      "clientDashboard.title": "Client Dashboard",
      "clientDashboard.description": "Main panel for clients with metrics and quick access",
      "clientDashboard.items": ["**Main KPIs**: Active campaigns, pending approvals, scheduled posts and total requests", "**Quick actions**: Create request, view approvals and access campaigns from dashboard", "**Recent activity**: Last 5 items (posts, campaigns, briefs) sorted by update date", "**Navigation**: Direct access to all client portal sections", "**Visual status**: Color indicators to quickly identify the status of each element"],

      // Calendar
      "calendar.title": "Calendar Information",
      "calendar.description": "View of scheduled and published posts in calendar format",
      "calendar.items": ["**Views**: Month, week, day and agenda for different detail levels", "**Visual states**: Color coding by post status (published, scheduled, approved, pending, rejected, draft)", "**Event types**: Posts, tasks, meetings, deadlines and campaigns (coming soon)", "**Navigation**: Click on any event to view complete post details", "**Scheduling**: Shows posts according to their scheduled date or creation date"],

      // Assistant
      "assistant.title": "AI Assistant Information",
      "assistant.description": "Your personal assistant for marketing and creativity",
      "assistant.items": ["**Conversation**: Chat in natural language with the AI assistant for help", "**Marketing**: Request strategies, creative ideas and campaign analysis", "**Context**: The assistant has knowledge about digital marketing and content management", "**Shortcuts**: Use Enter to send messages and Shift+Enter for new line", "**History**: Conversations are maintained during the current session"],
    },
  },
};

// Función para procesar markdown simple
const processMarkdown = (text: string): React.ReactNode => {
  // Procesar **bold**, ***semibold*** y *italic*
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

// Función para construir el contenido de ayuda
const buildHelpContent = (key: HelpKey): React.ReactNode => {
  const currentLang = "es"; // Por ahora fijo, después se puede conectar con i18n
  const help = (helpResources as any)[currentLang].help as Record<string, any>;

  const title = help[`${key}.title`];
  const description = help[`${key}.description`];
  const items = help[`${key}.items`] as string[];

  if (!title || !items) {
    return <div className="text-sm text-gray-500">Información no disponible</div>;
  }

  return (
    <div className="space-y-4 text-sm">
      {description && <p className="text-gray-600 dark:text-gray-400 italic">{processMarkdown(description)}</p>}
      <ul className="space-y-3">
        {items.map((item, index) => (
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
  clients: {
    title: "Información de Clientes",
    size: "sm",
    content: buildHelpContent("clients"),
  },
  dashboard: {
    title: "Información del Dashboard",
    size: "sm",
    content: buildHelpContent("dashboard"),
  },
  platform_dashboard: {
    title: "Dashboard de Plataforma",
    size: "sm",
    content: buildHelpContent("platform_dashboard"),
  },
  tenants: {
    title: "Información de Tenants",
    size: "sm",
    content: buildHelpContent("tenants"),
  },
  tasks: {
    title: "Información de Tareas",
    size: "sm",
    content: buildHelpContent("tasks"),
  },
  posts: {
    title: "Información de Posts",
    size: "sm",
    content: buildHelpContent("posts"),
  },
  analytics: {
    title: "Información de Analytics",
    size: "sm",
    content: buildHelpContent("analytics"),
  },
  users: {
    title: "Información de Usuarios",
    size: "sm",
    content: buildHelpContent("users"),
  },
  roles: {
    title: "Información de Roles",
    size: "sm",
    content: buildHelpContent("roles"),
  },
  clientDetail: {
    title: "Información de Cliente",
    size: "sm",
    content: buildHelpContent("clientDetail"),
  },
  clientProjects: {
    title: "Proyectos del Cliente",
    size: "sm",
    content: buildHelpContent("clientProjects"),
  },
  campaignDetail: {
    title: "Sobre esta campaña",
    size: "sm",
    content: buildHelpContent("campaignDetail"),
  },
  postDetail: {
    title: "Sobre este post",
    size: "sm",
    content: buildHelpContent("postDetail"),
  },
  clientContextInfo: {
    title: "Información",
    size: "sm",
    content: buildHelpContent("clientContextInfo"),
  },
  clientContextBrandKit: {
    title: "Brand Kit",
    size: "sm",
    content: buildHelpContent("clientContextBrandKit"),
  },
  clientContextCampaigns: {
    title: "Campañas del Cliente",
    size: "sm",
    content: buildHelpContent("clientContextCampaigns"),
  },
  clientContextPosts: {
    title: "Publicaciones del Cliente",
    size: "sm",
    content: buildHelpContent("clientContextPosts"),
  },
  clientContextUsers: {
    title: "Usuarios del Cliente",
    size: "sm",
    content: buildHelpContent("clientContextUsers"),
  },
  clientDashboard: {
    title: "Dashboard Cliente",
    size: "sm",
    content: buildHelpContent("clientDashboard"),
  },
  calendar: {
    title: "Información del Calendario",
    size: "sm",
    content: buildHelpContent("calendar"),
  },
  assistant: {
    title: "Información del Asistente IA",
    size: "sm",
    content: buildHelpContent("assistant"),
  },
};

export function getHelp(key: HelpKey): HelpEntry {
  return HELP_CONTENT[key];
}

export function hasHelp(key: HelpKey): boolean {
  return Boolean(HELP_CONTENT[key]);
}
