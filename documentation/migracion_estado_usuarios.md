# Migración de Estado de Usuarios (`isActive` -> `metadata.activo`)

Este documento detalla la refactorización completa realizada para migrar el manejo del estado (activo/inactivo) de los usuarios de la plataforma. El campo obsoleto de primer nivel `isActive` fue eliminado y reemplazado por `metadata.activo`.

## 1. Motivación y Resumen del Cambio
El objetivo principal de esta migración fue consolidar la información del usuario en una estructura más escalable bajo el objeto `metadata`, y evitar discrepancias o estados paralelos en la base de datos.
Todo el sistema (Frontend y Backend) ahora depende única y exclusivamente de `user.metadata.activo` (booleano) para determinar el acceso a la plataforma, la visualización en listados y asignación a proyectos.

---

## 2. Scripts de Base de Datos y Sincronización

### `migrateIsActive.ts`
Se creó un script de migración para actualizar la base de datos MongoDB.
- **Acción:** Recorrió todos los documentos de la colección `users`, asignando el valor de `isActive` a `metadata.activo`.
- **Limpieza:** Ejecutó un operador `$unset` para eliminar permanentemente la columna `isActive` de la base de datos.
- Se procesaron exitosamente cerca de 1,376 usuarios.

### `syncUserStatus.ts`
- Se adaptó la lógica para leer y sincronizar los estados a partir del archivo maestro `ActiveUsers/active_users.xlsx`.
- Normaliza los datos provenientes del Excel y actualiza el campo `metadata.activo` de acuerdo a la información en el documento.

---

## 3. Backend (API & Modelos)

### Modelos y Semillas
- **`server/src/models/User.ts`:**
  - Se eliminó `isActive: boolean` de la interfaz `IUser`.
  - Se eliminó del `Schema` de Mongoose.
  - Se estableció un valor por defecto `true` dentro de `metadata.activo`.
- **`server/src/scripts/seedOnStart.ts`:**
  - Se refactorizaron las semillas iniciales (`SuperAdmin`, usuarios predeterminados, tenants) para crearse con `metadata: { activo: true }`.

### Rutas actualizadas
- **`server/src/routes/auth.ts`:**
  - Login y validación de sesión: Se actualizaron las queries de Mongoose (`User.find` y `User.findOne`) para buscar `{"metadata.activo": true}`.
  - Generación de usuarios de demo: El endpoint `/auth/demo-users` ahora mapea y retorna correctamente el `metadata.activo`.
- **`server/src/routes/users.ts`:**
  - Toda la lógica de obtención, creación y actualización de usuarios (`GET`, `POST`, `PATCH`) fue depurada para obviar `isActive`.
  - Los validadores de *Zod* rechazan cualquier intento de forzar `isActive`.
- **`server/src/routes/profile.ts` & `server/src/routes/vacations.ts`:**
  - Se cambiaron las referencias de validación y queries para utilizar la nueva estructura.

---

## 4. Frontend (UI & Componentes)

### Tipos y API
- **`frontend/src/api/users.ts`:**
  - Se eliminó `isActive` de las interfaces `User` y `CreateUserPayload`.
  - La función `normalizeUser` fue actualizada.
  - Los parámetros de búsqueda aceptan ahora `metadataActivo` ("true" o "false").

### Interfaces
- **`frontend/src/pages/UsersPage.tsx`:**
  - **Filtros Avanzados:** Se reemplazó el antiguo interruptor de "Usuarios Activos" que estaba en *Opciones* por una nueva sección en la cabecera del modal llamada **Filtrar por usuarios**.
  - Este filtro permite tres estados excluyentes: *Usuarios Activos*, *Usuarios Inactivos*, y *Todos los usuarios*, que en el background asignan los valores "true", "false" y "" a la petición GET.
- **`frontend/src/components/ui/SearchAndFilters.tsx`:**
  - Se añadió la propiedad `radioFilters` para renderizar el grupo de opciones exclusivas de estado. 
  - Estos selectores se diseñaron visualmente como **switches interactivos** para mantener uniformidad total con la UI existente en el modal.
  - Se incorporó lógica para que los badges (etiquetas de filtros activos) cambien dinámicamente de color (Verde para Activos, Rojo para Inactivos).
- **`frontend/src/components/users/UserCard.tsx`:**
  - El badge de estado en la vista de tarjetas ahora lee de `user.metadata?.activo` y renderiza el texto de "Activo" o "Inactivo" correspondientemente.
- **`frontend/src/pages/LoginPage.tsx`:**
  - La visualización de los usuarios de demostración disponibles fue corregida para que valide correctamente los badges contra `metadata.activo`.
- **`frontend/src/pages/ProjectTeamPage.tsx`:**
  - Las lógicas del Wizard de agregar integrantes al equipo y la visualización de la tabla se acoplaron para leer `metadata.activo`.

---

## 5. Listado de Archivos Modificados / Creados

### Archivos Nuevos/Untracked
* `server/src/scripts/migrateIsActive.ts`
* `server/src/scripts/syncUserStatus.ts`
* Directorio `ActiveUsers/` (Contiene `active_users.xlsx`)

### Modificados (Backend)
* `server/src/models/User.ts`
* `server/src/routes/auth.ts`
* `server/src/routes/users.ts`
* `server/src/routes/profile.ts`
* `server/src/routes/vacations.ts`
* `server/src/scripts/seedOnStart.ts`
* `server/package.json` & `server/package-lock.json`

### Modificados (Frontend)
* `frontend/src/api/users.ts`
* `frontend/src/pages/UsersPage.tsx`
* `frontend/src/pages/LoginPage.tsx`
* `frontend/src/pages/ProjectTeamPage.tsx`
* `frontend/src/components/ui/SearchAndFilters.tsx`
* `frontend/src/components/users/UserCard.tsx`
