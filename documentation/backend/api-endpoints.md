# API Endpoints (Backend) - Weprodu

La API está versionada bajo el prefijo `/api/v1`. Utiliza autenticación basada en JWT y validación de Tenant vía `X-Tenant-Id` o por usuario logueado.

## Módulos Principales

### 1. Autenticación y Perfil (`/auth`, `/profile`)
- `POST /auth/login`: Inicio de sesión y generación de token.
- `GET /auth/me`: Perfil del usuario actual.
- `PATCH /profile`: Actualización de datos personales y configuración.

### 2. Gestión de Recursos Humanos (`/users`, `/vacations`, `/hr-admin`)
- `/users`: CRUD de empleados, asignación de roles y clientes.
- `/vacations`: Solicitudes, aprobaciones y calendario de licencias.
- `/hr-admin`: Configuraciones globales de RRHH, cierres de año.

### 3. Proyectos y Clientes (`/projects`, `/clients`, `/areas`, `/shifts`)
- `/projects`: Gestión de proyectos, asignación de equipos y presupuestos.
- `/clients`: Directorio de clientes y activos relacionados.
- `/areas` y `/shifts`: Configuración de turnos y áreas de trabajo por proyecto.

### 4. Operaciones y Finanzas (`/orders`, `/pdf-config`, `/activity-reports`)
- `/orders`: Ciclo de vida de órdenes de trabajo.
- `/pdf-config`: Plantillas y generación de documentos PDF dinámicos.
- `/activity-reports`: Reportes de actividad y horas cargadas por el personal.

---

## Seguridad y Middleware
- **JwtAuthGuard**: Protege las rutas requiriendo un token válido.
- **TenantMiddleware**: Asegura que el usuario solo acceda a datos de su organización.
- **ErrorHandler**: Centraliza la captura de errores y logs.
