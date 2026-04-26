# Páginas y Componentes (Frontend) - Weprodu

La interfaz está diseñada para ser densa en información pero clara, utilizando tablas dinámicas, modales de edición y estados visuales claros.

## Páginas Clave

### 1. Gestión de Usuarios (`UsersPage.tsx`)
Es la página más compleja del sistema.
- **Funcionalidad**: Visualización de empleados en formato lista o tarjetas.
- **Acciones**: Crear usuario, editar legajo, asignar a proyectos/clientes, gestionar roles.
- **Filtros**: Por área, puesto, antigüedad o estado activo/inactivo.

### 2. Panel de Proyectos (`ProjectsPage.tsx` y `ProjectDetailPage.tsx`)
- **ProjectsPage**: Vista global de todos los proyectos activos.
- **ProjectDetailPage**: Detalle de un proyecto específico, incluyendo objetivos, cronograma y configuración de equipo.
- **ProjectTeamPage**: Gestión granular de quiénes participan en el proyecto, sus turnos y sus horarios específicos.

### 3. Sistema de Vacaciones (`VacationsPage.tsx`)
- **Vista de Usuario**: Permite solicitar días de licencia.
- **Vista de Administrador**: Aprobación o rechazo de solicitudes.
- **Calendario**: Vista mensual/anual de licencias aprobadas para evitar solapamientos de equipo.

### 4. Gestión de Órdenes (`OrdersPage.tsx`)
Módulo financiero/administrativo para la carga y seguimiento de órdenes de trabajo o pedidos relacionados con los proyectos.

---

## Componentes Reutilizables

### 1. Sistema de Modales (`/components/modals`)
Se utilizan modales para casi todas las operaciones de creación y edición para evitar navegaciones innecesarias.
- **BaseModal**: Estructura común con header, body y footer.
- **ConfirmModal**: Para acciones destructivas (borrar, desactivar).

### 2. Tablas y Listados (`/components/ui`)
- Tablas con scroll horizontal para dispositivos móviles.
- Estados de carga (`LoadingSpinner`) y estados vacíos.

### 3. Navegación (`/components/Navbar`)
- **MobileNavbar**: Barra inferior o lateral (según el dispositivo) que da acceso rápido a los módulos principales (Inicio, Usuarios, Proyectos, Más).
