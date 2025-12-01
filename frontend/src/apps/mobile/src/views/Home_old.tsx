import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faShoppingCart, faUmbrella, faFileAlt, faReceipt, faCheckCircle, faFile, faUsers, faChartBar, faBell, faSun, faMoon, faSignOutAlt } from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";
import { useAuthStore } from "../../../../stores/authStore";
import { useNotifications } from "../hooks/useNotifications";
import { personnelAPI, ActivityRecord } from "../../../../api/personnel";
import { useState, useEffect } from "react";
import { useThemeStore } from "../../../../stores/themeStore";
import UserHeader from "../components/UserHeader";

interface HomeProps {
  onNavigate: (view: ViewType) => void;
}

export default function Home({ onNavigate }: HomeProps) {
  const { user, hasPermission, logout } = useAuthStore();
  const { notifications, unreadCount, loading: notifLoading } = useNotifications();
  const [recentActivity, setRecentActivity] = useState<ActivityRecord[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const { theme, toggleTheme } = useThemeStore();

  const isMobileCoordinator = hasPermission("mobile:coordinator");
  const isMobileCollaborator = hasPermission("mobile:collaborator");

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        setActivityLoading(true);
        const data = await personnelAPI.getRecentActivity();
        const filteredData = data.filter((activity) => activity.action !== "order_pre_approved");
        setRecentActivity(filteredData.slice(0, 3));
      } catch (error) {
        console.error("Error fetching activity:", error);
      } finally {
        setActivityLoading(false);
      }
    };

    fetchActivity();
  }, []);

  const latestNotification = notifications.find((n) => !n.isRead);

  const baseActions = [
    {
      icon: faShoppingCart,
      title: "Pedidos",
      description: "Gestiona tus pedidos",
      view: "orders" as ViewType,
      roles: ["coordinator", "collaborator"],
      badge: "Finish",
    },
    {
      icon: faUmbrella,
      title: "Vacaciones",
      description: "Solicitá tus días libres",
      view: "vacations" as ViewType,
      roles: ["coordinator", "collaborator"],
      disabled: false,
      badge: "New",
    },
    {
      icon: faFileAlt,
      title: "Contratos",
      description: "Consultá tus documentos",
      view: "documents" as ViewType,
      roles: ["coordinator", "collaborator"],
      disabled: true,
    },
    {
      icon: faReceipt,
      title: "Recibos",
      description: "Accedé a tus nóminas",
      view: "documents" as ViewType,
      roles: ["coordinator", "collaborator"],
      disabled: true,
    },
  ];

  const coordinatorActions = [
    {
      icon: faUsers,
      title: "Gestión de Equipo",
      description: "Administra tu equipo",
      view: "home" as ViewType,
      roles: ["coordinator"],
      disabled: true,
    },
    {
      icon: faChartBar,
      title: "Reportes",
      description: "Ver métricas y estadísticas",
      view: "home" as ViewType,
      roles: ["coordinator"],
      disabled: true,
    },
  ];

  const quickActions = isMobileCoordinator ? [...baseActions, ...coordinatorActions] : baseActions;

  const getActivityIcon = (action: string) => {
    if (action.includes("vacation")) return faCheckCircle;
    if (action.includes("order")) return faShoppingCart;
    if (action.includes("document")) return faFile;
    return faCheckCircle;
  };

  const getActivityColor = (action: string) => {
    if (action.includes("vacation")) return { bg: "bg-green-100 dark:bg-green-900/50", icon: "text-green-600 dark:text-green-400" };
    if (action.includes("order")) return { bg: "bg-blue-100 dark:bg-blue-900/50", icon: "text-blue-600 dark:text-blue-400" };
    if (action.includes("document")) return { bg: "bg-cyan-100 dark:bg-cyan-900/50", icon: "text-cyan-600 dark:text-cyan-400" };
    return { bg: "bg-slate-100 dark:bg-slate-800", icon: "text-slate-600 dark:text-slate-400" };
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 0) return `hace ${diffDays} día${diffDays > 1 ? "s" : ""}`;
    if (diffHours > 0) return `hace ${diffHours} hora${diffHours > 1 ? "s" : ""}`;
    if (diffMinutes > 0) return `hace ${diffMinutes} minuto${diffMinutes > 1 ? "s" : ""}`;
    return "hace un momento";
  };

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  return (
    <div className="flex-1 pb-24">
      {/* Header: avatar + nombre + rol + botones de tema y salir */}
      <div className="flex items-center justify-between px-4 pt-4">
        <UserHeader user={user} />

        <div className="flex items-center gap-1">
          <button onClick={toggleTheme} className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg bg-transparent text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Cambiar tema">
            <FontAwesomeIcon icon={theme === "dark" ? faSun : faMoon} className="w-5 h-5" />
          </button>
          <button onClick={handleLogout} className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg bg-transparent text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" aria-label="Cerrar sesión">
            <FontAwesomeIcon icon={faSignOutAlt} className="w-5 h-5" />
          </button>
        </div>
      </div>

      {!notifLoading && latestNotification && (
        <div className="p-4">
          <div className="flex items-start gap-3 rounded-xl border border-green-500 bg-green-50 p-4 shadow-sm dark:border-green-400 dark:bg-green-900/40">
            <FontAwesomeIcon icon={faBell} className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-green-800 dark:text-green-100">{latestNotification.title}</p>
              <p className="text-sm text-green-700 dark:text-green-300">{latestNotification.message}</p>
            </div>
            {unreadCount > 1 && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 dark:bg-green-500">
                <span className="text-xs font-bold text-white">{unreadCount}</span>
              </div>
            )}
          </div>
        </div>
      )}
      {notifLoading && (
        <div className="p-4">
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="text-sm text-slate-500 dark:text-slate-400">Cargando notificaciones...</div>
          </div>
        </div>
      )}

      <div className={`grid ${isMobileCoordinator ? "grid-cols-2" : "grid-cols-2"} gap-4 p-4`}>
        {quickActions.map((action, index) => {
          const icon = action.icon;
          const isCoordinatorOnly = action.roles?.includes("coordinator") && !action.roles?.includes("collaborator");

          return (
            <button
              key={index}
              onClick={() => {
                if (!action.disabled) onNavigate(action.view);
              }}
              disabled={action.disabled}
              className={`relative flex flex-col flex-1 gap-3 rounded-xl border p-4 text-left shadow-sm transition-transform
    ${action.disabled ? "opacity-40 cursor-not-allowed bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-600" : "bg-white hover:scale-[1.02] active:scale-[0.98] dark:bg-slate-900/70 border-slate-200 dark:border-slate-600"}`}
            >
              {(action as any).badge && <span className="absolute top-4 right-4 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-blue-500 text-white uppercase z-10">{(action as any).badge}</span>}
              <FontAwesomeIcon icon={icon} className={`h-5 w-5 ${isCoordinatorOnly ? "text-blue-600 dark:text-blue-400" : "text-primary"}`} />
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-bold leading-tight text-slate-900 dark:text-slate-100">{action.title}</h2>
                <p className="text-sm font-normal leading-normal text-slate-500 dark:text-slate-400">{action.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      <h3 className="px-4 pb-2 pt-4 text-lg font-bold leading-tight tracking-[-0.015em] text-slate-900 dark:text-slate-100">Actividad Reciente</h3>

      {activityLoading ? (
        <div className="flex flex-col gap-3 px-4">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl bg-white p-3 shadow-sm dark:bg-slate-900/70">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700" />
              <div className="flex-1">
                <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : recentActivity.length > 0 ? (
        <div className="flex flex-col gap-3 px-4">
          {recentActivity.map((activity) => {
            const icon = getActivityIcon(activity.action);
            const colors = getActivityColor(activity.action);
            return (
              <div key={activity._id} className="flex items-center gap-4 rounded-xl bg-white p-3 shadow-sm dark:bg-slate-900/70">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${colors.bg}`}>
                  <FontAwesomeIcon icon={icon} className={`h-5 w-5 ${colors.icon}`} />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-800 dark:text-slate-200">{activity.description}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{formatTimeAgo(activity.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-4">
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="text-sm text-slate-500 dark:text-slate-400">No hay actividad reciente</p>
          </div>
        </div>
      )}
    </div>
  );
}
