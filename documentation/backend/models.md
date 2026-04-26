# Modelos y Schemas (Backend) - Weprodu

El backend utiliza MongoDB con Mongoose. La arquitectura es Multi-inquilino (Multi-tenant), donde cada documento está asociado a un `tenantId`.

## Modelos Principales

### 1. Usuario (`User.ts`)
Gestiona la identidad y los beneficios del personal.
- **Campos Clave**: `email`, `password`, `roles`, `tenantId`, `hireDate`, `metadata`.
- **Lógica de Vacaciones**: Calcula automáticamente los días de vacaciones según la LCT (Ley de Contrato de Trabajo) argentina, basándose en la `hireDate`.
- **Virtuals**: `seniorityAtEndOfYear`, `vacationDays`.

### 2. Proyecto (`Project.ts`)
Define las unidades de trabajo y su configuración específica.
- **Estructura**: `name`, `clientId`, `status`, `assignedUsers`.
- **Configuración de Equipo**: `teamConfig` define quién puede registrar novedades.
- **Horarios**: `workSchedule` permite definir horarios por día o fijos por semana.
- **Coordinación**: `coordinatorAssignments` vincula coordinadores con áreas y turnos.

### 3. Cliente (`Client.ts`)
Representa a las organizaciones externas que contratan proyectos.
- **Campos**: `name`, `slug`, `externalId`.
- **Relación**: Un cliente puede tener múltiples proyectos.

### 4. Solicitud de Vacaciones (`Vacation.ts`)
Gestiona el ciclo de vida de los pedidos de licencia.
- **Estados**: `pending`, `approved`, `rejected`, `cancelled`.
- **Validaciones**: Verifica solapamientos (`vacationOverlaps.ts`) y disponibilidad de días.

---

## Otros Modelos de Soporte
- **Area / Shift**: Estructura organizativa dentro de los proyectos.
- **Role / RoleFrame**: Sistema de permisos y categorización de puestos.
- **CategoriaSat**: Categorías salariales/técnicas.
- **Order / OrderConfig**: Gestión de pedidos y presupuestos.
- **Notification**: Sistema de alertas internas.
