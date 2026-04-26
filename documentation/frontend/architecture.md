# Arquitectura Frontend - Weprodu

El frontend está construido con **React** y **TypeScript**, utilizando **Vite** como herramienta de construcción y **Tailwind CSS** para los estilos.

## Stack Tecnológico

- **Framework**: React 18+.
- **Routing**: React Router DOM (v6).
- **Estado Global**: Zustand (usado en `authStore` y `themeStore`).
- **Estilos**: Tailwind CSS con soporte para modo oscuro nativo.
- **Iconos**: Lucide React / Heroicons.
- **Formularios**: React Hook Form con validaciones personalizadas.

## Organización de la Aplicación

### 1. App Shell (`App.tsx`)
El componente principal define la estructura de navegación y los layouts:
- **PublicLayout**: Para Login y Registro (sin barra de navegación).
- **AppLayout**: Envuelve las rutas protegidas e incluye la `MobileNavbar`.
- **ProtectedRoute**: Middleware de frontend que redirige al login si no hay sesión activa.

### 2. Módulos Principales

La aplicación se organiza en varios módulos accesibles desde la navegación:

- **Dashboard**: Redirección inteligente basada en el rol del usuario.
- **Gestión de Personal (`/users`)**: Listado de empleados con filtros avanzados y gestión de legajos.
- **Proyectos (`/projects`)**: Seguimiento de proyectos, presupuestos y asignación de equipos.
- **Clientes (`/clients`)**: Base de datos de clientes y sus proyectos asociados.
- **Recursos Humanos (`/vacations`, `/requests`)**: Gestión de licencias, calendarios y reportes de actividad.

### 3. Aplicación Mobile
Existe una versión optimizada para móviles cargada mediante **Lazy Loading** en la ruta `/mobile/*`. Esto permite separar la lógica de la versión de escritorio de la experiencia mobile más simplificada.

## Integración con la API
- Las llamadas a la API se centralizan en la carpeta `src/api` o mediante servicios específicos.
- Se utiliza la variable de entorno `VITE_API_URL` para configurar el endpoint del backend.
- Se envía el `X-Tenant-Id` en las cabeceras para soportar la arquitectura multi-inquilino.
