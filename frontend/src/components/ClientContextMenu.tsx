import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useClientContextStore } from "../stores/clientContextStore";
import { useAuthStore } from "../stores/authStore";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInfoCircle, faLayerGroup } from "@fortawesome/free-solid-svg-icons";

export const ClientContextMenu: React.FC = () => {
  const { selectedClient, setSelectedClient } = useClientContextStore();
  const { hasPermission } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  // Validate user access to client (simplified check if needed, or rely on ProtectedRoute/API)
  useEffect(() => {
    // Logic to potentially re-validate or refresh client could go here if needed.
    // For now, removing the heavy count fetching logic as badges are removed.
  }, [selectedClient, hasPermission, setSelectedClient]);

  if (!selectedClient) return null;

  const contextMenuItems = [
    {
      path: `/clients/${selectedClient._id}`,
      actualPath: `/clients/${selectedClient._id}`,
      icon: faInfoCircle,
      label: "Información",
      permission: "clients:view",
      scope: "cliente" as const,
    },

    {
      path: `/clients/${selectedClient._id}/projects`,
      actualPath: `/clients/${selectedClient._id}/projects`,
      icon: faLayerGroup,
      label: "Proyectos",
      permission: "clients:view",
      scope: "cliente" as const,
    },
  ];

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/");
  const handleNavigation = (actualPath: string) => navigate(actualPath);

  return (
    <div>
      <nav className="space-y-1 mt-2 pl-2 border-l-2 border-gray-100 dark:border-gray-700 ml-1">
        {contextMenuItems.map((item) => {
          if (!hasPermission(item.permission)) return null;
          const active = isActive(item.actualPath);
          return (
            <button key={item.path} onClick={() => handleNavigation(item.actualPath)} aria-current={active ? "page" : undefined} className={`group w-full relative flex items-center justify-between px-2 py-2 rounded-lg text-left transition-all ${active ? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300" : "text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-blue-900/30"}`}>
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <FontAwesomeIcon icon={item.icon} className={`h-4 w-4 flex-shrink-0 ${active ? "text-primary-600 dark:text-primary-400" : "text-gray-400"}`} />
                <span className="text-sm font-medium truncate">{item.label}</span>
              </div>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
