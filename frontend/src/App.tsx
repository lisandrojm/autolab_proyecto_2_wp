// apps/web/src/App.tsx
import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Outlet } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";
import { useThemeStore } from "./stores/themeStore";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { RegisterClientPage } from "./pages/RegisterClientPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ClientsPage } from "./pages/ClientsPage";

import { AnalyticsPage } from "./pages/AnalyticsPage";
import { RolesPage } from "./pages/RolesPage";
import { PositionsPage } from "./pages/ManagePositionsPage";
import { LevelsPage } from "./pages/ManageLevelsPage";
import { ManageAreasPage } from "./pages/ManageAreasPage";
import { UsersPage } from "./pages/UsersPage";
import { TenantsPage } from "./pages/TenantsPage";
import { ClientDetailPage } from "./pages/ClientDetailPage";
import { ClientProjectsPage } from "./pages/ClientProjectsPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { MobileNavbar } from "./components/Navbar";
import { ServerStatusCard } from "./components/ServerStatusCard";
import { CampaignDetailPage } from "./pages/CampaignDetailPage";

import { ClientContextInfoPage } from "./pages/ClientContextInfoPage";

import { ClientContextCampaignsPage } from "./pages/ClientContextCampaignsPage";
import { ClientContextPostsPage } from "./pages/ClientContextPostsPage";

import { ClientDashboardPage } from "./pages/ClientDashboardPage";
import { ClientProfilePage } from "./pages/ClientProfilePage";

import { ClientApprovalsPage } from "./pages/ClientApprovalsPage";
import { ClientCampaignsPage } from "./pages/ClientCampaignsPage";
import { PlatformUsagePage } from "./pages/PlatformUsagePage";
import { PlatformSettingsPage } from "./pages/PlatformSettingsPage";
import { AIAssistantModal } from "./components/AIAssistantModal";
import { AssistantRedirect } from "./pages/AssistantRedirect";

import { ProfilePage } from "./pages/ProfilePage";
import { DailyReportPage } from "./pages/DailyReportPage";

import { DocumentsPage } from "./pages/DocumentsPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ActivityPage } from "./pages/ActivityPage";
import { EmployeesAdminPage } from "./pages/EmployeesAdminPage";

import { ManageActivityLogsPage } from "./pages/ManageActivityLogsPage";
import { ManageEmployeeProfilesPage } from "./pages/ManageEmployeeProfilesPage";
import { ManageHRDocumentsPage } from "./pages/ManageHRDocumentsPage";
import { ManageOrdersPage } from "./pages/ManageOrdersPage";
import { ManageOrdersCategoriesPage } from "./pages/ManageOrdersCategoriesPage";
import { ManageVacationsPage } from "./pages/ManageVacationsPage";
import { ManageVacationsRulesPage } from "./pages/ManageVacationsRulesPage";
import { ManageVacationsCalendarPage } from "./pages/ManageVacationsCalendarPage";
import { RequestsListPage } from "./pages/Requests/RequestsListPage";
import { RequestDetailPage } from "./pages/Requests/RequestDetailPage";
import { PdfTemplatesPage } from "./pages/PdfTemplates/PdfTemplatesPage";

const AppMobile = lazy(() => import("./apps/mobile/src/App"));

// --- DashboardRouter para centralizar la lógica de roles ---
const DashboardRouter: React.FC = () => {
  const { user } = useAuthStore();
  if (!user) return null;
  if (user.tenantSlug === "superadmin") return <DashboardPage />;
  if (["admin", "manager"].includes(user.primaryRole || "")) return <UsersPage />;
  return <ClientDashboardPage />;
};

// --- Wrapper para rutas de cliente con Outlet ---
const ClientContextWrapper: React.FC = () => (
  <>
    {/* Aquí podés poner header o sidebar si querés */}
    <Outlet />
  </>
);

// --- Layout público (sin Navbar) ---
const PublicLayout: React.FC = () => {
  return <Outlet />;
};

// --- Layout principal que incluye el MobileNavbar ---
// Esto se aplica a TODAS las rutas protegidas/autenticadas
const AppLayout: React.FC = () => {
  const { isAuthenticated } = useAuthStore();

  return (
    <>
      {isAuthenticated && <MobileNavbar />}
      <Outlet />
    </>
  );
};

function App() {
  const { isAuthenticated, token, user } = useAuthStore();
  const { theme } = useThemeStore();

  useEffect(() => {
    console.log("=== APP STARTUP ===");
    console.log("🌍 VITE_API_URL:", import.meta.env.VITE_API_URL);
    console.log("🌍 MODE:", import.meta.env.MODE);
    console.log("🌍 DEV:", import.meta.env.DEV);
    console.log("🌍 PROD:", import.meta.env.PROD);
    console.log("==================");
  }, []);

  // Restaurar sesión si hay token
  useEffect(() => {
    if (token && user && !isAuthenticated) {
      useAuthStore.setState({ isAuthenticated: true });
    } else if (token && !user) {
      const checkTokenValidity = async () => {
        try {
          const response = await fetch(`${import.meta.env.VITE_API_URL}/secure/ping`, {
            headers: {
              Authorization: `Bearer ${token}`,
              "X-Tenant-Id": localStorage.getItem("tenantId") || "demo-tenant",
            },
          });

          if (!response.ok) {
            useAuthStore.getState().logout();
          } else {
            const savedUser = localStorage.getItem("user");
            if (savedUser) {
              try {
                const userData = JSON.parse(savedUser);
                if (userData && (userData.id || userData._id)) {
                  useAuthStore.setState({ user: userData, isAuthenticated: true });
                } else {
                  console.warn("Token valid but user data invalid -> logout");
                  useAuthStore.getState().logout();
                }
              } catch {
                useAuthStore.getState().logout();
              }
            } else {
              // Token válido pero sin datos de usuario -> Logout
              console.warn("Token valid but no user data -> logout");
              useAuthStore.getState().logout();
            }
          }
        } catch {
          useAuthStore.getState().logout();
        }
      };
      checkTokenValidity();
    }
  }, [token, user, isAuthenticated]);

  // Sincronizar tema
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.remove("light", "dark");
    body.classList.remove("light", "dark");
    root.classList.add(theme);
    body.classList.add(theme);
  }, [theme]);

  return (
    <div className={theme}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
        <Router>
          <Routes>
            {/* Rutas públicas (SIN Navbar) */}
            <Route element={<PublicLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/register-client" element={<RegisterClientPage />} />
            </Route>

            {/* Rutas protegidas (CON MobileNavbar) */}
            <Route element={<AppLayout />}>
              {/* Dashboard */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <DashboardRouter />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardRouter />
                  </ProtectedRoute>
                }
              />

              {/* Client Routes */}
              <Route
                path="/client/dashboard"
                element={
                  <ProtectedRoute>
                    <ClientDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/client/gestion"
                element={
                  <ProtectedRoute>
                    <ClientProfilePage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/client/aprobaciones"
                element={
                  <ProtectedRoute>
                    <ClientApprovalsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/client/campañas"
                element={
                  <ProtectedRoute>
                    <ClientCampaignsPage />
                  </ProtectedRoute>
                }
              />

              {/* General Routes */}
              <Route
                path="/clients"
                element={
                  <ProtectedRoute>
                    <ClientsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/clients/:clientId"
                element={
                  <ProtectedRoute>
                    <ClientDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/clients/:clientId/projects"
                element={
                  <ProtectedRoute>
                    <ClientProjectsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:projectId"
                element={
                  <ProtectedRoute>
                    <ProjectDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:projectId/campaigns/:campaignId"
                element={
                  <ProtectedRoute>
                    <CampaignDetailPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/analytics"
                element={
                  <ProtectedRoute>
                    <AnalyticsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tenants"
                element={
                  <ProtectedRoute>
                    <TenantsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/platform/usage"
                element={
                  <ProtectedRoute>
                    <PlatformUsagePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/platform/settings"
                element={
                  <ProtectedRoute>
                    <PlatformSettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/roles"
                element={
                  <ProtectedRoute>
                    <RolesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/positions"
                element={
                  <ProtectedRoute>
                    <PositionsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/levels"
                element={
                  <ProtectedRoute>
                    <LevelsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/areas"
                element={
                  <ProtectedRoute>
                    <ManageAreasPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <ProtectedRoute>
                    <UsersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/assistant"
                element={
                  <ProtectedRoute>
                    <AssistantRedirect />
                  </ProtectedRoute>
                }
              />

              {/* Personnel Module Routes */}

              <Route
                path="/admin/personal/perfil"
                element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/novedades/reporte-diario"
                element={
                  <ProtectedRoute>
                    <DailyReportPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/admin/pedidos/ausencias"
                element={
                  <ProtectedRoute>
                    <RequestsListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/requests"
                element={
                  <ProtectedRoute>
                    <RequestsListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/requests/:id"
                element={
                  <ProtectedRoute>
                    <RequestDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/personal/documentos"
                element={
                  <ProtectedRoute>
                    <DocumentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/personal/notificaciones"
                element={
                  <ProtectedRoute>
                    <NotificationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/personal/actividad"
                element={
                  <ProtectedRoute>
                    <ActivityPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/administracion/empleados"
                element={
                  <ProtectedRoute>
                    <EmployeesAdminPage />
                  </ProtectedRoute>
                }
              />

              {/* HR Management Routes */}
              <Route
                path="/hr/activity-logs"
                element={
                  <ProtectedRoute>
                    <ManageActivityLogsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/employee-profiles"
                element={
                  <ProtectedRoute>
                    <ManageEmployeeProfilesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/documents"
                element={
                  <ProtectedRoute>
                    <ManageHRDocumentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/orders"
                element={
                  <ProtectedRoute>
                    <ManageOrdersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/order-categories"
                element={
                  <ProtectedRoute>
                    <ManageOrdersCategoriesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/vacations"
                element={
                  <ProtectedRoute>
                    <ManageVacationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/vacations/calendar"
                element={
                  <ProtectedRoute>
                    <ManageVacationsCalendarPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/vacations-rules"
                element={
                  <ProtectedRoute>
                    <ManageVacationsRulesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/pdf-templates"
                element={
                  <ProtectedRoute>
                    <PdfTemplatesPage />
                  </ProtectedRoute>
                }
              />

              {/* Client Context Routes */}
              <Route
                path="/cliente/:id"
                element={
                  <ProtectedRoute>
                    <ClientContextWrapper />
                  </ProtectedRoute>
                }
              >
                <Route
                  path="info-basica"
                  element={
                    <ProtectedRoute>
                      <ClientContextInfoPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="campanas"
                  element={
                    <ProtectedRoute>
                      <ClientContextCampaignsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="posts"
                  element={
                    <ProtectedRoute>
                      <ClientContextPostsPage />
                    </ProtectedRoute>
                  }
                />
              </Route>
            </Route>

            {/* Mobile App Route SIN MobileNavbar (no está dentro de AppLayout) */}
            <Route
              path="/mobile/*"
              element={
                <ProtectedRoute>
                  <Suspense
                    fallback={
                      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                        <div className="text-center">
                          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary-600 border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
                          <p className="mt-4 text-gray-600 dark:text-gray-400">Cargando aplicación mobile...</p>
                        </div>
                      </div>
                    }
                  >
                    <AppMobile />
                  </Suspense>
                </ProtectedRoute>
              }
            />
          </Routes>

          <ServerStatusCard />
          <AIAssistantModal />
        </Router>
      </div>
    </div>
  );
}

export default App;
