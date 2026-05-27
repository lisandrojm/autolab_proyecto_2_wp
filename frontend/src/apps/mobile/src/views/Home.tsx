import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faShoppingCart, faUmbrellaBeach, faFileAlt, faReceipt, faUsers, faChartBar, faBell, faSun, faMoon, faSignOutAlt, faUserPlus } from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";
import { useAuthStore } from "../../../../stores/authStore";
import { useNotifications } from "../hooks/useNotifications";
import { useThemeStore } from "../../../../stores/themeStore";
import UserHeader from "../components/UserHeader";
import { useProfile } from "../hooks/useProfile";
import { ProfileData } from "../../../../api/personnel";

interface HomeProps {
  onNavigate: (view: ViewType) => void;
}

export default function Home({ onNavigate }: HomeProps) {
  const { user, logout } = useAuthStore();
  const { notifications, unreadCount, loading: notifLoading } = useNotifications();
  const { theme, toggleTheme } = useThemeStore();
  const { profile } = useProfile();

  // FIX: Check permissions directly to avoid Admin global override
  const isMobileCoordinator = user?.permissions?.includes("mobile_coordinator:view");
  const isMobileCollaborator = user?.permissions?.includes("mobile_collaborator:view");

  const latestNotification = notifications.find((n) => !n.isRead);

  const hasActiveContract = (p: ProfileData | null): boolean => {
    if (!p || !p.metadata?.projects) return false;
    let hasActive = false;
    p.metadata.projects.forEach((proj: any) => {
      if (proj.contracts) {
        proj.contracts.forEach((c: any) => {
          const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
          const isActive = !endDate || endDate >= new Date();
          if (isActive) hasActive = true;
        });
      }
    });
    return hasActive;
  };

  // ⬇️ QUICK ACTIONS — badgeBg y badgeText
  const novedadesAction = {
    icon: faFileAlt,
    title: "Novedades",
    description: "Gestión de novedades",
    view: "activity_logs" as ViewType,
    roles: ["coordinator"],
    disabled: false,
  };

  const vacationsAction = {
    icon: faUmbrellaBeach,
    title: "Vacaciones",
    description: "Solicitá tus días libres",
    view: "vacations" as ViewType,
    roles: ["coordinator", "collaborator"],
    disabled: false,
    /*       badge: "New", */
    badgeBg: "bg-red-500",
    badgeText: "text-white",
  };

  const ordersAction = {
    icon: faShoppingCart,
    title: "Pedidos",
    description: "Gestiona tus pedidos",
    view: "orders" as ViewType,
    roles: ["coordinator", "collaborator"],
    disabled: false,
    /*       badge: "Finish", */
    badgeBg: "bg-blue-500",
    badgeText: "text-white",
  };

  const legajosAction = {
    icon: faFileAlt,
    title: "Legajos",
    description: "Consultá tus documentos",
    view: "documents" as ViewType,
    roles: ["coordinator", "collaborator"],
    disabled: true,
  };

  const userCreateAction = {
    icon: faUserPlus,
    title: "Usuarios",
    description: "Alta de usuarios",
    view: "user_history" as ViewType,
    roles: ["mobile-coordinador"],
    disabled: false,
  };

  const recibosAction = {
    icon: faReceipt,
    title: "Recibos",
    description: "Accedé a tus nóminas",
    view: "documents" as ViewType,
    roles: ["coordinator", "collaborator"],
    disabled: true,
  };

  const teamAction = {
    icon: faUsers,
    title: "Gestión de Equipo",
    description: "Administra tu equipo",
    view: "home" as ViewType,
    roles: ["coordinator"],
    disabled: true,
  };

  const reportsAction = {
    icon: faChartBar,
    title: "Reportes",
    description: "Ver métricas y estadísticas",
    view: "home" as ViewType,
    roles: ["coordinator"],
    disabled: true,
  };

  // Construct quickActions based on role and desired order
  const quickActions = [];

  if (isMobileCoordinator) {
    quickActions.push(novedadesAction);
  }

  if (hasActiveContract(profile) || isMobileCollaborator) {
    quickActions.push(ordersAction);
  } else {
    quickActions.push({
      ...ordersAction,
      disabled: true,
      description: "Sin contrato activo",
    });
  }

  // Only show vacations if enabled or mobile collaborator
  if (isMobileCollaborator || (profile?.vacationsEnabled !== false && hasActiveContract(profile))) {
    quickActions.push(vacationsAction);
  } else {
    // Show disabled if no active contract or globally disabled
    quickActions.push({
      ...vacationsAction,
      disabled: true,
      description: hasActiveContract(profile) ? "Módulo deshabilitado" : "Sin contrato activo",
      title: "Vacaciones",
    });
  }

  if (isMobileCoordinator) {
    quickActions.push(userCreateAction);
  }

  quickActions.push(legajosAction);
  quickActions.push(recibosAction);

  if (isMobileCoordinator) {
    quickActions.push(teamAction);
    quickActions.push(reportsAction);
  }

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  return (
    <div className="flex-1 pb-24">
      {/* HEADER */}
      <div className="flex items-center justify-between px-4 pt-4">
        <UserHeader user={user} />

        <div className="flex items-center gap-1">
          <button onClick={toggleTheme} className="flex h-10 w-10 items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <FontAwesomeIcon icon={theme === "dark" ? faSun : faMoon} className="w-5 h-5" />
          </button>

          <button onClick={handleLogout} className="flex h-10 w-10 items-center justify-center rounded text-red-600 dark:text-red-400 hover:text-gray-800 dark:hover:text-gray-300 transition-colors">
            <FontAwesomeIcon icon={faSignOutAlt} className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* NOTIFICACIÓN DESTACADA */}
      {!notifLoading && latestNotification && (
        <div className="p-4">
          <div className="flex items-start gap-3 rounded-xl border border-green-500 bg-green-50 p-4 shadow-sm dark:border-green-400 dark:bg-green-900/40">
            <FontAwesomeIcon icon={faBell} className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-green-800 dark:text-green-100">{latestNotification.title}</p>
              <p className="text-sm text-green-700 dark:text-green-300">{latestNotification.message}</p>
            </div>
            {unreadCount > 1 && (
              <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-600 dark:bg-green-500">
                <span className="text-xs font-bold text-white">{unreadCount}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* GRID */}
      <div className={`grid grid-cols-2 gap-4 p-4`}>
        {quickActions.map((action, index) => {
          return (
            <button
              key={index}
              onClick={() => {
                if (action.disabled) return;
                if ((action as any).onClick) {
                  (action as any).onClick();
                } else {
                  onNavigate(action.view);
                }
              }}
              disabled={action.disabled}
              className={`relative flex flex-col gap-3 space-y-2 rounded-xl border p-4 text-left shadow-sm transition-transform
                ${action.disabled ? "opacity-40 cursor-not-allowed bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-600" : "bg-white hover:scale-[1.02] active:scale-[0.98] dark:bg-slate-900/70 border-slate-200 dark:border-slate-600"}`}
            >
              {/* BADGE */}
              <div>{(action as any).badge && <span className={`absolute top-4 right-4 rounded px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide ${(action as any).badgeBg} ${(action as any).badgeText}`}>{(action as any).badge}</span>}</div>
              <div className="flex-col gap-1 items-center space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex items-center">
                    <FontAwesomeIcon icon={action.icon} className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{action.title}</h2>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{action.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
