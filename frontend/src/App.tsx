// apps/web/src/App.tsx
import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { cancelPendingGetRequests } from "./api/axiosConfig";
import { useAuthStore } from "./stores/authStore";
import { useThemeStore } from "./stores/themeStore";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { RegisterClientPage } from "./pages/RegisterClientPage";
import { RegistroPage } from "./pages/RegistroPage";
import { ClientsPage } from "./pages/ClientsPage";

import { RolesPage } from "./pages/RolesPage";
import { PositionsPage } from "./pages/PositionsPage";
import { LevelsPage } from "./pages/LevelsPage";
import { AreasPage } from "./pages/AreasPage";
import { ShiftsPage } from "./pages/ShiftsPage";

import { UsersPage } from "./pages/UsersPage";
import { ImportUsersWpPage } from "./pages/ImportUsersWpPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SedesPage } from "./pages/SedesPage";
import { TenantsPage } from "./pages/TenantsPage";
import { ClientDetailPage } from "./pages/ClientDetailPage";
import { ClientProjectsPage } from "./pages/ClientProjectsPage";
import { ContractsPage } from "./pages/ContractsPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ProjectTeamPage } from "./pages/ProjectTeamPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { MobileNavbar } from "./components/Navbar";
import { MiPerfilPage } from "./pages/MiPerfilPage";
import { ServerStatusCard } from "./components/ServerStatusCard";
import { LoadingSpinner } from "./components/ui/LoadingSpinner";

import { RequestsPage } from "./pages/RequestsPage";
import { RequestsConfigPage } from "./pages/RequestsConfigPage";

import { OrdersPage } from "./pages/OrdersPage";
import { OrderTypesPage } from "./pages/OrderTypesPage";
import { VacationsPage } from "./pages/VacationsPage";
import { VacationsRulesPage } from "./pages/VacationsRulesPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { EscaneoDropboxConfigPage } from "./pages/EscaneoDropboxConfigPage";
import { DropboxSignConfigPage } from "./pages/DropboxSignConfigPage";
import { AfipConfigPage } from "./pages/AfipConfigPage";
import { ArcaObrasSocialesConexionPage } from "./pages/ArcaObrasSocialesConexionPage";
import { VacationsCalendarPage } from "./pages/VacationsCalendarPage";
import { PdfTemplatesPage } from "./pages/PdfTemplatesPage";
import { ReleasesPage } from "./pages/ReleasesPage";
import { ReleaseTiposPage } from "./pages/ReleaseTiposPage";
import { HolidaysPage } from "./pages/HolidaysPage";
import { ArcaCategoriasPage } from "./pages/ArcaCategoriasPage";
import { BancosPage } from "./pages/BancosPage";
import { ObrasSocialesPage } from "./pages/ObrasSocialesPage";
import { ArcaSucursalesPage } from "./pages/ArcaSucursalesPage";
import { ArcaComoFuncionaPage } from "./pages/ArcaComoFuncionaPage";
import { GuiaObrasSocialesPage } from "./pages/GuiaObrasSocialesPage";
import { EmparejarAsistentePage } from "./pages/EmparejarAsistentePage";
import { NomenclaturaArchivosPage } from "./pages/NomenclaturaArchivosPage";
import { ArcaActividadesPage } from "./pages/ArcaActividadesPage";
import { ArcaModalidadesContratacionPage } from "./pages/ArcaModalidadesContratacionPage";
import { ArcaTiposServicioPage } from "./pages/ArcaTiposServicioPage";
import { ArcaGruposTipoServicioPage } from "./pages/ArcaGruposTipoServicioPage";
import { FuentesParitariaPage } from "./pages/FuentesParitariaPage";
import { ArcaModalidadesLiquidacionPage } from "./pages/ArcaModalidadesLiquidacionPage";
import { ConveniosPage } from "./pages/ConveniosPage";
import { CentrosCostoPage } from "./pages/CentrosCostoPage";
import { ContratosPage } from "./pages/ContratosPage";
import { EmpresasPage } from "./pages/EmpresasPage";
// Contexto Empresa (la empleadora como eje, igual que Cliente).
import { EmpresaInfoPage } from "./pages/empresa/EmpresaInfoPage";
import { EmpresaObrasSocialesPage, EmpresaConveniosPage, EmpresaDomiciliosPage, EmpresaCategoriasPage, EmpresaGruposTipoServicioPage, EmpresaDefaultsPage } from "./pages/empresa/EmpresaArcaPages";
import { EmpresaContratosPage } from "./pages/empresa/EmpresaContratosPage";
import { MembretesPage } from "./pages/MembretesPage";
import { ContratosFramePage } from "./pages/ContratosFramePage";

const AppMobile = lazy(() => import("./apps/mobile/src/App"));

// --- DashboardRouter para centralizar la lógica de roles ---
const DashboardRouter: React.FC = () => {
  const { user } = useAuthStore();
  if (!user) return null;
  if (user.tenantSlug === "superadmin") return <TenantsPage />;
  // Para cualquier otro rol, ir a Users
  return <UsersPage />;
};

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

// Al cambiar de ruta, cancela los GET en vuelo de la página anterior para que no se
// apilen consultas pesadas contra el server al navegar rápido. La limpieza corre antes
// de que la nueva página dispare sus propios fetch.
const RouteChangeCanceller: React.FC = () => {
  const location = useLocation();
  useEffect(() => {
    return () => cancelPendingGetRequests();
  }, [location.pathname]);
  return null;
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
            if (response.status === 401 || response.status === 403) {
              console.warn("Token validation failed (expired/unauthorized) -> Logging out");
              useAuthStore.getState().logout();
            } else {
              console.warn(`Server responded with HTTP ${response.status} during token validation. Keeping session.`);
            }
          } else {
            // Token válido: refrescamos el usuario contra /auth/me. Los permisos se guardaban solo en
            // el login, así que un permiso agregado después no llegaba nunca a una sesión ya abierta.
            useAuthStore.getState().refreshSession();

            // Si faltaba el usuario, intentamos recuperarlo de localStorage o parsearlo.
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
          // Si es un error de conexión, CORS o servidor caído, NO deslogueamos al usuario de forma agresiva.
          console.error("Token validation connection error (CORS / Network issue) -> Keeping session:", error);
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
          <RouteChangeCanceller />
          <Routes>
            {/* Rutas públicas (SIN Navbar) */}
            <Route element={<PublicLayout />}>
              <Route path="/login" element={<LoginPage />} />

              <Route path="/register" element={<RegisterPage />} />
              <Route path="/register-client" element={<RegisterClientPage />} />
              <Route path="/registro" element={<RegistroPage />} />

              {/* Acá cae el navegador que abre el Asistente. Pública porque el redirect al login se
                  comería el fragmento con el token, y porque emparejar no necesita sesión: solo
                  escribe en el localStorage de este navegador. Ver EmparejarAsistentePage. */}
              <Route path="/asistente/emparejar" element={<EmparejarAsistentePage />} />
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
                path="/clients/:clientId/users"
                element={
                  <ProtectedRoute>
                    <UsersPage />
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
                path="/admin/projects"
                element={
                  <ProtectedRoute>
                    <ProjectsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/sedes"
                element={
                  <ProtectedRoute>
                    <SedesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/contracts"
                element={
                  <ProtectedRoute>
                    <ContractsPage />
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
                path="/roles"
                element={
                  <ProtectedRoute>
                    <RolesPage />
                  </ProtectedRoute>
                }
              />
              {/* Funciones FRAME ahora es un tab dentro de Categorías, no una página propia. */}
              <Route path="/funciones-frame" element={<Navigate to="/arca/categorias" replace />} />
              <Route path="/admin/roles-frame" element={<Navigate to="/arca/categorias" replace />} />
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
                    <AreasPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/shifts"
                element={
                  <ProtectedRoute>
                    <ShiftsPage />
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
                path="/users/import-wp"
                element={
                  <ProtectedRoute>
                    <ImportUsersWpPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/mi-perfil"
                element={
                  <ProtectedRoute>
                    <MiPerfilPage />
                  </ProtectedRoute>
                }
              />

              {/* HR Management Routes */}
              <Route
                path="/requests"
                element={
                  <ProtectedRoute>
                    <RequestsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/requests/config"
                element={
                  <ProtectedRoute>
                    <RequestsConfigPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/orders"
                element={
                  <ProtectedRoute>
                    <OrdersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/order-types"
                element={
                  <ProtectedRoute>
                    <OrderTypesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vacations"
                element={
                  <ProtectedRoute>
                    <VacationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vacations/calendar"
                element={
                  <ProtectedRoute>
                    <VacationsCalendarPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vacations-rules"
                element={
                  <ProtectedRoute>
                    <VacationsRulesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/documents"
                element={
                  <ProtectedRoute>
                    <DocumentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/escaneo-dropbox"
                element={
                  <ProtectedRoute>
                    <EscaneoDropboxConfigPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dropbox-sign"
                element={
                  <ProtectedRoute>
                    <DropboxSignConfigPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/afip"
                element={
                  <ProtectedRoute>
                    <AfipConfigPage />
                  </ProtectedRoute>
                }
              />
              {/* La otra conexión de ARCA. Vive aparte porque es otra credencial, otro mecanismo y
                  otro dato: ver el comentario de cabecera de esa página. */}
              <Route
                path="/arca/conexion-obras-sociales"
                element={
                  <ProtectedRoute>
                    <ArcaObrasSocialesConexionPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pdfs"
                element={
                  <ProtectedRoute>
                    <PdfTemplatesPage scope="pedidos" />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pdfs-vacaciones"
                element={
                  <ProtectedRoute>
                    <PdfTemplatesPage scope="vacaciones" />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/releases"
                element={
                  <ProtectedRoute>
                    <ReleasesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/releases-tipos"
                element={
                  <ProtectedRoute>
                    <ReleaseTiposPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/holidays"
                element={
                  <ProtectedRoute>
                    <HolidaysPage />
                  </ProtectedRoute>
                }
              />
              {/* Las categorías son un catálogo de ARCA como Sucursales o Tipos de Servicio, y viven
                  con ellos. "categorias-sat" nombraba un caso particular —las 106 del convenio
                  0634/11— como si fuera la regla; se conserva como redirect por los links guardados. */}
              <Route path="/categorias-sat" element={<Navigate to="/arca/categorias" replace />} />
              <Route
                path="/arca/categorias"
                element={
                  <ProtectedRoute>
                    <ArcaCategoriasPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/bancos"
                element={
                  <ProtectedRoute>
                    <BancosPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/obras-sociales"
                element={
                  <ProtectedRoute>
                    <ObrasSocialesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/arca/sucursales"
                element={
                  <ProtectedRoute>
                    <ArcaSucursalesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/arca/actividades"
                element={
                  <ProtectedRoute>
                    <ArcaActividadesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/nomenclatura-archivos"
                element={
                  <ProtectedRoute>
                    <NomenclaturaArchivosPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/arca/guia-obras-sociales"
                element={
                  <ProtectedRoute>
                    <GuiaObrasSocialesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/arca/como-funciona"
                element={
                  <ProtectedRoute>
                    <ArcaComoFuncionaPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/arca/modalidades-contratacion"
                element={
                  <ProtectedRoute>
                    <ArcaModalidadesContratacionPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/arca/tipos-servicio"
                element={
                  <ProtectedRoute>
                    <ArcaTiposServicioPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/arca/fuentes-paritaria"
                element={
                  <ProtectedRoute>
                    <FuentesParitariaPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/arca/grupos-tipo-servicio"
                element={
                  <ProtectedRoute>
                    <ArcaGruposTipoServicioPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/arca/modalidades-liquidacion"
                element={
                  <ProtectedRoute>
                    <ArcaModalidadesLiquidacionPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/convenios"
                element={
                  <ProtectedRoute>
                    <ConveniosPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/centros-costo"
                element={
                  <ProtectedRoute>
                    <CentrosCostoPage />
                  </ProtectedRoute>
                }
              />
              {/* Estados ahora es un tab dentro de Contratos, no una página propia. */}
              <Route path="/estados" element={<Navigate to="/contratos" replace />} />
              <Route
                path="/contratos"
                element={
                  <ProtectedRoute>
                    <ContratosPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/empresas"
                element={
                  <ProtectedRoute>
                    <EmpresasPage />
                  </ProtectedRoute>
                }
              />
              {/* Contexto Empresa: la empleadora como eje, igual que Cliente. Adentro vive todo lo que
                  ARCA lleva por CUIT ("Datos del Empleador"), sus contratos y su alta masiva. Los
                  NOMENCLADORES universales quedan en Configuración → ARCA. */}
              <Route
                path="/empresas/:empresaId"
                element={
                  <ProtectedRoute>
                    <EmpresaInfoPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/empresas/:empresaId/arca/obras-sociales"
                element={
                  <ProtectedRoute>
                    <EmpresaObrasSocialesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/empresas/:empresaId/arca/convenios"
                element={
                  <ProtectedRoute>
                    <EmpresaConveniosPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/empresas/:empresaId/arca/domicilios"
                element={
                  <ProtectedRoute>
                    <EmpresaDomiciliosPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/empresas/:empresaId/arca/categorias"
                element={
                  <ProtectedRoute>
                    <EmpresaCategoriasPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/empresas/:empresaId/arca/grupos-tipo-servicio"
                element={
                  <ProtectedRoute>
                    <EmpresaGruposTipoServicioPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/empresas/:empresaId/arca/defaults"
                element={
                  <ProtectedRoute>
                    <EmpresaDefaultsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/empresas/:empresaId/contratos"
                element={
                  <ProtectedRoute>
                    <EmpresaContratosPage />
                  </ProtectedRoute>
                }
              />
              {/* No hay ruta de alta masiva por empresa: es la misma pantalla que
                  Admin GENERAL → Contratos → Gestión de Contratos, que ya filtra por Empresa Contrato. */}
              <Route
                path="/empresas-membretes"
                element={
                  <ProtectedRoute>
                    <MembretesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/contratos-frame"
                element={
                  <ProtectedRoute>
                    <ContratosFramePage />
                  </ProtectedRoute>
                }
              />

              {/* Las pantallas del cliente son `/clients/:clientId/...` (ver más arriba). Acá hubo
                  una `/cliente/:id` que renderizaba un `<Outlet />` sin rutas hijas: resto de un
                  intento anterior de contexto, que no llevaba a ningún lado. */}
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
