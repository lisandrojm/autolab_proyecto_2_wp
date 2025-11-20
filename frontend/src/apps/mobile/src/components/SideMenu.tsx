import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBuilding,
  faUser,
  faUserShield,
  faRightFromBracket,
  faTimes
} from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";
import { useAuthStore } from "../../../../stores/authStore";
import { useEffect, useRef } from "react";

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: ViewType) => void;
  userRole?: "coordinator" | "collaborator" | null;
}

export default function SideMenu({
  isOpen,
  onClose,
  onNavigate,
  userRole
}: SideMenuProps) {
  const { user, logout } = useAuthStore();
  const menuRef = useRef<HTMLDivElement>(null);

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
    : "Admin";

  const menuItems = [
    {
      title: "Mis Pedidos",
      view: "orders" as ViewType,
      disabled: false,
    },
    {
      title: "Solicitar Vacaciones",
      view: "vacations" as ViewType,
      disabled: false,
    },
    {
      title: "Mis Contratos",
      view: "documents" as ViewType,
      disabled: false,
    },
    {
      title: "Mis Recibos",
      view: "documents" as ViewType,
      disabled: false,
    },
  ];

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
        className={`fixed top-0 left-0 h-full w-[75%] max-w-xs bg-slate-800 dark:bg-slate-900 z-50 shadow-2xl transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
      >
        {/* Header con logo y botón cerrar */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">
            We<span className="text-blue-400">Produ</span>
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            aria-label="Cerrar menú"
          >
            <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
          </button>
        </div>

        {/* Opciones del menú */}
        <div className="flex flex-col p-4 gap-3">
          {menuItems.map((item, index) => (
            <button
              key={index}
              onClick={() => !item.disabled && handleNavigation(item.view)}
              disabled={item.disabled}
              className={`w-full text-left px-4 py-3 rounded-lg border border-slate-600 text-white font-medium transition-all ${
                item.disabled
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-slate-700 hover:border-slate-500 active:scale-[0.98]"
              }`}
            >
              {item.title}
            </button>
          ))}
        </div>

        {/* Footer con badges y logout */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-700 p-4 bg-slate-800 dark:bg-slate-900">
          {/* Badges */}
          <div className="flex flex-wrap gap-2 mb-3">
            {/* Tenant Badge */}
            {user?.tenantSlug && (
              <span className="inline-flex items-center capitalize font-medium px-2.5 py-1 rounded text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30">
                <FontAwesomeIcon icon={faBuilding} className="h-3 w-3 mr-1.5" />
                {user.tenantSlug}
              </span>
            )}

            {/* Usuario Badge */}
            {user?.firstName && (
              <span className="inline-flex items-center font-medium px-2.5 py-1 rounded text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30">
                <FontAwesomeIcon icon={faUser} className="h-3 w-3 mr-1.5" />
                {user.firstName}
              </span>
            )}

            {/* Rol Badge */}
            {userRoleLabel && (
              <span className="inline-flex items-center font-medium px-2.5 py-1 rounded text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30">
                <FontAwesomeIcon icon={faUserShield} className="h-3 w-3 mr-1.5" />
                {userRoleLabel}
              </span>
            )}
          </div>

          {/* Botón Logout */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-medium transition-colors"
          >
            <FontAwesomeIcon icon={faRightFromBracket} className="w-4 h-4" />
            Salir
          </button>
        </div>
      </div>
    </>
  );
}
