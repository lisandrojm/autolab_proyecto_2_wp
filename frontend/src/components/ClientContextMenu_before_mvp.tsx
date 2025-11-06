// ClientContextMenu.tsx (reemplazo completo del componente exportado)

import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useClientContextStore } from "../stores/clientContextStore";
import { useAuthStore } from "../stores/authStore";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faPalette, faLayerGroup, faBullhorn, faImage, faUsers } from "@fortawesome/free-solid-svg-icons";
import axios from "../api/axiosConfig";
import { getBrandKitStatus, getBrandKitLabel, getClientStatusLabel } from "../utils/clientStatus";
import { createNavbarEventListener } from "../utils/navbarEvents";

interface MenuCounts {
  projects: number;
  campaigns: number;
  posts: number;
  users: number;
}

const countClientUsersSafely = (clientData: any): number => {
  if (!clientData) return 0;
  if (Array.isArray(clientData.assignedUsersResolved)) return clientData.assignedUsersResolved.length;
  if (Array.isArray(clientData.usuarios)) return clientData.usuarios.length;
  return 0;
};

export const ClientContextMenu: React.FC = () => {
  const { selectedClient, setSelectedClient } = useClientContextStore();
  const { hasPermission } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<MenuCounts>({ projects: 0, campaigns: 0, posts: 0, users: 0 });

  useEffect(() => {
    if (!selectedClient?._id) return;

    const fetchCounts = async () => {
      try {
        const [projectsRes, campaignsRes, postsRes] = await Promise.allSettled([axios.get(`/clients/${selectedClient._id}/projects/count`), axios.get("/campaigns/count", { params: { clientId: selectedClient._id } }), axios.get("/posts/count", { params: { clientId: selectedClient._id } })]);

        // === Usuarios del cliente ===
        // Si tengo permiso de sistema, puedo pegarle a /users; si no, cuento desde /clients/:id
        let usersCount = 0;

        if (hasPermission("users:read")) {
          try {
            const usersRes = await axios.get("/users");
            const users = usersRes?.data?.users || [];
            usersCount = users.filter(
              (u: any) =>
                Array.isArray(u?.clientIds) &&
                u.clientIds.some((c: any) => {
                  const cid = typeof c === "string" ? c : c?._id;
                  return cid === selectedClient._id;
                })
            ).length;
          } catch {
            // fallback igual al de abajo si /users falla por cualquier motivo
            const clientRes = await axios.get(`/clients/${selectedClient._id}`);
            usersCount = countClientUsersSafely(clientRes?.data);
            // si trajimos un cliente más completo, dejémoslo en el store
            if (clientRes?.data) setSelectedClient(clientRes.data);
          }
        } else {
          // sin permiso: contamos desde el documento de cliente (que no requiere users:read)
          try {
            const clientRes = await axios.get(`/clients/${selectedClient._id}`);
            usersCount = countClientUsersSafely(clientRes?.data);
            if (clientRes?.data) setSelectedClient(clientRes.data);
          } catch {
            // último recurso: /clients?ids= o /clients/mine
            try {
              const listRes = await axios.get("/clients", { params: { ids: selectedClient._id } });
              const first = Array.isArray(listRes?.data) ? listRes.data[0] : null;
              usersCount = countClientUsersSafely(first);
            } catch {
              try {
                const mineRes = await axios.get("/clients/mine");
                const mine = (Array.isArray(mineRes?.data) ? mineRes.data : []).find((c: any) => String(c?._id) === String(selectedClient._id));
                usersCount = countClientUsersSafely(mine);
              } catch {
                usersCount = 0;
              }
            }
          }
        }

        setCounts({
          projects: projectsRes.status === "fulfilled" ? projectsRes.value?.data?.count || 0 : 0,
          campaigns: campaignsRes.status === "fulfilled" ? campaignsRes.value?.data?.count || 0 : 0,
          posts: postsRes.status === "fulfilled" ? postsRes.value?.data?.count || 0 : 0,
          users: usersCount,
        });
      } catch (error) {
        console.error("Error fetching menu counts:", error);
      }
    };

    fetchCounts();

    // === Listeners que mantienen el contador sincronizado ===
    const cleanups: Array<() => void> = [];

    cleanups.push(
      createNavbarEventListener("projectsChanged", (detail) => {
        if (!detail.clientId || detail.clientId === selectedClient._id) {
          axios
            .get(`/clients/${selectedClient._id}/projects/count`)
            .then((res) => setCounts((p) => ({ ...p, projects: res.data?.count || 0 })))
            .catch(() => {});
        }
      })
    );

    cleanups.push(
      createNavbarEventListener("campaignsChanged", (detail) => {
        if (!detail.clientId || detail.clientId === selectedClient._id) {
          axios
            .get("/campaigns/count", { params: { clientId: selectedClient._id } })
            .then((res) => setCounts((p) => ({ ...p, campaigns: res.data?.count || 0 })))
            .catch(() => {});
        }
      })
    );

    cleanups.push(
      createNavbarEventListener("postsChanged", (detail) => {
        if (!detail.clientId || detail.clientId === selectedClient._id) {
          axios
            .get("/posts/count", { params: { clientId: selectedClient._id } })
            .then((res) => setCounts((p) => ({ ...p, posts: res.data?.count || 0 })))
            .catch(() => {});
        }
      })
    );

    // 🔁 Importante: para 'usersChanged' ya no llamamos /users si no hay permiso
    cleanups.push(
      createNavbarEventListener("usersChanged", () => {
        const refreshUsers = async () => {
          try {
            if (hasPermission("users:read")) {
              const usersRes = await axios.get("/users");
              const users = usersRes?.data?.users || [];
              const n = users.filter((u: any) => Array.isArray(u?.clientIds) && u.clientIds.some((c: any) => (typeof c === "string" ? c : c?._id) === selectedClient._id)).length;
              setCounts((p) => ({ ...p, users: n }));
            } else {
              const clientRes = await axios.get(`/clients/${selectedClient._id}`);
              const n = countClientUsersSafely(clientRes?.data);
              if (clientRes?.data) setSelectedClient(clientRes.data);
              setCounts((p) => ({ ...p, users: n }));
            }
          } catch {
            // silencio; no rompemos UI
          }
        };
        refreshUsers();
      })
    );

    return () => cleanups.forEach((fn) => fn());
  }, [selectedClient?._id, hasPermission, setSelectedClient]);

  if (!selectedClient) return null;

  const clientStatus = selectedClient.status || "active";
  const brandKitStatus = getBrandKitStatus(selectedClient);

  const contextMenuItems = [
    {
      path: `/cliente/${selectedClient._id}/info-basica`,
      actualPath: `/cliente/${selectedClient._id}/info-basica`,
      icon: faUser,
      label: "Información",
      permission: "clients:view",
      scope: "cliente" as const,
      badge: { type: "status" as const, value: clientStatus },
    },
    {
      path: `/cliente/${selectedClient._id}/brand-kit`,
      actualPath: `/cliente/${selectedClient._id}/brand-kit`,
      icon: faPalette,
      label: "Brand Kit",
      permission: "clients:view",
      scope: "cliente" as const,
      badge: brandKitStatus !== "pending" ? { type: "status" as const, value: brandKitStatus } : undefined,
    },
    {
      path: `/clients/${selectedClient._id}/projects`,
      actualPath: `/clients/${selectedClient._id}/projects`,
      icon: faLayerGroup,
      label: "Proyectos",
      permission: "clients:view",
      scope: "cliente" as const,
      badge: { type: "count" as const, value: counts.projects },
    },
    {
      path: `/cliente/${selectedClient._id}/campanas`,
      actualPath: `/cliente/${selectedClient._id}/campanas`,
      icon: faBullhorn,
      label: "Campañas",
      permission: "clients:view",
      scope: "cliente" as const,
      badge: { type: "count" as const, value: counts.campaigns },
    },
    {
      path: `/cliente/${selectedClient._id}/posts`,
      actualPath: `/cliente/${selectedClient._id}/posts`,
      icon: faImage,
      label: "Publicaciones",
      permission: "clients:view",
      scope: "cliente" as const,
      badge: { type: "count" as const, value: counts.posts },
    },
    {
      path: `/cliente/${selectedClient._id}/usuarios`,
      actualPath: `/cliente/${selectedClient._id}/usuarios`,
      icon: faUsers,
      label: "Usuarios del Cliente",
      permission: "clients:view",
      scope: "cliente" as const,
      badge: { type: "count" as const, value: counts.users },
    },
  ];

  const isActive = (path: string) => location.pathname === path;
  const handleNavigation = (actualPath: string) => navigate(actualPath);

  const getBadgeStyles = (status: string) => {
    switch (status) {
      case "active":
        return "bg-blue-100/20 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "inactive":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "onboarding":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "complete":
        return "bg-blue-100/20 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "partial":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
    }
  };

  const getBadgeLabel = (status: string) => {
    if (status === "complete" || status === "partial" || status === "pending") {
      return getBrandKitLabel(status as any);
    }
    if (status === "active" || status === "inactive" || status === "onboarding") {
      return getClientStatusLabel(status);
    }
    return status;
  };

  return (
    <div>
      <nav className="space-y-1 mt-2">
        {contextMenuItems.map((item) => {
          if (!hasPermission(item.permission)) return null;
          const active = isActive(item.path);
          return (
            <button key={item.path} onClick={() => handleNavigation(item.actualPath)} aria-current={active ? "page" : undefined} className={`group w-full relative flex items-center justify-between px-2 py-2 rounded-lg text-left transition-all ${active ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-l-3 border-primary-600 dark:border-primary-400" : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-blue-900/30"}`}>
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <FontAwesomeIcon icon={item.icon} className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm font-medium truncate">{item.label}</span>
              </div>
              {item.badge && <div className="ml-2 flex-shrink-0">{item.badge.type === "count" ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${item.badge.value > 0 ? "bg-slate-500/20 text-slate-500 dark:bg-white/20 dark:text-white" : "bg-red-500/20 text-red-700 dark:bg-red-500/20 dark:text-red-400"}`}>{item.badge.value}</span> : <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getBadgeStyles(item.badge.value)}`}>{getBadgeLabel(item.badge.value)}</span>}</div>}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
