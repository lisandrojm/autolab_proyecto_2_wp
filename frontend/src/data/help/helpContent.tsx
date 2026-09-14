import React from 'react';

/**
 * Las pantallas que tienen ⓘ. Una clave por pantalla, y todas tienen que existir en `HELP_CONTENT`
 * y en los textos de `helpResources.es` — si falta una de las dos puntas, el modal abre vacío.
 *
 * Se borraron las de la etapa de redes sociales (campañas, posts, brand kit, analytics, los
 * dashboards y los `clientContext*`): describían pantallas que ya no existen y nadie las
 * referenciaba. La comprobación es que ningún archivo las nombre — TypeScript no avisa de una clave
 * de más, solo de una que falte.
 */
export type HelpKey = 'fichas' | 'clients' | 'users' | 'roles' | 'tenants' | 'clientDetail' | 'clientProjects' | 'orders' | 'orderCategories' | 'positions' | 'levels' | 'pdfTemplates' | 'vacations' | 'vacationsRules' | 'activityLogs' | 'projectTeam' | 'projects' | 'sedes' | 'contracts' | 'solicitudes' | 'categoriasSat' | 'centrosCosto' | 'contratosFrame' | 'empresas' | 'membretes' | 'bancos' | 'paisesResidencia' | 'holidays' | 'funcionesFrame' | 'miPerfil' | 'requestsConfig' | 'obrasSociales' | 'convenios' | 'areas' | 'documents' | 'empresaFicha' | 'empresaObrasSociales' | 'empresaConvenios' | 'empresaDomicilios' | 'empresaCategorias' | 'empresaDefaults' | 'empresaGruposTipoServicio' | 'empresaContratos' | 'orderTypes' | 'releases' | 'importUsersWp' | 'arcaSucursales' | 'arcaActividades' | 'arcaModalidadContratacion' | 'arcaTipoServicio' | 'arcaGrupoTipoServicio' | 'arcaModalidadLiquidacion' | 'fuentesParitaria';

export type HelpEntry = {
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  content: React.ReactNode;
};

// Recursos de ayuda organizados por idioma (estilo i18n)
const helpResources = {
  es: {
    help: {
      // Fichas (bloque de arriba del menú lateral)
      'fichas.title': 'Fichas',
      'fichas.description': 'Abrí la ficha de una empresa o de un cliente para trabajar en sus secciones.',
      'fichas.items': ['**No filtran el resto de la app**: Admin GENERAL y Configuración siguen mostrando todo. Cuando una pantalla sí está acotada, te lo dice arriba del título.', '**Se abre una por vez**: activar una cierra la otra. Son entidades distintas y no se cruzan — un proyecto de un cliente puede tener contratos de dos empleadoras a la vez.', '**Empresa**: la empleadora. De su ficha cuelgan los datos que ARCA lleva por CUIT (obras sociales, convenios, domicilios) y sus contratos.', '**Cliente**: para quién es el trabajo. De su ficha cuelgan sus proyectos y sus usuarios.'],

      // Clients
      'clients.title': 'Información de Clientes',
      'clients.description': 'Gestión completa de clientes y su información',
      'clients.items': ['**Cliente**: Contiene datos de contacto, empresa e información adicional como redes sociales', '**Estado**: Puede ser *Activo*, *Inactivo* u *Onboarding* para reflejar su ciclo de vida', '**Gestión**: Crear, editar, clonar y eliminar clientes desde la vista principal'],

      // Tenants
      'tenants.title': 'Información de Tenants',
      'tenants.description': 'Gestión de tenants en arquitectura multi-tenant',
      'tenants.items': ['**Tenant**: Entidad aislada que representa una organización con sus propios usuarios, clientes y datos', '**Aislamiento**: Cada tenant tiene su espacio separado, sin acceso a datos de otros tenants', '**Empresa**: Información legal incluyendo razón social, Tax ID, industria y descripción', '**Contacto**: Usuario administrador del tenant con acceso completo a la configuración', '**Configuración**: Zona horaria, moneda e idioma predeterminado para el tenant', '**Suscripción**: Plan activo (Free, Basic, Pro, Enterprise) y estado de la cuenta', '**Uso de recursos**: Límites y consumo actual de usuarios, clientes, campañas y almacenamiento', '**Gestión**: Crear, editar, ver detalles y eliminar tenants desde la vista principal'],

      // Users
      'users.title': 'Información de Usuarios',
      'users.description': 'Gestión de usuarios y accesos',
      'users.items': ['**Usuarios**: Cada usuario puede tener uno o varios *roles* que determinan sus permisos', '**Estados**: *Activo/Inactivo* controlan el acceso sin eliminar la cuenta', '**Roles**: Sistema flexible de permisos basado en roles personalizables', '**Gestión**: Crear, editar, cambiar contraseñas y gestionar estados'],

      // Roles
      'roles.title': 'Información de Roles',
      'roles.description': 'Sistema de permisos y roles',
      'roles.items': ['**Un rol es un conjunto de permisos**, y cada permiso destapa una pantalla. Quien tenga el rol ve eso y nada más.', '**Dos secciones, cada una con su interruptor**: *Plataforma* (lo del escritorio) y *App Mobile* (las tarjetas de la app: Novedades, Pedidos, Vacaciones y Contratación). Un rol nuevo arranca siendo de la app; la plataforma se prende aparte.', '**No se puede guardar un rol sin permisos**: no dejaría entrar a ningún lado.', '**Rol por defecto**: es el que reciben las altas —los usuarios importados de FRAME y los que entran por el link de registro—, así que conviene que abra la app.', '**Quién coordina turnos necesita *Novedades***: sin ese permiso no tiene dónde cargar las de su área, y el sistema no deja sacárselo hasta liberarle la coordinación desde el equipo del proyecto.'],

      // Positions
      'positions.title': 'Información de Cargos',
      'positions.description': 'Gestión de cargos organizacionales',
      'positions.items': ['**Cargos**: Definen las posiciones dentro de la organización (ej: *Diseñador*, *Community Manager*, *Director Creativo*)', '**Descripción**: Detalle opcional sobre las responsabilidades del cargo', '**Asignación**: Los usuarios pueden tener un cargo asignado que define su rol funcional', '**Gestión**: Crear, editar y eliminar cargos según la estructura organizacional'],

      // Levels
      'levels.title': 'Información de Niveles',
      'levels.description': 'Gestión de niveles de experiencia',
      'levels.items': ['**Niveles**: Representan la antigüedad o experiencia (ej: *Junior*, *Semi-Senior*, *Senior*, *Lead*)', '**Jerarquía**: Los niveles complementan a los cargos agregando una dimensión de experiencia', '**Descripción**: Detalle opcional sobre las expectativas del nivel', '**Gestión**: Crear, editar y eliminar niveles según las necesidades de la organización'],

      // Client Detail
      'clientDetail.title': 'Información de Cliente',
      'clientDetail.description': 'Vista detallada del cliente',
      'clientDetail.items': ['**Información básica**: Datos de contacto, empresa y estado del cliente', '**Proyectos**: Listado y gestión de proyectos asociados'],

      // Client Projects
      'clientProjects.title': 'Proyectos del Cliente',
      'clientProjects.description': 'Gestión de proyectos por cliente',
      'clientProjects.items': ['**Proyectos**: Agrupan objetivos para un mismo cliente', '**Gestión**: Crear, buscar, editar y eliminar proyectos'],

      //
      // ---------------------------------------------------------
      // NUEVO: Gestión de Pedidos (Orders)
      // ---------------------------------------------------------
      //
      'orders.title': 'Gestión de Pedidos',
      'orders.description': 'Módulo para administrar las solicitudes realizadas por los Coordinadores y Colaboradores. Aquí el área administrativa puede aprobar, rechazar y monitorear el estado de cada pedido.',
      'orders.items': ['**Pedidos**: Cada solicitud contiene título, descripción, categoría y fotografía adjunta opcional.', '**Flujo de estados**: Los pedidos avanzan por etapas: *Pendiente*, *Aprobado*, *Rechazado*, *Entregado*, *Cancelado*.', '**Acciones disponibles**: Aprobar, rechazar y marcar como entregado según la política interna.', '**Categorías de pedidos**: Permite crear grupos organizados (Ej: Equipamiento, Uniformes, Herramientas, Tecnología).', '**Filtros y búsqueda**: Buscar por texto, filtrar por estado o categoría para agilizar la gestión.', '**Estadísticas superiores**: Indicadores por estado para visualizar rápidamente la carga del equipo.'],

      //
      // ---------------------------------------------------------
      // NUEVO: Gestión de Tipos de Pedidos (Order Categories)
      // ---------------------------------------------------------
      //
      'orderCategories.title': 'Guía de Tipos de Pedidos',
      'orderCategories.description': 'Este documento describe los tipos de pedidos universales que pueden configurarse en el sistema, utilizando la estructura flexible del módulo Tipos de Pedido. El objetivo es brindar una referencia clara para que administradores y supervisores puedan crear nuevos pedidos sin conocimientos técnicos.',
      'orderCategories.items': ['**Tipos de Pedido Disponibles**: Cada pedido se configura a partir de un *Tipo de Dato*, que define la estructura del formulario que verán los colaboradores en la aplicación móvil.', '**Tipo Fecha**: Se utiliza para solicitudes relacionadas con días específicos, rangos de fechas o eventos temporales. Casos de uso: Solicitud de día por enfermedad, licencias justificadas, permiso por estudio, ausencias programadas, turnos o guardias especiales. Configuraciones: Fecha única o rango de fechas (Desde/Hasta).', '**Tipo Dinero**: Diseñado para cualquier pedido que implique un monto económico. Casos de uso: Adelantos de sueldo, reembolso de gastos, viáticos, gastos varios, compensaciones. Campos: Monto, descripción breve y adjuntos opcionales.', '**Tipo Objeto**: Indicado para pedidos de bienes físicos, equipamiento o materiales. Casos de uso: Herramientas, uniformes, elementos de protección personal, insumos de trabajo, tecnología (mouse, teclado, monitor, notebook), kits de bienvenida, reposición de materiales.', '**Tipo Otros**: Un tipo flexible para cualquier pedido no contemplado en las categorías anteriores. Casos de uso: Justificaciones libres, acciones futuras, comunicaciones internas, solicitudes especiales, notas informativas.', '**Opciones del Pedido**: Cada Tipo de Pedido puede incluir *Opciones* (subcategorías) que sirven para agregar un segundo selector dependiente del tipo principal. Ejemplos para Licencias: Médica, Por estudio, Examen, Cuidado familiar, Matrimonio, Nacimiento. Para Objeto: Tecnología, Seguridad e higiene, Oficina, Accesorios. Para Dinero: Adelanto de sueldo, Gastos con factura, Viáticos.', '**Requiere Acción Futura**: Los Tipos de Pedido pueden configurarse para requerir una acción posterior por parte del colaborador. Útil para: Adjuntar comprobantes luego de un reembolso, presentar certificado médico luego de una licencia, confirmar la recepción de un material, subir una factura luego de un viático, cargar documentación complementaria.', '**Estado del Tipo de Pedido**: Cada Tipo puede ser *Activo* (visible para los colaboradores) o *Inactivo* (oculto temporalmente sin perder historial). Ideal para mantener un catálogo ordenado sin eliminar información importante.', '**Recomendaciones**: Elegir el Tipo de Dato según el campo principal que deberá completar el usuario. Agregar Opciones solo si realmente existen variantes internas del pedido. Activar *Requiere acción futura* únicamente cuando sea necesario solicitar documentación o confirmación adicional. Mantener los nombres claros y precisos para facilitar su entendimiento en la aplicación móvil.'],
      //
      // ---------------------------------------------------------
      // NUEVO: PDF Templates
      // ---------------------------------------------------------
      //
      'pdfTemplates.title': 'Plantillas | Pedidos | Vacaciones',
      'pdfTemplates.description': 'Configura los documentos PDF generados automáticamente cuando un pedido o solicitud de vacaciones es aprobado.',
      'pdfTemplates.items': ['**Plantillas**: Cada plantilla define el texto base que se usa para generar el PDF del documento.', '**Códigos y Tipos**: Existen plantillas para diferentes tipos de pedidos (Dinero, Fecha Rango, etc.) y para Vacaciones.', '**Variables dinámicas**: El sistema reemplaza automáticamente valores como {{categoria}}, {{monto}}, {{fechaInicio}}, {{dias}} según el contexto.', '**Plantilla activa**: Si está activa y coincide el código de la solicitud, se usa esa plantilla para generar el PDF.', "**Membrete y firma**: Con la opción 'Membrete con datos de la empresa y firma' activada, el PDF se genera con el encabezado (logo + razón social, CUIT y domicilio) y la firma de la empresa. Como estos PDF no están atados a un proyecto, se toma la primera empresa con membrete cargado (en Empresa/s | Membrete/s y firma). Sin membrete cargado, esta opción no se puede activar.", '**Objetivo**: Personalizar los documentos que reciben los colaboradores.'],

      //
      // ---------------------------------------------------------
      // NUEVO: Gestión de Vacaciones
      // ---------------------------------------------------------
      //
      'vacations.title': 'Gestión de Vacaciones',
      'vacations.description': 'Sistema integral para solicitar, gestionar y aprobar solicitudes de vacaciones del personal.',
      'vacations.items': ['**Solicitudes**: Los colaboradores pueden crear solicitudes especificando fecha de inicio, fecha de fin y motivo opcional.', '**Estados**: Las solicitudes pasan por tres estados: *Pendiente* (esperando aprobación), *Aprobada* (autorizada por el superior) y *Rechazada* (no autorizada con comentarios opcionales).', '**Balance de días**: El sistema muestra los días disponibles, utilizados y el saldo actual para cada colaborador.', '**Edición limitada**: Solo las solicitudes en estado *Pendiente* pueden ser editadas o eliminadas por el solicitante.', '**Estadísticas**: Vista resumida con total de solicitudes, aprobadas, rechazadas y días totales solicitados.', '**Restricciones**: El sistema valida que no se soliciten más días de los disponibles y que las fechas sean coherentes.', '**Historial**: Registro completo de todas las solicitudes con fechas, estados y resultados.'],

      'vacationsRules.title': 'Configuración de Vacaciones',
      'vacationsRules.description': 'Define las reglas y políticas globales que rigen el cálculo y gestión de vacaciones en la empresa.',
      'vacationsRules.items': ['***Configuración Global***', '**Días Base**: Define la cantidad estándar de días de vacaciones y beneficios adicionales.', '**Antigüedad**: Crea tablas para otorgar días extra automáticos según años de servicio.', '**Límites**: Establece topes de días por año, duración máxima por solicitud y días de anticipación.', '**Arrastre**: Configura si los días no usados se pierden o se acumulan para el siguiente periodo.', '***Solapamiento***', '**Control por Área**: Restringe cuántos colaboradores de un mismo equipo pueden estar ausentes al mismo tiempo.', '**Cupos Dinámicos**: Define un número máximo de personas de vacaciones simultáneas para asegurar la operatividad.'],

      'activityLogs.title': 'Registro de Novedades',
      'activityLogs.description': 'Sistema de reporte diario de asistencia y novedades del personal.',
      'activityLogs.items': ['**Reportes Diarios**: Visualización centralizada de los formularios enviados por coordinadores.', '**Control de Asistencia**: Detalle de horas de entrada, salida y verificación de horas extras.', '**Gestión de Ausencias**: Registro de faltas justificadas, compensatorios y licencias.', '**Firmas**: Estado de validación digital de los reportes.', '**Filtros**: Búsqueda por fecha y área para auditoría rápida.'],

      'projectTeam.title': 'Gestión de Equipo',
      'projectTeam.description': 'Administra los miembros asignados al proyecto.',
      'projectTeam.items': ['**Usuarios Disponibles**: Lista de candidatos para agregar.', '**Filtros**: Busca por área, cargo o palabra clave.', '**Equipo Actual**: Miembros activos en el proyecto.', '**Acciones**: Agrega o elimina usuarios con un clic.'],

      'projects.title': 'Gestión de Proyectos',
      'projects.description': 'Administración de todos los proyectos activos en el sistema.',
      'projects.items': ['**Proyectos**: Espacios de trabajo dedicados a un cliente específico.', '**Información**: Cada proyecto muestra su cliente, descripción y estado actual (Activo, En Espera, Completado, Archivado).', '**Búsqueda**: Encuentra proyectos rápidamente por nombre o cliente.', '**Navegación**: Haz clic en cualquier tarjeta para ver el detalle completo del proyecto.'],

      'sedes.title': 'Gestión de Sedes',
      'sedes.description': 'Listado de ubicaciones físicas y sedes operativas.',
      'sedes.items': ['**Sedes**: Ubicaciones donde se llevan a cabo las actividades.', '**Identificación**: Cada sede tiene un ID Interno y un ID Externo para integración.', '**Información**: Visualiza el nombre, tipo y códigos de identificación de cada lugar.', '**Búsqueda**: Filtra por nombre o ID externo para encontrar una ubicación específica.'],

      'contracts.title': 'Gestión de Contratos',
      'contracts.description': 'Historial completo de contrataciones y vinculaciones laborales.',
      'contracts.items': ['**Registros**: Detalle de cada contrato asociado a un usuario y proyecto.', '**Datos clave**: Incluye fechas de alta/baja, duración en días, sueldo y rol desempeñado.', '**Estado**: Visualiza si el contrato está vigente o finalizado.', '**Sede y Rol**: Ubicación y función específica que desempeña el usuario.', '**Datos ARCA**: para generar el alta, cada contrato necesita categoría, domicilio, actividad y obra social. Lo que falta se marca en la fila, pero casi siempre se resuelve UNA vez en la ficha de la empleadora —no contrato por contrato—: si la empresa no tiene convenios o domicilios registrados, ninguno de sus contratos puede generar el archivo.', '**El TXT es por CUIT**: ARCA rechaza un archivo que mezcle contratos de dos empleadoras, así que hay que filtrar por empresa antes de generarlo. Desde la ficha de cada empleadora ya viene acotado.', '**Filtros**: Busca por nombre de usuario, proyecto o contrato.', '**Vistas**: Alterna entre vista de tabla (detalle) y tarjetas (resumen).'],

      // Solicitudes de contratación (va con Contratos: son dos etapas del mismo ciclo)
      'solicitudes.title': 'Solicitudes de Contratación',
      'solicitudes.description': 'Los pedidos de alta que manda el coordinador, esperando ser aprobados o rechazados.',
      'solicitudes.items': ['**Qué son**: el pedido de dar de alta a alguien en un proyecto. Las manda el **coordinador** desde mobile, y acá se **aprueban o se rechazan**.', '**Todavía no son un contrato**: una solicitud dice qué se quiere contratar —rol, categoría, fechas, horario y valor de la jornada—, pero nada de eso existe hasta aprobarla.', '**Aprobar** abre el equipo del proyecto con el wizard precargado: ahí se completan contrato, área y turno, y recién entonces la persona queda contratada y aparece en Contratos.', '**Rechazar no borra**: la solicitud queda registrada como *rechazada*, y se puede **volver a pendiente** si fue un error. Eliminar es definitivo y recién se ofrece una vez rechazada o cancelada.', '**Estados**: *pendiente* (esperando respuesta), *aprobada* (ya se dio de alta), *rechazada* y *cancelada*. Las aprobadas siguen listadas: son el historial de cómo entró cada persona.', '**Tipo de alta**: por qué vía se pidió contratar —alta temprana de ARCA o servicios—. Es el dato del que después depende el trámite impositivo, y *Sin definir* significa que la solicitud no lo declaró.'],

      // Categorías
      'categoriasSat.title': 'Información de Categorías',
      'categoriasSat.description': 'Categorías profesionales del nomenclador de ARCA, ordenadas como el organismo las modela: Convenio → Grupo → Categoría.',
      'categoriasSat.items': ['**Convenio (CCT)**: El primer nivel, y es obligatorio. ARCA no tiene un catálogo global de categorías: solo ofrece las de los convenios que la empleadora tiene habilitados. Una categoría sin convenio no se puede dar de alta.', '**Grupo salarial**: Acá vive la ESCALA (básico, adicional, presentismo, bruto y neto). Todas las categorías del grupo comparten esos importes, así que una paritaria se aplica editando el grupo — no las decenas de categorías que cuelgan de él.', '**Categoría**: Solo su código de ARCA de 6 dígitos (035283, con los ceros) y su nombre. Los importes los hereda del grupo.', '**Retribución del alta**: El sueldo bruto del grupo es lo que viaja al TXT de ARCA. En 0, el alta no se puede generar.', '**Carga masiva**: Bajá la plantilla del convenio —sale con sus grupos reales y la escala vigente—, pisá los importes y subila. Actualiza escalas: no crea ni borra grupos ni categorías.'],

      // Centros de Costos
      'centrosCosto.title': 'Información de Centros de Costos',
      'centrosCosto.description': 'Catálogo de centros de costo para imputar proyectos y gastos.',
      'centrosCosto.items': ['**Centro de costo**: Unidad contable a la que se imputan proyectos, contratos y gastos.', '**Uso**: Se asigna a cada proyecto para agrupar y reportar costos por área o unidad de negocio.', '**Gestión**: Crear, editar y eliminar centros de costo, o importarlos desde un Excel.'],

      // Contratos (config / contratos-frame)
      'contratosFrame.title': 'Información de Contratos',
      'contratosFrame.description': 'Catálogo de tipos de contrato con sus parámetros para armar los contratos del personal.',
      'contratosFrame.items': ['**Tipo de contrato**: Modalidad de contratación (ej. Jornada, Plazo fijo, Tiempo Indeterminado, Eventual).', '**Parámetros**: Cantidad de jornadas y multiplicador diario que definen el cálculo de la liquidación.', '**ID externo**: Vincula el tipo con FRAME para la sincronización.', "**Membrete y firma**: Con la opción 'Membrete con datos de la empresa y firma' activada, el contrato se genera con el encabezado (logo + razón social, CUIT y domicilio) y la firma de la empresa. La empresa se elige al descargar (de las asignadas al proyecto). El membrete —logo y firma— se carga en Empresa/s | Membrete/s y firma; sin membrete cargado, esta opción no se puede activar.", '**Gestión**: Crear, editar, eliminar e importar tipos de contrato desde un Excel.'],

      // Empresas
      'empresas.title': 'Información de Empresas',
      'empresas.description': 'Empresas / productoras con sus datos legales para armar los contratos.',
      'empresas.items': ["**Empresa**: Razón social y CUIT de la productora que figura como 'La Empleadora' en los contratos.", '**Domicilio legal**: Calle, número, localidad, provincia y código postal de la empresa.', '**Firmante**: Persona que representa a la empresa al firmar (nombre, DNI y cargo, ej. Socio Gerente).', '**Representante legal**: Apoderado legal con su nombre y email de contacto.', '**Columna ARCA**: dice si esa empleadora puede dar altas hoy. Son cuatro requisitos —convenios, domicilios, obras sociales y CUIT—; el badge los cuenta y, clickeado, muestra cuáles faltan y lleva a resolverlos. Mientras falte uno, NINGUNO de sus contratos puede generar el TXT.', '**Convenios / Obras sociales / Sucursales**: lo que ese CUIT tiene registrado en el padrón de ARCA. El número abre el detalle. Se lleva por empleadora: lo que declaró una no sirve para otra.', '**Ficha de la empresa**: desde el bloque FICHAS del menú se abre cada empleadora para trabajar en esos datos, ver sus contratos y cargar sus excepciones de obra social.', '**Gestión**: Crear, editar y eliminar empresas para usarlas al generar los contratos.'],

      // Entidades Financieras (Bancos)
      'bancos.title': 'Información de Entidades Financieras',
      'bancos.description': 'Catálogo de bancos y entidades financieras para los datos bancarios del personal.',
      'bancos.items': ['**Entidad financiera**: Banco o entidad donde el personal cobra sus haberes.', '**Uso**: Se selecciona al cargar los datos bancarios (CBU/alias) de cada usuario.', '**Gestión**: Crear, editar y eliminar entidades, o importarlas desde un Excel.'],

      // Países de residencia
      'paisesResidencia.title': 'Información de Países de residencia',
      'paisesResidencia.description': 'Países que se ofrecen para el domicilio de una persona. No es la nacionalidad ni el país de nacimiento, que siguen usando los países de FRAME.',
      'paisesResidencia.items': ['**Dónde se usa**: En el registro, en la ficha del usuario (Nuevo usuario / editar), en Mi Perfil y en la app, al elegir el país del domicilio.', '**ID**: Es lo que queda guardado en cada persona. Si lo dejás vacío al crear, se asigna solo. Cambiarle el ID a un país que ya se usa hace que esas personas dejen de verlo.', '**Estado**: Un país inactivo no se ofrece más, pero quien ya lo tiene cargado lo conserva y lo sigue viendo.', '**Origen**: La lista arrancó como copia de los países de FRAME, una sola vez. Desde entonces se administra acá: reiniciar el servidor no la vuelve a tocar.'],

      // Feriados
      'holidays.title': 'Información de Feriados',
      'holidays.description': 'Calendario de feriados que afecta la liquidación de jornadas y horas.',
      'holidays.items': ['**Feriado**: Día no laborable con su fecha y descripción.', '**Impacto**: Los feriados se consideran en el cálculo de asistencias, horas extra y liquidaciones.', '**Gestión**: Crear, editar y eliminar feriados del calendario.'],

      // Funciones FRAME
      'funcionesFrame.title': 'Información de Roles Empresa',
      'funcionesFrame.description': 'El oficio con el que cada persona trabaja en una producción. No confundir con Usuarios → Roles, que son los permisos de la plataforma.',
      'funcionesFrame.items': ['**Rol Empresa**: el oficio del personal en la producción (ej. Camarógrafo, Sonidista, Maquillador).', '**No es un permiso**: quién ve qué pantalla se decide en Usuarios → Roles. Acá se define con qué trabaja la persona.', '**Categorías**: cada rol mapea a las categorías de ARCA con las que se liquida su contrato.', '**Gestión**: crear, editar y eliminar.'],

      // Mi Perfil
      'miPerfil.title': 'Información de Mi Perfil',
      'miPerfil.description': 'Tus datos personales, de contacto y de cuenta.',
      'miPerfil.items': ['**Datos personales**: Nombre, documento y datos de contacto.', '**Cuenta**: Email de acceso y cambio de contraseña.', '**Roles**: Roles de sistema asignados que determinan tus permisos.'],

      // Novedades (Configuración)
      'requestsConfig.title': 'Información de Configuración de Novedades',
      'requestsConfig.description': 'Parámetros que controlan cómo se cargan y validan las novedades de los proyectos.',
      'requestsConfig.items': ['**Tipos de novedad**: Motivos de ausencia/presencia disponibles al cargar una novedad.', '**Reglas**: Días permitidos para cargar hacia atrás, personal adicional y carga rápida.', '**Alcance**: La configuración aplica globalmente o puede ajustarse por proyecto.'],

      // Obras Sociales
      'obrasSociales.title': 'Información de Obras Sociales',
      'obrasSociales.description': 'Catálogo de obras sociales de ARCA para los datos del personal.',
      'obrasSociales.items': ['**Obra social**: Cobertura de salud asociada al personal.', '**Origen**: Son las obras sociales registradas en ARCA (ex AFIP), en Simplificación Registral → Registrar Obras Sociales. Cada una se identifica con su código **RNOS** (formato X-XXXX-X).', '**Actualización**: Este catálogo es una copia local, NO se sincroniza solo con ARCA. Si en ARCA se dan de alta, se dan de baja o cambian obras sociales, hay que volver a importarlas acá con **Importar Excel** para que el listado quede al día.', '**Este es el catálogo universal**: las 494 que existen. Cada empleadora declara aparte cuáles tiene registradas ante ARCA, en su ficha → Obras Sociales, y el organismo solo acepta altas con esas.', '**La obra social de cada persona no se elige acá**: se resuelve en cascada — la propia de la persona (desregulación) → la excepción que su empleadora haya puesto para ese convenio → **la del convenio**, que es el caso normal → y solo para los excluidos de convenio (9999/99), la de la empleadora.', '**Si nada de eso resuelve, el campo FALTA**: no hay una obra social por defecto que rellene el hueco. Había una y se eliminó: solo entraba cuando faltaba configurar algo aguas arriba, y lo único que hacía era mandar el alta con una obra social sin fundamento, que ARCA acepta igual.', '**Gestión**: Crear, editar y eliminar obras sociales, o importarlas desde un Excel (descargá la **Plantilla** para respetar el formato).'],

      // Áreas
      'areas.title': 'Información de Áreas',
      'areas.description': 'Áreas de la organización a las que pertenece cada persona.',
      'areas.items': ['**Área**: La división interna donde trabaja la persona (ej. Producción, Administración, Post).', '**Uso**: Se asigna en el perfil de cada usuario y sirve para agrupar y filtrar equipos, novedades y reportes.', '**No es una Sede ni un Centro de Costos**: la Sede es dónde se trabaja y el Centro de Costos a qué se imputa la plata. El Área es a qué parte de la organización pertenece la persona.', '**Gestión**: Crear, editar y eliminar áreas, con su nombre y descripción.'],

      // Documentos (Dropbox)
      'documents.title': 'Información de Documentos',
      'documents.description': 'Los documentos del personal que se detectan automáticamente en Dropbox.',
      'documents.items': ['**De dónde salen**: un escaneo recorre las carpetas vigiladas de Dropbox y trae lo que encuentra. Los archivos no se suben desde acá.', '**Dos pestañas**: *HelloSign* muestra los documentos del Dropbox general; *ARCA* los de la carpeta `/AFIP`, que es donde van los del organismo.', '**Configuración**: qué carpetas se vigilan y cada cuánto corre el escaneo se define en Configuración → **Dropbox** (también se llega con *Configurar transición automática*). Si acá no aparece nada, lo primero para revisar es que la conexión esté activa.', '**Firmas**: los avisos de envío a firmar llegan por correo y se configuran aparte, en Configuración → **DropboxSign**.'],

      // Ficha de empresa — Información
      'empresaFicha.title': 'Ficha de la empleadora',
      'empresaFicha.description': 'Los datos de esta empresa como EMPLEADORA: lo que va en sus contratos y lo que ARCA exige para darle altas.',
      'empresaFicha.items': ['**ARCA**: dice si esta empleadora puede dar altas hoy. Son cuatro requisitos —convenios, domicilios, obras sociales y CUIT— y el badge los cuenta; clickealo para ver cuáles faltan e ir a resolverlos.', '**Todo se lleva por CUIT**: las obras sociales, los convenios y los domicilios que ARCA acepta son los que ESTE CUIT tiene registrados en su padrón. Lo que declaró otra empresa no sirve acá.', '**Los datos se editan en el ABM**: razón social, domicilio, firmante y representante se cambian en Configuración → Empresas, con el botón de arriba. Acá se consultan.', '**Membrete**: el logo y la firma que encabezan los contratos generados con esta empleadora.'],

      // Ficha de empresa — Obras Sociales
      'empresaObrasSociales.title': 'Obras sociales de esta empleadora',
      'empresaObrasSociales.description': 'Las que este CUIT tiene registradas ante ARCA. El organismo solo acepta altas con una de ellas.',
      'empresaObrasSociales.items': ['**Es un subconjunto**: el catálogo tiene 494 obras sociales y cada empleadora declara las suyas. Una que no esté acá hace que ARCA rechace el alta.', '**El listado real sale del padrón**: en ARCA, logueado con este CUIT, Datos del Empleador → Obras Sociales. Acá se refleja cuáles son; hay que repetirlo con cada empleadora.', '**La obra social de cada persona NO se elige acá**: la define su convenio. Lo único que se decide en esta pantalla es la de los **excluidos de convenio (9999/99)**, que no tienen sindicato del que heredarla.', '**Orden en que se resuelve**: la propia de la persona → la del convenio de su categoría → para los excluidos de convenio, la de esta pantalla. Si ninguna resuelve, el dato falta y el contrato no entra en el TXT: no hay una global que lo tape.', '**Cuáles tiene registradas se decide en el nomenclador**: en Configuración → ARCA → Obras Sociales, abriendo la obra social y marcando las empresas. Así se registra una en varias empleadoras sin entrar a cada ficha. Acá solo se decide la de los excluidos.'],

      // Ficha de empresa — Convenios
      'empresaConvenios.title': 'Convenios de esta empleadora',
      'empresaConvenios.description': 'Los Convenios que este CUIT registró ante ARCA.',
      'empresaConvenios.items': ['**Definen qué categorías se pueden dar de alta**: ARCA solo ofrece las de los convenios registrados por este CUIT. Sin convenio no hay categoría posible y el alta no se puede generar.', '**La obra social viene del convenio**: la define el sindicato, y al sindicato lo define el CCT. Se carga una sola vez en Configuración → ARCA → Convenios y vale para todas las empresas.', '**Cuáles tiene registrados se decide en el nomenclador**: en Configuración → ARCA → Convenios, abriendo el convenio y marcando las empresas. Así se registra uno en varias empleadoras sin entrar a cada ficha.', '**Acá se elige el habitual**: la ★ marca cuál se ofrece primero al cargar un contrato. Es una sugerencia, no un candado, y pisa al de la instalación.', '**Si se le quita un convenio que era el habitual**, su ★ se borra sola: sugerir uno que la empleadora ya no tiene registrado es sugerir un alta que ARCA rechaza.'],

      // Ficha de empresa — Domicilios
      'empresaDomicilios.title': 'Domicilios de explotación',
      'empresaDomicilios.description': 'Los domicilios donde esta empleadora declara que se presta el servicio.',
      'empresaDomicilios.items': ['**El alta declara UNO**: cada contrato informa un domicilio y UNA de sus actividades. Sin domicilios registrados no hay dónde declarar el trabajo.', '**El código es por CUIT**: el mismo domicilio declarado por dos empleadoras son dos sucursales distintas, con códigos distintos. Salen del padrón de cada una.', '**Actividades**: si la sucursal declara una sola, el contrato la hereda; con varias, el contrato elige cuál informa. Una sucursal sin actividades no puede generar altas.', '**No son las Sedes**: las Sedes son los lugares de trabajo con los que opera el sistema. Estas son entidades del padrón de ARCA y se cargan por separado, en Configuración → ARCA → Domicilios de Explotación.', '**Cuáles tiene asignados se decide en el nomenclador**: en Configuración → ARCA → Domicilios de Explotación, abriendo el domicilio y marcando las empresas. Lo que SÍ se edita acá son las actividades: ARCA las declara por CUIT, y dos empleadoras en el mismo domicilio pueden tener distintas.'],

      // Ficha de empresa — Categorías
      'empresaCategorias.title': 'Categorías disponibles',
      'empresaCategorias.description': 'Las categorías profesionales que esta empleadora le puede dar de alta a alguien.',
      'empresaCategorias.items': ['**No se configuran acá, se calculan**: son las de los convenios que esta empleadora registró. Se elige el convenio y las categorías vienen con él.', '**Para cambiar esta lista**: registrá o quitá convenios en la pantalla de Convenios de esta misma ficha.', '**Para editar las escalas**: Configuración → ARCA → Categorías. La escala salarial es del CCT y la comparten todas las empresas, no es de esta empleadora.', '**Estructura**: Convenio → Grupo (la escala) → Categoría, con su código de 6 dígitos, que es el que viaja al TXT.'],

      // Ficha de empresa — Defaults
      'empresaGruposTipoServicio.title': 'Grupo de Tipo de Servicio habitual',
      'empresaGruposTipoServicio.description': 'El grupo que esta empleadora usa casi siempre, para que elegir el tipo de servicio no sea elegir a ciegas.',
      'empresaGruposTipoServicio.items': ['**Primero el grupo, después el tipo**: ARCA divide los tipos de servicio en dos grupos, y en Simplificación Registral se elige en ese orden.', '**Es una sugerencia, no un candado**: el grupo marcado aparece primero en el alta y el otro se sigue pudiendo elegir.', '**El grupo NO viaja en el TXT**: lo que viaja es el tipo de servicio (posiciones 107-109). El grupo existe para que elegir entre 293 tipos no sea elegir a ciegas.', '**Los dos grupos son del nomenclador de ARCA**: iguales para todas las empleadoras, no se agregan ni se editan acá.'],
      'empresaDefaults.title': 'Valores por defecto de ARCA',
      'empresaDefaults.description': 'La elección habitual de esta empleadora dentro del nomenclador, para no repetirla en cada alta. Se marca con ★ sobre la lista, y se guarda con el click.',
      'empresaDefaults.items': ['**Se marca donde está el dato**: antes eran tres combos en una pantalla «Defaults». Ahora cada código se marca con ★ sobre su propio nomenclador, viendo los códigos y los nombres repetidos —en Tipos de Servicio hay 49 que se repiten entre los dos grupos—.', '**El orden en que se resuelve**: el contrato → el tipo de contrato → esta empleadora → la instalación. Gana el primero que tenga algo cargado; un escalón vacío no decide, pasa al siguiente.', '**Pisa lo global, y se avisa**: arriba de cada lista se dice qué marcó la instalación y si lo que hay acá lo está tapando. Sin marca propia, esta empleadora hereda —y sigue heredando si allá cambia—.', '**No pisan al contrato**: si el Tipo de Contrato trae su propio código, manda el del contrato. Estos son el valor de arranque, no una regla.', '**Los códigos son universales**: se administran en Configuración → ARCA. Acá solo se elige cuál usa esta empleadora.'],

      // Ficha de empresa — Contratos
      'empresaContratos.title': 'Contratos de esta empleadora',
      'empresaContratos.description': 'Los contratos firmados por esta empresa, en cualquier proyecto y de cualquier cliente.',
      'empresaContratos.items': ['**El corte es por empleadora**: un mismo proyecto puede tener contratos de dos empresas distintas, así que acá aparecen solo los de esta.', '**Datos ARCA**: cada contrato necesita su categoría, domicilio, actividad y obra social para poder generar el TXT de alta. Lo que falta se marca en la fila.', '**El TXT es por CUIT**: un archivo mezcla contratos de dos empleadoras es rechazado por el organismo, así que la generación se hace desde acá o filtrando por empresa.', '**La versión global**: en Admin GENERAL → Contratos están los de todas las empleadoras juntos.'],

      // Convenios (y de dónde sale la obra social de cada persona)
      'convenios.title': 'Convenios y obras sociales',
      'convenios.description': 'El convenio define el sindicato, y el sindicato define la obra social de quien trabaja bajo él. Por eso la obra social se carga acá y no en cada empresa.',
      'convenios.items': ['**La obra social la define el convenio, no la empleadora**: quien trabaja bajo el CCT de televisión aporta a la O.S. del Personal de Televisión, la contrate la productora que la contrate. Se carga en la columna **Obra social**, con el ✎ de la fila.', '**Este dato no viene de ARCA**: el nomenclador oficial trae el código y la actividad, nada más. El sindicato signatario y su obra social se cargan a mano, una sola vez, y valen para todas las empresas.', '**Qué obra social termina en el TXT de alta**: se toma la primera de esta lista que exista — (1) la propia de la persona; (2) la excepción que una empleadora haya puesto para ese convenio; (3) **la del convenio**, que es el caso normal; (4) solo para *9999/99*, la obra social de excluidos de esa empleadora. Si ninguna resuelve, el dato FALTA y el contrato no entra en el TXT.', '**9999/99 — EXCLUIDO DE CONVENIO no tiene sindicato**: es el único caso en que la obra social la elige la empresa, en su ficha → Obras Sociales. Su celda vacía acá no es un dato faltante.', '**Las excepciones no se cargan acá**: viven en la ficha de cada empleadora (Empresa → Convenios), porque son de esa empresa y no del convenio. Cuando existe, la tabla la marca como *pisada por esta empresa*.', '**El filtro de arriba**: el nomenclador tiene 2.669 convenios y solo se trabaja con los que alguna empresa registró ante ARCA. La columna **Empresas** dice cuántas: hacé click en el número para ver cuáles.'],

      // Actividades (diccionario, NO la lista de lo que se puede declarar)
      'arcaActividades.title': 'Actividades',
      'arcaActividades.description': 'Diccionario de actividades económicas del nomenclador de ARCA.',
      'arcaActividades.items': ['**Para qué sirve**: para no tipear el código a mano al cargar una actividad en un domicilio, y para que la descripción salga siempre idéntica. Es lo que evita tener la misma actividad escrita de dos formas distintas en dos sucursales.', '**Para qué NO sirve**: no define lo que un contrato puede declarar. Eso lo define, y solamente, lo que ARCA tiene declarado para ese domicilio de explotación: un código válido en otra sucursal es rechazado por el organismo.', '**Se llena solo**: cada vez que se importa el padrón en Domicilios de Explotación, los códigos que no existían se dan de alta acá. Así el diccionario termina teniendo exactamente las actividades en uso, y todas correctas, porque vienen del export de ARCA.', '**Sembrar el nomenclador completo es opcional**: se puede importar el listado entero (~2.350 códigos) con **Importar Excel**, pero no hace falta para operar.', '**El código son 6 dígitos** con ceros a la izquierda: es lo que va en las posiciones 79-84 del TXT de alta.'],

      // Sucursales de ARCA
      'arcaSucursales.title': 'Domicilios de Explotación',
      'arcaSucursales.description': 'Domicilios de desempeño del padrón de ARCA (Simplificación Registral).',
      'arcaSucursales.items': ['**Qué es**: el domicilio donde la persona presta servicios, según el padrón de ARCA. Su **código** de 5 dígitos va en las posiciones 74-78 del TXT de alta.', '**Actividades**: cada domicilio declara una o más (pos. 79-84). Con una sola, el contrato la hereda; con varias, elige cuál declara. Se cargan adentro del domicilio y no de un catálogo global: ARCA solo acepta las declaradas para ese domicilio, y un código válido en otro sería rechazado acá.', '**Por CUIT**: el código sale del padrón de cada empleadora, así que el mismo domicilio declarado por dos empresas son dos registros distintos.', '**No es una Sede**: las Sedes son los lugares de trabajo con los que opera el sistema. Esto es el padrón de ARCA, y se carga por separado.', '**Uso**: se asignan a cada empresa en Configuración → Empresas, y cada contrato elige una de las de su empleadora.'],

      // Tablas oficiales de ARCA (Simplificación Registral)
      'arcaModalidadContratacion.title': 'Información de Modalidades de Contrato',
      'arcaModalidadContratacion.description': 'Tabla oficial de ARCA: con qué modalidad se declara la relación laboral en el alta.',
      'arcaModalidadContratacion.items': ['**Qué es**: El código de 3 dígitos que va en las posiciones 17-19 del TXT de alta masiva. Ej.: *008* tiempo completo indeterminado, *022* plazo fijo a tiempo completo.', '**Dónde se usa**: Se asigna por Tipo de Contrato, en Configuración → Contratos. Un "Plazo fijo 5x7" se declara con la modalidad 022.', '**Ojo con la fecha de fin**: Las modalidades a plazo determinado (021, 022, 012) exigen fecha de fin en el alta. Sin ella, ARCA rechaza el registro.', '**Origen**: Se siembra desde el nomenclador de ARCA y solo hace falta tocarla si el organismo la actualiza.'],

      // Tipos de servicio (ARCA)
      'arcaTipoServicio.title': 'Información de Tipos de Servicio',
      'arcaTipoServicio.description': 'Tabla oficial de ARCA: clasificación del servicio prestado por la persona.',
      'arcaTipoServicio.items': ['**Qué es**: El código de 3 dígitos que va en las posiciones 107-109 del TXT de alta masiva.', '**Valor habitual**: *000 — Servicios comunes continuos*. El resto son regímenes especiales (tareas insalubres, aeronavegantes, docentes, etc.) con cómputo jubilatorio distinto.', '**Ojo: hay nombres repetidos**. De los 293, hay 49 nombres que aparecen dos veces (98 registros): *TAREAS INSALUBRES* es 006 y también 506. Lo que los separa es el **Grupo**: los continuos y los discontinuos tienen listas espejadas.', '**Por eso el código siempre está a la vista**: en dos casos —114/115 y 248/249— ni el grupo alcanza para distinguirlos, así que el código es lo único que los identifica.', '**Dónde se usa**: Se asigna por Tipo de Contrato, en Configuración → Contratos, eligiendo primero el grupo.', '**Origen**: Se siembra desde el nomenclador de ARCA y solo hace falta tocarla si el organismo la actualiza.'],

      // Grupos de tipo de servicio (ARCA, tabla l_GTS)
      'arcaGrupoTipoServicio.title': 'Información de Grupos de Tipo de Servicio',
      'arcaGrupoTipoServicio.description': 'Tabla oficial de ARCA: separa los tipos de servicio continuos de los discontinuos.',
      'arcaGrupoTipoServicio.items': ['**Son dos**: *1 — Continuos* y *2 — Discontinuos*. ARCA no tiene más.', '**No va al TXT**: no ocupa ninguna de las 130 posiciones del registro de alta. Existe solo para filtrar el selector de Tipo de Servicio.', '**Para qué sirve entonces**: el catálogo de Tipos de Servicio tiene 49 nombres repetidos —el mismo texto con dos códigos distintos, uno por grupo—. Sin elegir el grupo primero, las dos filas se ven idénticas y es un 50% de chance de escribir el código equivocado.', '**Cómo se clasifican**: los códigos de 500 en adelante son discontinuos; el resto, continuos. Lo dice el propio nomenclador: *000 Servicios comunes continuos* / *500 Servicios comunes discontinuos*.', '**No hace falta tocarla**: son dos registros que ARCA no cambia.'],

      // Fuentes de paritarias (vigilancia de acuerdos salariales)
      'fuentesParitaria.title': 'Cómo funciona la vigilancia de paritarias',
      'fuentesParitaria.description': 'Cada fuente es una página de un sindicato. Una vez por día —para toda la plataforma, no por empresa— se mira qué PDF hay ahí y se avisa si apareció uno nuevo.',
      'fuentesParitaria.items': ['**Solo avisa, no carga nada**: el sistema no abre los PDF ni lee los importes. Deja el enlace y listo. La escala se sigue cargando a mano, con el botón *Paritaria* del convenio.', '**Una fuente, varios convenios**: un solo acuerdo del SATSAID cubre 0131/75 y 0634/11 a la vez, y la Asociación de Actores publica en dos páginas distintas que alimentan convenios distintos. Por eso los convenios se tildan acá y no al revés.', '**La URL es la del LISTADO**, no la del PDF: lo que se vigila es qué aparece en esa página.', '**Los dos patrones**: *incluir* dice cuáles de los PDF de la página son una escala; *excluir* saca los que no lo son aunque matcheen. Se prueban contra el texto del enlace y contra el nombre del archivo, porque según la página el dato útil está en uno o en el otro.', '**El de excluir no es opcional**: al lado de los acuerdos suele colgar el texto del convenio colectivo, protocolos y subsidios. Si entran, el sistema avisa de una novedad que no existe — y a la segunda vez nadie le cree.', '**La primera revisión no avisa de nada**: registra todo lo que encuentra como *ya visto* y ahí queda la línea de base. Sin eso, dar de alta el SATSAID gritaría treinta acuerdos viejos. De la segunda revisión en adelante, lo que aparece sí es novedad.', '**Cero enlaces es un ERROR, no *sin novedades***: si una página venía devolviendo acuerdos y de golpe no devuelve ninguno, cambió de estructura o el patrón dejó de servir. Queda en rojo, porque una fuente ciega es peor que una novedad sin leer: puede haber salido algo y nadie se enteró.', '**Revisar ahora hace exactamente lo mismo que la rutina diaria**, solo que a pedido. No hay dos caminos: es el mismo código con otro disparador.', '**El catálogo y la vigilancia son dos cosas**: *dónde publica sus acuerdos* un convenio es una propiedad suya —vale para cualquier empresa de la plataforma, hoy y en tres años— y anotarlo no cuesta nada. *Que esa página se baje todos los días* es la decisión operativa, y es el tilde **Activa** de acá.', '**Dos niveles que se complementan**: la web del gremio publica el acuerdo apenas lo firma —es la alerta temprana— y el buscador oficial del Ministerio publica la homologación meses después —es el respaldo—. Un convenio puede tener las dos: la del gremio avisa, la oficial confirma.', '**Página de listado o consulta manual**: la primera se raspa todos los días; la segunda solo deja anotado dónde mirar. El buscador oficial va como *manual* porque es un formulario, no un listado: cargarlo como listado lo dejaría en «sin enlaces» para siempre, gritando un error que no existe.', '**Se revisa una vez por día para toda la plataforma**, no una vez por empresa: la página se baja una sola vez y la publicación se guarda una sola vez. Lo que cambia por empresa es a quién se le muestra el aviso — cada una ve solo lo de los convenios que tiene registrados.', '**Cambiar un patrón reinicia la línea de base**: los patrones definen qué se considera una escala en esa página, así que lo que estaba dado por visto se calculó con la definición anterior. Al guardar, la próxima revisión vuelve a registrar todo como ya visto — y se avisa en el momento.', '**En Convenios se ve el estado de cada uno**: *con fuente* (y de qué entidad), *sin revisar* (nadie buscó todavía), *sin fuente conocida* (se buscó y no hay, con quién y cuándo) o *no aplica* (*9999/99 Excluido de convenio* no tiene sindicato). Ninguno de los grises es un error.', '**Anotar que se buscó y no hay nada vale tanto como encontrarla**: es lo único que distingue *nadie miró* de *ya miramos*, y lo que evita que la próxima persona repita la búsqueda entera.'],

      // Modalidades de liquidación (ARCA)
      'arcaModalidadLiquidacion.title': 'Información de Modalidades de Liquidación',
      'arcaModalidadLiquidacion.description': 'Tabla oficial de ARCA: cada cuánto se liquida la retribución pactada.',
      'arcaModalidadLiquidacion.items': ['**Qué es**: El código de 1 dígito que va en la posición 73 del TXT de alta masiva.', '**Son ocho**: 1 mes · 2 quincena · 3 semana · 4 día · 5 hora · 6 pieza · 7 a comisión · 8 jornal.', '**Dónde se usa**: Se asigna por Tipo de Contrato, en Configuración → Contratos.', '**Origen**: Se siembra desde el nomenclador de ARCA y solo hace falta tocarla si el organismo la actualiza.'],

      // Pedidos (Configuración / tipos de pedido)
      'orderTypes.title': 'Información de Pedidos',
      'orderTypes.description': 'Configuración de los tipos de pedido disponibles en el sistema.',
      'orderTypes.items': ['**Tipo de pedido**: Categoría de solicitud que el personal puede generar.', '**Configuración**: Definí los tipos habilitados y sus parámetros.', '**Gestión**: Crear, editar y eliminar tipos de pedido.'],

      // Releases
      'releases.title': 'Información de Releases',
      'releases.description': 'Documentos de release / cesión de derechos usados en los proyectos.',
      'releases.items': ['**Release**: Documento de cesión de derechos o autorización asociado a un contrato o proyecto.', '**Uso**: Respalda la cesión de titularidad de la obra por parte del personal.', "**Membrete y firma**: Con la opción 'Membrete con datos de la empresa y firma' activada, el release se genera con el encabezado (logo + razón social, CUIT y domicilio) y la firma de la empresa. La empresa se elige al descargar (de las asignadas al proyecto). El membrete se carga en Empresa/s | Membrete/s y firma; sin membrete cargado, esta opción no se puede activar.", '**Gestión**: Crear, editar y eliminar releases.'],

      // Empresa/s | Membrete/s y firma
      'membretes.title': 'Información de Membrete/s y firma',
      'membretes.description': 'El membrete es el logo y la firma de una empresa que encabezan y firman los documentos (contratos, releases y pedidos/vacaciones).',
      'membretes.items': ['**Qué es**: El membrete de una empresa = su logo + su firma (más la aclaración y el cargo del firmante). Es lo que aparece como encabezado y pie de firma en los PDF.', '**Empresa**: Se elige del ABM de Empresas; sus datos (razón social, CUIT, domicilio) se editan ahí. Acá se le cargan el logo y la firma.', "**Uso en las plantillas**: En cada plantilla (Contratos, Releases, Pedidos/Vacaciones) el check 'Membrete con datos de la empresa y firma' solo se puede activar si existe al menos un membrete cargado.", '**Contratos y Releases**: La empresa del membrete se elige al descargar el documento, entre las asignadas al proyecto.', '**Pedidos/Vacaciones**: Como esos PDF no están atados a un proyecto, usan la primera empresa que tenga membrete cargado.', '**Gestión**: Crear, editar y eliminar el membrete de cada empresa (eliminar solo quita el logo/firma; la empresa sigue en el ABM).'],

      // Importación de Usuarios WP
      'importUsersWp.title': 'Información de Importación de Usuarios WP',
      'importUsersWp.description': 'Herramienta para importar usuarios desde WeProdu (WP).',
      'importUsersWp.items': ['**Importación**: Trae usuarios desde el sistema WP y los da de alta en el tenant.', '**Mapeo**: Asocia los datos de origen con los campos de usuario (email, documento, roles).', '**Proceso**: Revisá el resultado de la importación y corregí los registros con error.'],
    },
    // Agregar dentro de helpResources.es.help

    futureActionType: {
      title: 'Tipo de Acción Futura',
      size: 'md',
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
  // Había un bloque `en` con UNA sola pantalla traducida (Pedidos). Nunca se leyó: `buildHelpContent`
  // tiene el idioma fijo en "es". No era un andamio de i18n, era un resto — cuando haga falta
  // traducir, el trabajo es el mismo empezando de cero.
};

// Función para procesar markdown simple
const processMarkdown = (text: string): React.ReactNode => {
  const parts = text.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('***') && part.endsWith('***')) {
      return (
        <span key={index} className="font-semibold">
          {part.slice(3, -3)}
        </span>
      );
    } else if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <span key={index} className="font-bold">
          {part.slice(2, -2)}
        </span>
      );
    } else if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
};

// Construct help content
const buildHelpContent = (key: HelpKey): React.ReactNode => {
  const help = helpResources.es.help as Record<string, unknown>;

  const title = help[`${key}.title`] as string | undefined;
  const description = help[`${key}.description`] as string | undefined;
  const items = help[`${key}.items`] as string[] | undefined;

  if (!title || !items) {
    return <div className="text-sm text-gray-500">Información no disponible</div>;
  }

  return (
    <div className="space-y-4 text-sm">
      {description && <p className="text-gray-600 dark:text-gray-400 italic">{processMarkdown(description)}</p>}

      <ul className="space-y-3">
        {items.map((item: string, index: number) => (
          <li key={index} className="flex items-start space-x-2">
            <span className="w-1.5 h-1.5 bg-primary-600 rounded mt-2 flex-shrink-0"></span>
            <span className="text-gray-700 dark:text-gray-300 leading-relaxed">{processMarkdown(item)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// Contenido compilado
const HELP_CONTENT: Record<HelpKey, HelpEntry> = {
  fichas: { title: 'Fichas', size: 'sm', content: buildHelpContent('fichas') },
  clients: { title: 'Información de Clientes', size: 'sm', content: buildHelpContent('clients') },
  tenants: { title: 'Información de Tenants', size: 'sm', content: buildHelpContent('tenants') },
  users: { title: 'Información de Usuarios', size: 'sm', content: buildHelpContent('users') },
  roles: { title: 'Información de Roles', size: 'sm', content: buildHelpContent('roles') },
  clientDetail: { title: 'Información de Cliente', size: 'sm', content: buildHelpContent('clientDetail') },
  clientProjects: { title: 'Proyectos del Cliente', size: 'sm', content: buildHelpContent('clientProjects') },

  // Nuevas entradas para Proyectos, Sedes y Contratos
  projects: { title: 'Gestión de Proyectos', size: 'sm', content: buildHelpContent('projects') },
  sedes: { title: 'Gestión de Sedes', size: 'sm', content: buildHelpContent('sedes') },
  contracts: { title: 'Gestión de Contratos', size: 'sm', content: buildHelpContent('contracts') },
  solicitudes: { title: 'Solicitudes de Contratación', size: 'sm', content: buildHelpContent('solicitudes') },
  membretes: { title: 'Información de Membrete/s y firma', size: 'sm', content: buildHelpContent('membretes') },

  orders: {
    title: 'Gestión de Pedidos',
    size: 'sm',
    content: buildHelpContent('orders'),
  },

  orderCategories: {
    title: 'Guía de Tipos de Pedidos',
    size: 'lg',
    content: buildHelpContent('orderCategories'),
  },

  positions: {
    title: 'Información de Cargos',
    size: 'sm',
    content: buildHelpContent('positions'),
  },

  levels: {
    title: 'Información de Niveles',
    size: 'sm',
    content: buildHelpContent('levels'),
  },
  pdfTemplates: {
    title: 'Plantillas | Pedidos | Vacaciones',
    size: 'sm',
    content: buildHelpContent('pdfTemplates'),
  },
  vacations: {
    title: 'Gestión de Vacaciones',
    size: 'sm',
    content: buildHelpContent('vacations'),
  },
  vacationsRules: {
    title: 'Configuración de Vacaciones',
    size: 'sm',
    content: buildHelpContent('vacationsRules'),
  },
  activityLogs: {
    title: 'Registro de Novedades',
    size: 'sm',
    content: buildHelpContent('activityLogs'),
  },
  projectTeam: {
    title: 'Gestión de Equipo',
    size: 'sm',
    content: buildHelpContent('projectTeam'),
  },

  categoriasSat: { title: 'Información de Categorías', size: 'sm', content: buildHelpContent('categoriasSat') },
  centrosCosto: { title: 'Información de Centros de Costos', size: 'sm', content: buildHelpContent('centrosCosto') },
  contratosFrame: { title: 'Información de Contratos', size: 'sm', content: buildHelpContent('contratosFrame') },
  empresas: { title: 'Información de Empresas', size: 'sm', content: buildHelpContent('empresas') },
  bancos: { title: 'Información de Entidades Financieras', size: 'sm', content: buildHelpContent('bancos') },
  paisesResidencia: { title: 'Información de Países de residencia', size: 'sm', content: buildHelpContent('paisesResidencia') },
  holidays: { title: 'Información de Feriados', size: 'sm', content: buildHelpContent('holidays') },
  funcionesFrame: { title: 'Información de Roles Empresa', size: 'sm', content: buildHelpContent('funcionesFrame') },
  miPerfil: { title: 'Información de Mi Perfil', size: 'sm', content: buildHelpContent('miPerfil') },
  requestsConfig: { title: 'Configuración de Novedades', size: 'sm', content: buildHelpContent('requestsConfig') },
  obrasSociales: { title: 'Información de Obras Sociales', size: 'md', content: buildHelpContent('obrasSociales') },
  convenios: { title: 'Convenios y obras sociales', size: 'lg', content: buildHelpContent('convenios') },
  areas: { title: 'Información de Áreas', size: 'sm', content: buildHelpContent('areas') },
  documents: { title: 'Información de Documentos', size: 'md', content: buildHelpContent('documents') },
  // Ficha de empresa: una entrada por pantalla. Todas hablan del mismo CUIT, pero lo que se decide
  // en cada una es distinto y mezclarlas fue justamente lo que hizo falta desarmar.
  empresaFicha: { title: 'Ficha de la empleadora', size: 'md', content: buildHelpContent('empresaFicha') },
  empresaObrasSociales: { title: 'Obras sociales de esta empleadora', size: 'lg', content: buildHelpContent('empresaObrasSociales') },
  empresaConvenios: { title: 'Convenios de esta empleadora', size: 'lg', content: buildHelpContent('empresaConvenios') },
  empresaDomicilios: { title: 'Domicilios de explotación', size: 'md', content: buildHelpContent('empresaDomicilios') },
  empresaCategorias: { title: 'Categorías disponibles', size: 'md', content: buildHelpContent('empresaCategorias') },
  empresaDefaults: { title: 'Valores por defecto de ARCA', size: 'md', content: buildHelpContent('empresaDefaults') },
  empresaGruposTipoServicio: { title: 'Grupo de Tipo de Servicio habitual', size: 'md', content: buildHelpContent('empresaGruposTipoServicio') },
  empresaContratos: { title: 'Contratos de esta empleadora', size: 'md', content: buildHelpContent('empresaContratos') },
  arcaSucursales: { title: 'Domicilios de Explotación', size: 'md', content: buildHelpContent('arcaSucursales') },
  arcaActividades: { title: 'Actividades', size: 'md', content: buildHelpContent('arcaActividades') },
  arcaModalidadContratacion: { title: 'Modalidades de Contrato (ARCA)', size: 'md', content: buildHelpContent('arcaModalidadContratacion') },
  arcaTipoServicio: { title: 'Tipos de Servicio (ARCA)', size: 'md', content: buildHelpContent('arcaTipoServicio') },
  arcaGrupoTipoServicio: { title: 'Grupos de Tipo de Servicio (ARCA)', size: 'md', content: buildHelpContent('arcaGrupoTipoServicio') },
  arcaModalidadLiquidacion: { title: 'Modalidades de Liquidación (ARCA)', size: 'md', content: buildHelpContent('arcaModalidadLiquidacion') },
  orderTypes: { title: 'Información de Pedidos', size: 'sm', content: buildHelpContent('orderTypes') },
  releases: { title: 'Información de Releases', size: 'sm', content: buildHelpContent('releases') },
  importUsersWp: { title: 'Importación de Usuarios WP', size: 'sm', content: buildHelpContent('importUsersWp') },
  fuentesParitaria: { title: 'Vigilancia de paritarias', size: 'lg', content: buildHelpContent('fuentesParitaria') },
};

export function getHelp(key: HelpKey): HelpEntry {
  return HELP_CONTENT[key];
}

export function hasHelp(key: HelpKey): boolean {
  return Boolean(HELP_CONTENT[key]);
}
