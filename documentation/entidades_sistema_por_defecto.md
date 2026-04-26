# Entidades de Sistema por Defecto y Protecciones

Este documento detalla la arquitectura, modelos de datos y lógicas de interfaz implementadas para establecer entidades obligatorias generadas por el sistema (Áreas, Turnos y Tipos de Turno). Estas protecciones aseguran que el sistema cuente con datos estructurales mínimos, vitales para el funcionamiento de Proyectos y Equipos.

## 1. Objetivo Principal
Asegurar que cada organización (Tenant) tenga por defecto configuraciones clave:
- **Área**: "Coordinador"
- **Tipo de Turno (Categoría)**: "Mañana"
- **Turno**: "Mañana" (09:00 - 17:00 hs, Lunes a Viernes)

Estas entidades no pueden ser eliminadas por el usuario, evitando así inconsistencias críticas en el software (por ejemplo, proyectos sin áreas o turnos asignados).

## 2. Modelo de Datos (Backend)
Se ha incorporado una bandera booleana a los modelos estructurales principales de la base de datos para identificar a estas entidades intocables.

- **Modificados**: `Area.ts`, `Shift.ts`, `ShiftConfig.ts`
- **Nuevo Campo**: `isSystem: { type: Boolean, default: false }`

## 3. Servicios de Inicialización
Se crearon servicios dedicados que se ejecutan automáticamente cada vez que el servidor backend se inicializa (`server.ts`).
Estos scripts barren todos los `Tenants` de la plataforma y garantizan la existencia de las entidades. Si no existen, las crean; si ya existían previamente con esos nombres, las asimilan marcándolas como `isSystem = true`.

- `areaInitService.ts`: Asegura el Área **Coordinador**.
- `shiftConfigInitService.ts`: Asegura el Tipo de Turno **Mañana**.
- `shiftInitService.ts`: Asegura el Turno **Mañana**.

## 4. Protecciones de Backend (API)
Se modificaron los controladores (`routes`) para proteger de modificaciones accidentales.

- **Protección contra Eliminación (`DELETE`)**: Las rutas `/areas/:id`, `/shifts/:id`, y `/shift-configs/:id` devuelven un error `403 Forbidden` si la entidad requerida tiene `isSystem === true`.
- **Protección contra Edición (`PATCH`)**:
  - **Áreas**: El área "Coordinador" bloquea estrictamente la edición de su nombre.
  - **Turnos y Tipos de Turnos**: De acuerdo a las reglas de negocio, se permite al usuario cambiar el nombre del turno y la categoría "Mañana" a un alias de su preferencia, sin perder la restricción de eliminación.

## 5. Implementación en el Frontend (Interfaz de Usuario)
La interfaz de usuario refleja activamente estas protecciones en las vistas `AreasPage`, `ShiftsPage` y `ShiftConfigsPage`.

- **Badge Visual**: Las entidades del sistema cuentan con una etiqueta especial **"SISTEMA"** (color ámbar) tanto en las listas de tabla, tarjetas (cards) y en las cabeceras de los modales de edición.
- **Ocultamiento de Acciones**: El botón de eliminación (ícono de papelera) desaparece automáticamente para cualquier entidad con `isSystem === true`.
- **Bloqueo de Inputs**: El campo "Nombre" del Área aparece deshabilitado (en gris) y no permite interacción del teclado.

## 6. Lógica de Proyectos por Defecto
El flujo de creación y edición de Proyectos (`ProjectsPage` y `ProjectDetailPage`) fue fuertemente refactorizado para interactuar con estas entidades protegidas:

1. **Campo Requerido**: El campo "Centro de Costo" es ahora estrictamente obligatorio.
2. **Inyección Forzada del Área**: En el modal de creación, la tabla de "Configuración por Área" ya viene con el Área **Coordinador** agregada por defecto. Esta fila no tiene botón para ser eliminada de la configuración.
3. **Turnos Asignados**: El Área Coordinador carga de forma predeterminada *todos los turnos activos* de la plataforma para ese Tenant. Al ser "Mañana" un turno imborrable de sistema, se garantiza que el proyecto superará la validación ("Un área debe tener al menos un turno").

## 7. Validaciones del Equipo del Proyecto
Se añadieron controles visuales preventivos en la solapa de Equipo y Coordinadores (`ProjectTeamPage` / `TeamCoordinadoresTab`):

- **Alerta Preventiva**: Si un usuario entra a ver la información de un Proyecto existente pero este *no cuenta* con un miembro del equipo que ostente el rol de sistema `mobile-coordinador`, se dispara una barra de alerta estilo modal o banner.
- El mensaje instruye al usuario sobre la obligatoriedad de asignar al equipo un miembro con dicho rol, acompañado de un botón **"Entendido"** que redirige activamente la vista hacia la tabla de asignación de personal ("Equipo"), agilizando la resolución del error de configuración.
