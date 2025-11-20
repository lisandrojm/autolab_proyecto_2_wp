import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBuilding,
  faUser,
  faUserShield,
  faRightFromBracket,
  faTimes
} from "@fortawesome/free-solid-svg-icons";
import {
  ShoppingCart,
  Umbrella,
  FileText,
  Receipt,
  CheckCircle,
  File
} from "lucide-react";
import { ViewType } from "../types";
import { useAuthStore } from "../../../../stores/authStore";
import { ActivityRecord } from "../../../../api/personnel";
import { useEffect, useRef } from "react";

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: ViewType) => void;
  recentActivity?: ActivityRecord[];
  userRole?: "coordinator" | "collaborator" | null;
}

export default function SideMenu({
  isOpen,
  onClose,
  onNavigate,
  recentActivity = [],
  userRole
}: SideMenuProps) {
  const { user, logout, hasPermission } = useAuthStore();
  const menuRef = useRef<HTMLDivElement>(null);

  const isMobileCoordinator = hasPermission("mobile:coordinator");

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  const handleNavigation = (view: ViewType) => {
    onNavigate(view);
    onClose();
  };

  const userRoleLabel = userRole === "coordinator"
    ? "Coordinador"
    : userRole === "collaborator"
    ? "Colaborador"
    : null;

  const baseActions = [
    {
      icon: ShoppingCart,
      title: "Mis Pedidos",
      description: "Gestiona tus pedidos",
      view: "orders" as ViewType,
      badge: "Nuevo",
    },
    {
      icon: Umbrella,
      title: "Solicitar Vacaciones",
      description: "Solicita tus días libres",
      view: "vacations" as ViewType,
      disabled: true,
    },
    {
      icon: FileText,
      title: "Mis Contratos",
      description: "Consulta tus documentos",
      view: "documents" as ViewType,
      disabled: true,
    },
    {
      icon: Receipt,
      title: "Mis Recibos",
      description: "Accede a tus nóminas",
      view: "documents" as ViewType,
      disabled: true,
    },
  ];

  const getActivityIcon = (action: string) => {
    if (action.includes("vacation")) return CheckCircle;
    if (action.includes("order")) return ShoppingCart;
    if (action.includes("document")) return File;
    return CheckCircle;
  };

  const getActivityColor = (action: string) => {
    if (action.includes("vacation"))
      return { bg: "bg-green-100 dark:bg-green-900/50", icon: "text-green-600 dark:text-green-400" };
    if (action.includes("order"))
      return { bg: "bg-blue-100 dark:bg-blue-900/50", icon: "text-blue-600 dark:text-blue-400" };
    if (action.includes("document"))
      return { bg: "bg-purple-100 dark:bg-purple-900/50", icon: "text-purple-600 dark:text-purple-400" };
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

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-50 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Side Menu */}
      <div
        ref={menuRef}
        className={`fixed top-0 left-0 h-full w-[85%] max-w-sm bg-white dark:bg-slate-900 z-50 shadow-2xl transform transition-transform duration-300 ease-in-out overflow-y-auto ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
      >
        {/* Header del menú con badges */}
        <div className="sticky top-0 bg-slate-900 dark:bg-slate-950 border-b border-slate-800 p-4 z-10">
          <div className="flex items-start justify-between mb-4">
            <div className="flex flex-col gap-2 flex-1">
              {/* Tenant Badge */}
              {user?.tenantSlug && (
                <span className="inline-flex items-center w-fit capitalize font-semibold px-3 py-1.5 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  <FontAwesomeIcon icon={faBuilding} className="h-3 w-3 mr-1.5" />
                  {user.tenantSlug}
                </span>
              )}

              {/* Usuario Badge */}
              {user?.firstName && (
                <span className="inline-flex items-center w-fit font-semibold px-3 py-1.5 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  <FontAwesomeIcon icon={faUser} className="h-3 w-3 mr-1.5" />
                  {user.firstName}
                </span>
              )}

              {/* Rol Badge */}
              {userRoleLabel && (
                <span className="inline-flex items-center w-fit font-semibold px-3 py-1.5 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  <FontAwesomeIcon icon={faUserShield} className="h-3 w-3 mr-1.5" />
                  {userRoleLabel}
                </span>
              )}
            </div>

            {/* Botón cerrar */}
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white hover:bg-slate-800 dark:hover:bg-slate-900 transition-colors"
              aria-label="Cerrar menú"
            >
              <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Contenido del menú */}
        <div className="p-4 pb-24">
          {/* Acciones rápidas */}
          <div className="mb-6">
            <div className="grid grid-cols-2 gap-3">
              {baseActions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <button
                    key={index}
                    onClick={() => !action.disabled && handleNavigation(action.view)}
                    disabled={action.disabled}
                    className={`relative flex flex-col gap-2 rounded-xl border p-3 text-left shadow-sm transition-all ${
                      action.disabled
                        ? "opacity-40 cursor-not-allowed bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-600"
                        : "bg-white hover:shadow-md active:scale-95 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {action.badge && (
                      <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-500 text-white uppercase">
                        {action.badge}
                      </span>
                    )}
                    <Icon className="h-5 w-5 text-slate-700 dark:text-slate-300" />
                    <div className="flex flex-col gap-0.5">
                      <h3 className="text-sm font-bold leading-tight text-slate-900 dark:text-slate-100">
                        {action.title}
                      </h3>
                      <p className="text-xs leading-tight text-slate-500 dark:text-slate-400">
                        {action.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actividad Reciente */}
          {recentActivity.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
                Actividad Reciente
              </h3>
              <div className="flex flex-col gap-2">
                {recentActivity.slice(0, 2).map((activity) => {
                  const Icon = getActivityIcon(activity.action);
                  const colors = getActivityColor(activity.action);
                  return (
                    <div
                      key={activity._id}
                      className="flex items-center gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3"
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colors.bg}`}>
                        <Icon className={`h-4 w-4 ${colors.icon}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {activity.description}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {formatTimeAgo(activity.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer con botón de logout */}
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
          >
            <FontAwesomeIcon icon={faRightFromBracket} className="w-4 h-4" />
            Cerrar Sesión
          </button>
        </div>
      </div>
    </>
  );
}
