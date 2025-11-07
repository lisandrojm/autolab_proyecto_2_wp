# Remaining HR Pages Implementation Guide

This document contains implementation templates for the remaining HR management pages that need to be created.

## Pages Already Created:
✅ AdminDashboardPage.tsx
✅ ProfilePage.tsx
✅ TeamPage.tsx
✅ DailyReportPage.tsx
✅ VacationsPage.tsx
✅ OtherRequestsPage.tsx
✅ DocumentsPage.tsx

## Pages Still Needed:

### 1. OrdersPage.tsx (Personal/Pedidos)
- Similar to VacationsPage but for orders
- Fields: type (dropdown), description (textarea), optional dates
- CRUD operations with ordersAPI
- Status filtering and stats cards

### 2. HRCalendarPage.tsx (Personal/Calendario)
- Calendar view with month/year selector
- List of events below calendar
- Create/Edit/Delete events (admin/manager only)
- Uses calendarAPI

### 3. NotificationsPage.tsx (Personal/Notificaciones)
- List of all notifications with read/unread status
- Mark as read, mark all as read, delete actions
- Visual differentiation for unread items
- Uses notificationsAPI

### 4. ActivityPage.tsx (Personal/Actividad)
- List of recent activity (last 10 highlighted)
- Full list with pagination
- Filter by activity type
- Uses activityAPI

### 5. EmployeesManagementPage.tsx (Administracion/Empleados)
- Admin-only access
- List, search, filter employees
- Edit employee details modal
- Delete with confirmation
- Uses adminAPI.listUsers, getUser, updateUser, deleteUser

### 6. PendingVacationsAdminPage.tsx (Administracion/Vacaciones Pendientes)
- Admin-only access
- List pending vacation requests
- Approve/Reject buttons with confirmation
- Uses adminAPI.getPendingVacations, approveVacation, rejectVacation

### 7. PendingOrdersAdminPage.tsx (Administracion/Pedidos Pendientes)
- Admin-only access
- List pending orders
- Approve/Reject/Deliver buttons
- Uses adminAPI.getPendingOrders, approveOrder, rejectOrder, deliverOrder

## Implementation Pattern:

All pages should follow this structure:
1. Import necessary components (PageLayout, Card, Modal, FormField, etc.)
2. Use useState for local state management
3. Use useEffect for data fetching on mount
4. Implement CRUD functions with try/catch error handling
5. Use sweetAlert for confirmations and feedback
6. Follow existing styling patterns with Tailwind CSS
7. Use FontAwesome icons consistently
8. Implement loading states with LoadingSpinner
9. Use EmptyState when no data exists
10. Follow responsive design patterns

## Key Components to Reuse:
- PageLayout: Main page wrapper with title, subtitle, actions
- Card: Display items in grid
- Modal: Forms and details
- FormField: Consistent form inputs
- LoadingSpinner: Loading states
- EmptyState: No data states
- sweetAlert: User feedback

## API Integration:
All API calls are defined in `/api/hr.ts`:
- profileAPI
- vacationsAPI
- ordersAPI
- documentsAPI
- calendarAPI
- notificationsAPI
- activityAPI
- adminAPI
- hrDashboardAPI

## Next Steps:
1. Create remaining page components following the pattern
2. Add routes to App.tsx
3. Add navigation items to Navbar.tsx
4. Test all functionality
5. Run build to ensure no errors
