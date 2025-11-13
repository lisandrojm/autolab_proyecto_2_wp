import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { ViewType } from "./types";
import TopBar from "./components/TopBar";
import BottomNav from "./components/BottomNav";
import Home from "./views/Home";
import Calendar from "./views/Calendar";
import Documents from "./views/Documents";
import Profile from "./views/Profile";
import Vacations from "./views/Vacations";
import Orders from "./views/Orders";
import AbsenceRequests from "./views/AbsenceRequests";
import NewAbsenceRequest from "./views/NewAbsenceRequest";
import { useAuthStore } from "../../../stores/authStore";
import { useThemeStore } from "../../../stores/themeStore";

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentView, setCurrentView] = useState<ViewType>("home");
  const { user, hasPermission } = useAuthStore();
  const { theme } = useThemeStore();

  useEffect(() => {
    const path = location.pathname.replace('/mobile', '');
    if (path === '/' || path === '') setCurrentView('home');
    else if (path.startsWith('/calendar')) setCurrentView('calendar');
    else if (path.startsWith('/documents')) setCurrentView('documents');
    else if (path.startsWith('/profile')) setCurrentView('profile');
    else if (path.startsWith('/vacations')) setCurrentView('vacations');
    else if (path.startsWith('/orders')) setCurrentView('orders');
  }, [location]);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const permissions = user?.permissions || [];
  const hasMobileAccess = hasPermission("mobile:access");
  const isMobileCollaborator = hasPermission("mobile:collaborator");
  const isMobileCoordinator = hasPermission("mobile:coordinator");

  const userRole = isMobileCoordinator ? "coordinator" : isMobileCollaborator ? "collaborator" : null;

  const getTitle = (view: ViewType): string => {
    switch (view) {
      case "home":
        return "Inicio";
      case "calendar":
        return "Calendario";
      case "documents":
        return "Documentos";
      case "profile":
        return "Perfil";
      case "vacations":
        return "Vacaciones";
      case "orders":
        return "Pedidos";
      default:
        return "Inicio";
    }
  };

  const handleNavigate = (view: ViewType) => {
    setCurrentView(view);
    navigate(`/mobile/${view === 'home' ? '' : view}`);
  };

  const showTopBar = currentView === "home" || currentView === "calendar" || currentView === "documents" || currentView === "profile";

  if (!hasMobileAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
          <div className="mb-6">
            <div className="mx-auto w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
              <span className="text-red-600 dark:text-red-400 text-3xl">⚠️</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Acceso Restringido</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">No tienes permisos para acceder a esta aplicación. Por favor, contacta con tu administrador si necesitas acceso.</p>
          <a href="/dashboard" className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors duration-200">
            ← Volver al Dashboard
          </a>
        </div>
      </div>
    );
  }

  if (!userRole) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
          <div className="mb-6">
            <div className="mx-auto w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <span className="text-blue-600 dark:text-blue-400 text-3xl">📱</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Bienvenido a Mobile App</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">Tienes acceso a la aplicación mobile, pero tu rol aún no está completamente configurado. Por favor, contacta con tu administrador.</p>
          <a href="/dashboard" className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors duration-200">
            ← Volver al Dashboard
          </a>
        </div>
      </div>
    );
  }

  const roleColors = {
    coordinator: {
      gradient: "from-blue-500 to-indigo-600",
      bg: "bg-blue-50 dark:bg-blue-900/20",
      text: "text-blue-600 dark:text-blue-400",
      border: "border-blue-200 dark:border-blue-800",
    },
    collaborator: {
      gradient: "from-green-500 to-teal-600",
      bg: "bg-green-50 dark:bg-green-900/20",
      text: "text-green-600 dark:text-green-400",
      border: "border-green-200 dark:border-green-800",
    },
  };

  const currentRoleColors = roleColors[userRole];

  return (
    <div className="w-full dark:bg-gray-900 flex justify-center">
      <div className="relative flex min-h-screen border dark:border-gray-800 flex-col bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-display xl:w-1/2">
        {showTopBar && <TopBar title={getTitle(currentView)} hasNotifications={true} onNotificationClick={() => alert("Notificaciones")} userRole={userRole} userName={user?.firstName || "Usuario"} />}
        <Routes>
          <Route path="/" element={<Home onNavigate={handleNavigate} />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/vacations" element={<Vacations onNavigate={handleNavigate} />} />
          <Route path="/orders" element={<Orders onNavigate={handleNavigate} />} />
          <Route path="/absence-requests" element={<AbsenceRequests />} />
          <Route path="/absence-requests/new" element={<NewAbsenceRequest />} />
        </Routes>
        <BottomNav currentView={currentView} onNavigate={handleNavigate} />
      </div>
    </div>
  );
}

export default App;
