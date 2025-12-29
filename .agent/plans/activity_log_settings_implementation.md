# Implementation Plan: Activity Logs Configuration & History

## Objective

Create a configuration view for Activity Logs (Registro de Novedades) accessible via the gear icon. This view allows configuring project-specific settings (notifications, registration permissions) and viewing the compliance history, without duplicating member management.

## 1. UI/UX Design

### Entry Point

- **Page:** `ManageActivityLogsPage.tsx`
- **Action:** Click on the ⚙️ (Gear) icon in the header.
- **Behavior:** Opens a Modal (or full-screen Drawer) titled "Configuración de Novedades".

### Layout (Modal/Drawer)

#### Sidebar (Left)

- List of **Active Projects**.
- Search bar to filter projects.
- Selection highlights the active project.

#### Main Content (Right) - Tabbed Interface

**Tab 1: Configuración (Settings)**

- **Header:** Project Name + Link/Button: `[Gestionar Equipo ↗]` (Navigates to `/projects/:id/team`).
- **Team List Table:**
  - Rows: Users currently assigned to the project (fetched from `Project.assignedUsers`).
  - Columns:
    - **User:** Avatar + Name + Role Badge (Coordinador/Colaborador).
    - **Notificaciones (🔔):** Radio button (or Checkbox with unique logic) to select _who_ receives variable notifications. _Note: Only enabled for Coordinators._
    - **Permitir Registro (📝):** Toggle switch to enable/disable the "Registrar Novedad" button in the Mobile App for this user.
- **Save Button:** Persists the `teamConfig`.

**Tab 2: Historial (History)**

- **KPI Cards:**
  - Total Reportes (Mes actual).
  - % Cumplimiento (Días reportados vs días hábiles).
- **Calendar/Heatmap View:**
  - Visual grid of the current month.
  - **Green:** Submitted. Click to see details (User, Time, Summary).
  - **Red:** Missing (Business day, no report).
  - **Grey:** Weekend/Holiday.

## 2. Backend Changes

### Model: `Project`

Update `server/src/models/Project.ts` to include `teamConfig`.

```typescript
// New Interface
interface IProjectTeamConfig {
  userId: Types.ObjectId;
  isNotifier: boolean; // Recibe notificaciones (Default: false)
  canRegister: boolean; // Puede registrar novedad (Default: true for all, or true for Coordinators?)
}

// Add to Schema
teamConfig: [
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    isNotifier: { type: Boolean, default: false },
    canRegister: { type: Boolean, default: true },
  },
];
```

_Note: If a user is in `assignedUsers` but not in `teamConfig`, default values apply._

### Endpoints

- **GET /projects/:id/novedades-config:** Returns the merged list of members + their config.
- **PATCH /projects/:id/novedades-config:** Updates the `teamConfig` array.
- **GET /projects/:id/novedades-history:** Returns stats and a map of `{ date: status }` for the calendar.

## 3. Frontend Implementation Steps

1.  **Create Components:**
    - `ActivityLogSettingsModal.tsx`: The main container.
    - `ProjectSelector.tsx`: Sidebar list.
    - `TeamConfigTab.tsx`: Table with toggles and the "Manage Team" button.
    - `HistoryTab.tsx`: Calendar/KPIs.
2.  **Integrate:**
    - Add state `showSettingsModal` to `ManageActivityLogsPage`.
    - Connect the Gear icon to set `showSettingsModal(true)`.
3.  **State Management:**
    - Use `useProjectStore` or create specific API hooks for fetching the config.

## 4. Workflows Integration

- Ensure that when the Mobile App checks "Can I register?", it queries the new `canRegister` flag.
- Ensure that backend notification jobs check `isNotifier` instead of emailing all coordinators.
