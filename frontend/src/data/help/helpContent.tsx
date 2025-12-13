import React from "react";

export type HelpKey = "clients" | "dashboard" | "tasks" | "posts" | "analytics" | "users" | "roles" | "tenants" | "clientDetail" | "clientProjects" | "campaignDetail" | "postDetail" | "clientContextInfo" | "clientContextBrandKit" | "clientContextCampaigns" | "clientContextPosts" | "clientContextUsers" | "clientDashboard" | "calendar" | "assistant" | "platform_dashboard" | "orders" | "clientContextOrders" | "orderCategories" | "positions" | "levels" | "pdfTemplates" | "vacations" | "vacationsRules";

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

      // Positions
      "positions.title": "Información de Cargos",
      "positions.description": "Gestión de cargos organizacionales",
      "positions.items": ["**Cargos**: Definen las posiciones dentro de la organización (ej: *Diseñador*, *Community Manager*, *Director Creativo*)", "**Descripción**: Detalle opcional sobre las responsabilidades del cargo", "**Asignación**: Los usuarios pueden tener un cargo asignado que define su rol funcional", "**Gestión**: Crear, editar y eliminar cargos según la estructura organizacional"],

      // Levels
      "levels.title": "Información de Niveles",
      "levels.description": "Gestión de niveles de experiencia",
      "levels.items": ["**Niveles**: Representan la antigüedad o experiencia (ej: *Junior*, *Semi-Senior*, *Senior*, *Lead*)", "**Jerarquía**: Los niveles complementan a los cargos agregando una dimensión de experiencia", "**Descripción**: Detalle opcional sobre las expectativas del nivel", "**Gestión**: Crear, editar y eliminar niveles según las necesidades de la organización"],

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

      //
      // ---------------------------------------------------------
      // NUEVO: Gestión de Tipos de Pedidos (Order Categories)
      // ---------------------------------------------------------
      //
      "orderCategories.title": "Guía de Tipos de Pedidos",
      "orderCategories.description": "Este documento describe los tipos de pedidos universales que pueden configurarse en el sistema, utilizando la estructura flexible del módulo Tipos de Pedido. El objetivo es brindar una referencia clara para que administradores y supervisores puedan crear nuevos pedidos sin conocimientos técnicos.",
      "orderCategories.items": ["**Tipos de Pedido Disponibles**: Cada pedido se configura a partir de un *Tipo de Dato*, que define la estructura del formulario que verán los colaboradores en la aplicación móvil.", "**Tipo Fecha**: Se utiliza para solicitudes relacionadas con días específicos, rangos de fechas o eventos temporales. Casos de uso: Solicitud de día por enfermedad, licencias justificadas, permiso por estudio, ausencias programadas, turnos o guardias especiales. Configuraciones: Fecha única o rango de fechas (Desde/Hasta).", "**Tipo Dinero**: Diseñado para cualquier pedido que implique un monto económico. Casos de uso: Adelantos de sueldo, reembolso de gastos, viáticos, gastos varios, compensaciones. Campos: Monto, descripción breve y adjuntos opcionales.", "**Tipo Objeto**: Indicado para pedidos de bienes físicos, equipamiento o materiales. Casos de uso: Herramientas, uniformes, elementos de protección personal, insumos de trabajo, tecnología (mouse, teclado, monitor, notebook), kits de bienvenida, reposición de materiales.", "**Tipo Otros**: Un tipo flexible para cualquier pedido no contemplado en las categorías anteriores. Casos de uso: Justificaciones libres, acciones futuras, comunicaciones internas, solicitudes especiales, notas informativas.", "**Opciones del Pedido**: Cada Tipo de Pedido puede incluir *Opciones* (subcategorías) que sirven para agregar un segundo selector dependiente del tipo principal. Ejemplos para Licencias: Médica, Por estudio, Examen, Cuidado familiar, Matrimonio, Nacimiento. Para Objeto: Tecnología, Seguridad e higiene, Oficina, Accesorios. Para Dinero: Adelanto de sueldo, Gastos con factura, Viáticos.", "**Requiere Acción Futura**: Los Tipos de Pedido pueden configurarse para requerir una acción posterior por parte del colaborador. Útil para: Adjuntar comprobantes luego de un reembolso, presentar certificado médico luego de una licencia, confirmar la recepción de un material, subir una factura luego de un viático, cargar documentación complementaria.", "**Estado del Tipo de Pedido**: Cada Tipo puede ser *Activo* (visible para los colaboradores) o *Inactivo* (oculto temporalmente sin perder historial). Ideal para mantener un catálogo ordenado sin eliminar información importante.", "**Recomendaciones**: Elegir el Tipo de Dato según el campo principal que deberá completar el usuario. Agregar Opciones solo si realmente existen variantes internas del pedido. Activar *Requiere acción futura* únicamente cuando sea necesario solicitar documentación o confirmación adicional. Mantener los nombres claros y precisos para facilitar su entendimiento en la aplicación móvil."],
      //
      // ---------------------------------------------------------
      // NUEVO: PDF Templates
      // ---------------------------------------------------------
      //
      "pdfTemplates.title": "Plantillas PDF",
      "pdfTemplates.description": "Configura los documentos PDF generados automáticamente cuando un pedido o solicitud de vacaciones es aprobado.",
      "pdfTemplates.items": ["**Plantillas**: Cada plantilla define el texto base que se usa para generar el PDF del documento.", "**Códigos y Tipos**: Existen plantillas para diferentes tipos de pedidos (Dinero, Fecha Rango, etc.) y para Vacaciones.", "**Variables dinámicas**: El sistema reemplaza automáticamente valores como {{categoria}}, {{monto}}, {{fechaInicio}}, {{dias}} según el contexto.", "**Plantilla activa**: Si está activa y coincide el código de la solicitud, se usa esa plantilla para generar el PDF.", "**Objetivo**: Personalizar los documentos que reciben los colaboradores."],

      //
      // ---------------------------------------------------------
      // NUEVO: Gestión de Vacaciones
      // ---------------------------------------------------------
      //
      "vacations.title": "Gestión de Vacaciones",
      "vacations.description": "Sistema integral para solicitar, gestionar y aprobar solicitudes de vacaciones del personal.",
      "vacations.items": ["**Solicitudes**: Los colaboradores pueden crear solicitudes especificando fecha de inicio, fecha de fin y motivo opcional.", "**Estados**: Las solicitudes pasan por tres estados: *Pendiente* (esperando aprobación), *Aprobada* (autorizada por el superior) y *Rechazada* (no autorizada con comentarios opcionales).", "**Balance de días**: El sistema muestra los días disponibles, utilizados y el saldo actual para cada colaborador.", "**Edición limitada**: Solo las solicitudes en estado *Pendiente* pueden ser editadas o eliminadas por el solicitante.", "**Estadísticas**: Vista resumida con total de solicitudes, aprobadas, rechazadas y días totales solicitados.", "**Restricciones**: El sistema valida que no se soliciten más días de los disponibles y que las fechas sean coherentes.", "**Historial**: Registro completo de todas las solicitudes con fechas, estados y resultados."],

      "vacationsRules.title": "Configuración de Vacaciones",
      "vacationsRules.description": "Define las reglas y políticas globales que rigen el cálculo y gestión de vacaciones en la empresa.",
      "vacationsRules.items": ["***Configuración Global***", "**Días Base**: Define la cantidad estándar de días de vacaciones y beneficios adicionales.", "**Antigüedad**: Crea tablas para otorgar días extra automáticos según años de servicio.", "**Límites**: Establece topes de días por año, duración máxima por solicitud y días de anticipación.", "**Arrastre**: Configura si los días no usados se pierden o se acumulan para el siguiente periodo.", "***Solapamiento***", "**Control por Área**: Restringe cuántos colaboradores de un mismo equipo pueden estar ausentes al mismo tiempo.", "**Cupos Dinámicos**: Define un número máximo de personas de vacaciones simultáneas para asegurar la operatividad."],
    },
    // Agregar dentro de helpResources.es.help

    futureActionType: {
      title: "Tipo de Acción Futura",
      size: "md",
      content: (
        <div className="space-y-3 text-sm">
          <p>Define qué tipo de acción futura deberá completar el usuario después de crear el pedido.</p>

          <ul className="list-disc ml-5 space-y-1">
            <li>
              <strong>Plazo en días:</strong> el sistema calcula una fecha futura sumando días.
            </li>
            <li>
              <strong>Fecha específica:</strong> el usuario debe seleccionar una fecha fija.
            </li>
            <li>
              <strong>Presentación de documento:</strong> el usuario debe subir o presentar algo.
            </li>
            <li>
              <strong>Vencimiento del sistema:</strong> la fecha se genera automáticamente según reglas internas.
            </li>
            <li>
              <strong>Vencimiento interno:</strong> vencimiento definido por procesos internos.
            </li>
            <li>
              <strong>Sin vencimiento:</strong> solo marca la acción como realizada.
            </li>
          </ul>

          <p>Esta acción se mostrará como un pendiente que el usuario deberá completar.</p>
        </div>
      ),
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

  orderCategories: {
    title: "Guía de Tipos de Pedidos",
    size: "lg",
    content: buildHelpContent("orderCategories"),
  },

  positions: {
    title: "Información de Cargos",
    size: "sm",
    content: buildHelpContent("positions"),
  },

  levels: {
    title: "Información de Niveles",
    size: "sm",
    content: buildHelpContent("levels"),
  },
  pdfTemplates: {
    title: "Plantillas PDF",
    size: "sm",
    content: buildHelpContent("pdfTemplates"),
  },
  vacations: {
    title: "Gestión de Vacaciones",
    size: "sm",
    content: buildHelpContent("vacations"),
  },
  vacationsRules: {
    title: "Configuración de Vacaciones",
    size: "sm",
    content: buildHelpContent("vacationsRules"),
  },
};

export function getHelp(key: HelpKey): HelpEntry {
  return HELP_CONTENT[key];
}

export function hasHelp(key: HelpKey): boolean {
  return Boolean(HELP_CONTENT[key]);
}
