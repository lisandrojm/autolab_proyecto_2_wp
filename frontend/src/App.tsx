// apps/web/src/App.tsx
import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";
import { useThemeStore } from "./stores/themeStore";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { RegisterClientPage } from "./pages/RegisterClientPage";
import { ClientsPage } from "./pages/ClientsPage";

import { RolesPage } from "./pages/RolesPage";
import { PositionsPage } from "./pages/ManagePositionsPage";
import { LevelsPage } from "./pages/ManageLevelsPage";
import { ManageAreasPage } from "./pages/ManageAreasPage";
import { UsersPage } from "./pages/UsersPage";
import { TenantsPage } from "./pages/TenantsPage";
import { ClientDetailPage } from "./pages/ClientDetailPage";
import { ClientProjectsPage } from "./pages/ClientProjectsPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ProjectTeamPage } from "./pages/ProjectTeamPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { MobileNavbar } from "./components/Navbar";
import { ServerStatusCard } from "./components/ServerStatusCard";
import { LoadingSpinner } from "./components/ui/LoadingSpinner";

import { ClientDashboardPage } from "./pages/ClientDashboardPage";
import { ClientProfilePage } from "./pages/ClientProfilePage";

import { PlatformUsagePage } from "./pages/PlatformUsagePage";
import { PlatformSettingsPage } from "./pages/PlatformSettingsPage";
import { PlatformDashboardPage } from "./pages/PlatformDashboardPage";

import { ManageActivityLogsPage } from "./pages/ManageActivityLogsPage";
import { ManageActivityLogsConfigPage } from "./pages/ManageActivityLogsConfigPage";
import { CreateActivityReportPage } from "./pages/CreateActivityReportPage";

import { ManageOrdersPage } from "./pages/ManageOrdersPage";
import { ManageOrderTypesPage } from "./pages/ManageOrderTypesPage";
import { ManageVacationsPage } from "./pages/ManageVacationsPage";
import { ManageVacationsRulesPage } from "./pages/ManageVacationsRulesPage";
import { ManageVacationsCalendarPage } from "./pages/ManageVacationsCalendarPage";
import { PdfTemplatesPage } from "./pages/PdfTemplates/PdfTemplatesPage";

const AppMobile = lazy(() => import("./apps/mobile/src/App"));

// --- DashboardRouter para centralizar la lógica de roles ---
const DashboardRouter: React.FC = () => {
  const { user } = useAuthStore();
  if (!user) return null;
  if (user.tenantSlug === "superadmin") return <PlatformDashboardPage />;
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

  // Restaurar sesión y validar token
  useEffect(() => {
    // 1. Si tenemos token y user pero no estamos marcados como auténticos,
    // restauramos la sesión optimísticamente para renderizar rápido.
    if (token && user && !isAuthenticated) {
      useAuthStore.setState({ isAuthenticated: true });
    }

    // 2. Siempre verificamos la validez del token en segundo plano si existe.
    // Esto maneja el caso donde el token es inválido/expirado pero sigue en localStorage.
    if (token) {
      const checkTokenValidity = async () => {
        try {
          // Usamos un endpoint ligero para validar el token (ping o similar)
          const response = await fetch(`${import.meta.env.VITE_API_URL}/secure/ping`, {
            headers: {
              Authorization: `Bearer ${token}`,
              "X-Tenant-Id": localStorage.getItem("tenantId") || "demo-tenant",
            },
          });

          if (!response.ok) {
            console.warn("Token validation failed (ping !ok) -> Logging out");
            useAuthStore.getState().logout();
          } else {
            // Token válido. Si faltaba el usuario, intentamos recuperarlo de localStorage o parsearlo.
            // Si ya lo teníamos, todo bien.
            if (!user) {
              const savedUser = localStorage.getItem("user");
              if (savedUser) {
                try {
                  const userData = JSON.parse(savedUser);
                  if (userData && (userData.id || userData._id)) {
                    useAuthStore.setState({ user: userData, isAuthenticated: true });
                  } else {
                    console.warn("User data invalid in storage -> Logging out");
                    useAuthStore.getState().logout();
                  }
                } catch {
                  useAuthStore.getState().logout();
                }
              }
            }
          }
        } catch (error) {
          console.error("Token validation error (network/server) -> Logging out", error);
          useAuthStore.getState().logout();
        }
      };

      checkTokenValidity();
    }
  }, [token]); // Dependencia simplificada para correr al inicio o cambio de token

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
                path="/projects/:projectId/team"
                element={
                  <ProtectedRoute>
                    <ProjectTeamPage />
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

              {/* HR Management Routes */}
              <Route
                path="/requests"
                element={
                  <ProtectedRoute>
                    <ManageActivityLogsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/requests/config"
                element={
                  <ProtectedRoute>
                    <ManageActivityLogsConfigPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/requests/create"
                element={
                  <ProtectedRoute>
                    <CreateActivityReportPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/orders"
                element={
                  <ProtectedRoute>
                    <ManageOrdersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/order-types"
                element={
                  <ProtectedRoute>
                    <ManageOrderTypesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vacations"
                element={
                  <ProtectedRoute>
                    <ManageVacationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vacations/calendar"
                element={
                  <ProtectedRoute>
                    <ManageVacationsCalendarPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vacations-rules"
                element={
                  <ProtectedRoute>
                    <ManageVacationsRulesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pdfs"
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
              ></Route>
            </Route>

            {/* Mobile App Route SIN MobileNavbar (no está dentro de AppLayout) */}
            <Route
              path="/mobile/*"
              element={
                <ProtectedRoute>
                  <Suspense
                    fallback={
                      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                        <LoadingSpinner message="Cargando aplicación mobile..." />
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
        </Router>
      </div>
    </div>
  );
}

export default App;
