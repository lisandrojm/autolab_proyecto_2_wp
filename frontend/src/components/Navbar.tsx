import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../stores/authStore";
import { useThemeStore } from "../stores/themeStore";
import { useAssistantStore } from "../stores/assistantStore";
import { ClientSelector } from "./ClientSelector";
import { ClientContextMenu } from "./ClientContextMenu";
import { Link, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faBars, faMoon, faSun, faRightFromBracket, faHouse, faUsers, faSquareCheck, faShield, faUserGear, faBuilding, faPalette, faArrowUpRightFromSquare, faCalendar, faRobot, faRocket, faChartLine, faCog, faUser, faUserShield, faChevronDown, faFileLines, faBell, faClipboardList, faCalendarCheck, faListCheck, faIdCard, faFileText, faBox } from "@fortawesome/free-solid-svg-icons";
import { rolesAPI } from "../api/roles";
import { Logo } from "../components/ui/Logo";
import axios from "../api/axiosConfig";
import { triggerVercelRedeploy, isDeployButtonVisible } from "../utils/vercelDeploy";
import { sweetAlert } from "../utils/sweetAlert";
import { SettingsModal } from "./SettingsModal";
import { useClientContextStore } from "../stores/clientContextStore";

function normalizeId(idLike: unknown): string | null {
  if (!idLike) return null;
  if (typeof idLike === "string") return idLike;
  if (typeof idLike === "object") {
    const anyId = idLike as any;
    if (typeof anyId.$oid === "string") return anyId.$oid;
    if (typeof anyId._id === "string") return anyId._id;
    if (anyId._id && typeof anyId._id === "object" && typeof anyId._id.$oid === "string") {
      return anyId._id.$oid;
    }
    if (typeof anyId.toString === "function") {
      const s = anyId.toString();
      if (/^[a-f0-9]{24}$/i.test(s)) return s;
      const m = s.match(/ObjectId\(["']?([a-f0-9]{24})["']?\)/i);
      if (m?.[1]) return m[1];
    }
  }
  return null;
}

function getActiveClientId(user: any): string | null {
  const direct = normalizeId(user?.activeClientId) || normalizeId(user?.currentClientId) || normalizeId(user?.clientId) || null;
  if (direct) return direct;

  const keys = ["selectedClientId", "currentClientId", "activeClientId", "clientId"];
  for (const k of keys) {
    const raw = localStorage.getItem(k);
    const parsed = normalizeId(raw);
    if (parsed) return parsed;
  }
  return null;
}

interface AdminCounts {
  clients: number;
  tasks: number;
  tenants: number;
  roles: number;
  users: number;
}

type DeployMeta = {
  shortSha?: string;
  sha?: string;
  createdAt?: number;
  url?: string;
  branch?: string;
  commitMessage?: string;
};

function formatDateTime(epochMs?: number) {
  if (!epochMs) return "";
  try {
    return new Date(epochMs).toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export const MobileNavbar: React.FC = () => {
  const { t } = useTranslation();
  const { user, logout, hasPermission } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const { openAssistant } = useAssistantStore();
  const { selectedClient } = useClientContextStore();
  const [open, setOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [adminAccordionOpen, setAdminAccordionOpen] = useState(true);
  const location = useLocation();
  const [adminCounts, setAdminCounts] = useState<AdminCounts>({ clients: 0, tasks: 0, tenants: 0, roles: 0, users: 0 });
  const [roleMap, setRoleMap] = useState<Record<string, string>>({});
  const [isDeploying, setIsDeploying] = useState(false);

  const [deployMeta, setDeployMeta] = useState<DeployMeta | null>(null);
  const [deployMetaLoading, setDeployMetaLoading] = useState(false);
  const [deployMetaError, setDeployMetaError] = useState<string | null>(null);

  const creativeWinRef = useRef<Window | null>(null);

  // Mostrar/ocultar badges numéricos (sólo visual)
  const SHOW_MENU_COUNTS = false;

  useEffect(() => {
    if (!hasPermission("roles:view")) return;
    let mounted = true;
    (async () => {
      try {
        const roles = await rolesAPI.listAll();
        if (!mounted) return;
        const map: Record<string, string> = {};
        roles.forEach((r) => (map[r._id] = r.name));
        setRoleMap(map);
      } catch (error) {
        console.warn("Could not load roles:", error);
        if (!mounted) return;
        setRoleMap({});
      }
    })();
    return () => {
      mounted = false;
    };
  }, [hasPermission]);

  useEffect(() => {
    const fetchAdminCounts = async () => {
      try {
        const promises: Array<Promise<any>> = [];

        if (hasPermission("clients:view")) promises.push(axios.get("/clients/count").catch(() => ({ data: { count: 0 } })));
        else promises.push(Promise.resolve({ data: { count: 0 } }));

        if (hasPermission("tasks:view")) promises.push(axios.get("/tasks/count").catch(() => ({ data: { count: 0 } })));
        else promises.push(Promise.resolve({ data: { count: 0 } }));

        if (hasPermission("tenants:view")) promises.push(axios.get("/tenants/count").catch(() => ({ data: { count: 0 } })));
        else promises.push(Promise.resolve({ data: { count: 0 } }));

        if (hasPermission("roles:view")) promises.push(axios.get("/roles/count").catch(() => ({ data: { count: 0 } })));
        else promises.push(Promise.resolve({ data: { count: 0 } }));

        // users con fallback a usuarios del cliente activo
        let usersCount = 0;
        const activeClientId = getActiveClientId(user);

        const tryFetchClientUsers = async (): Promise<number> => {
          if (!activeClientId) return 0;
          try {
            const r1 = await axios.get(`/clients/${activeClientId}`);
            const d1 = r1?.data || {};
            const list1 = Array.isArray(d1.assignedUsersResolved) ? d1.assignedUsersResolved : Array.isArray(d1.usuarios) ? d1.usuarios : [];
            if (list1.length >= 0) return list1.length;
          } catch {}
          try {
            const r2 = await axios.get(`/clients`, { params: { ids: activeClientId } });
            const arr = Array.isArray(r2?.data) ? r2.data : [];
            const first = arr[0] || {};
            const list2 = Array.isArray(first.assignedUsersResolved) ? first.assignedUsersResolved : Array.isArray(first.usuarios) ? first.usuarios : [];
            if (list2.length >= 0) return list2.length;
          } catch {}
          try {
            const r3 = await axios.get(`/clients/mine`);
            const arr3 = Array.isArray(r3?.data) ? r3.data : [];
            const target = arr3.find((c: any) => normalizeId(c?._id) === activeClientId) || {};
            const list3 = Array.isArray(target.assignedUsersResolved) ? target.assignedUsersResolved : Array.isArray(target.usuarios) ? target.usuarios : [];
            if (list3.length >= 0) return list3.length;
          } catch {}
          return 0;
        };

        if (hasPermission("users:view")) {
          promises.push(axios.get("/users/count").catch(() => ({ data: { count: 0 } })));
        } else {
          promises.push(Promise.resolve({ data: { count: 0 } }));
          usersCount = await tryFetchClientUsers();
        }

        const [clientsRes, tasksRes, tenantsRes, rolesRes, usersRes] = await Promise.all(promises);

        setAdminCounts({
          clients: clientsRes?.data?.count || 0,
          tasks: tasksRes?.data?.count || 0,
          tenants: tenantsRes?.data?.count || 0,
          roles: rolesRes?.data?.count || 0,
          users: hasPermission("users:view") ? usersRes?.data?.count || 0 : usersCount,
        });
      } catch (error) {
        console.error("Error fetching admin counts:", error);
      }
    };
    fetchAdminCounts();
  }, [hasPermission, user]);

  useEffect(() => {
    if (selectedClient) setAdminAccordionOpen(false);
    else setAdminAccordionOpen(true);
  }, [selectedClient]);

  useEffect(() => {
    if (user?.tenantSlug === "superadmin") setAdminAccordionOpen(true);
  }, [user?.tenantSlug]);

  const userRoleNames = useMemo(() => {
    if (Array.isArray(user?.roles) && user.roles.length > 0) {
      if (typeof user.roles[0] === "string") return [...new Set(user.roles)];
      if (typeof user.roles[0] === "object" && user.roles[0] !== null) {
        const names = user.roles.map((r: any) => r.name || r).filter((n): n is string => typeof n === "string");
        return [...new Set(names)];
      }
    }
    return user?.primaryRole ? [user.primaryRole] : [];
  }, [user?.roles, user?.primaryRole]);

  const hasAnyPermission = (...perms: string[]) => perms.some(hasPermission);

  const isClientView = useMemo(() => {
    if (!user) return true;
    if (user.tenantSlug === "superadmin") return false;
    const adminish = hasAnyPermission("clients:view", "users:view", "roles:view", "tenants:view", "platform:settings", "platform:usage") || false;
    return !adminish;
  }, [user, hasPermission]);

  const menuItems = useMemo(() => {
    const isSuperAdminTenant = user?.tenantSlug === "superadmin";

    const base: Array<{
      path: string;
      icon: any;
      label: string;
      external?: boolean;
      scope?: "global" | "client";
      count?: number;
      dividerTop?: boolean;
      isCreativeSuite?: boolean;
    }> = [];

    if (isSuperAdminTenant) {
      base.push({ path: "/dashboard", icon: faHouse, label: "Dashboard", scope: "global" }, { path: "/tenants", icon: faBuilding, label: "Tenants", scope: "global", count: adminCounts.tenants }, { path: "/platform/usage", icon: faChartLine, label: "Planes y Uso", scope: "global" }, { path: "/platform/settings", icon: faCog, label: "Configuración Global", scope: "global" });
    } else {
      if (hasPermission("roles:view")) base.push({ path: "/roles", icon: faShield, label: "Roles", scope: "global", count: adminCounts.roles });
      if (hasPermission("users:view")) base.push({ path: "/users", icon: faUserGear, label: "Usuarios del Sistema", scope: "global", count: adminCounts.users });

      if (hasPermission("activityLogs:view")) base.push({ path: "/hr/activity-logs", icon: faFileText, label: "Registro de Actividades", scope: "global", dividerTop: true });
      if (hasPermission("calendarEvents:view")) base.push({ path: "/hr/calendar-events", icon: faCalendar, label: "Calendario", scope: "global" });
      if (hasPermission("employeeProfiles:view")) base.push({ path: "/hr/employee-profiles", icon: faUsers, label: "Perfiles de Empleados", scope: "global" });
      if (hasPermission("hrDocuments:view")) base.push({ path: "/hr/documents", icon: faFileText, label: "Documentos RRHH", scope: "global" });
      if (hasPermission("orders:view")) base.push({ path: "/hr/orders", icon: faBox, label: "Pedidos", scope: "global" });
      if (hasPermission("vacationRequests:view")) base.push({ path: "/hr/vacation-requests", icon: faCalendar, label: "Solicitudes de Vacaciones", scope: "global" });

      if (hasPermission("creative:view")) {
        base.push({
          path: import.meta.env.VITE_CREATIVE_SUITE_URL || "https://autolab.fun",
          icon: faPalette,
          label: "Creative Suite",
          external: false,
          scope: "global",
          dividerTop: true,
          isCreativeSuite: true,
        });
      }
    }

    return base;
  }, [hasPermission, adminCounts, user?.tenantSlug]);

  const handleMenuClick = (e: React.MouseEvent<HTMLAnchorElement>, item: any) => {
    if (item.external && item.label === "Creative Suite") {
      e.preventDefault();
      const url = item.path as string;
      const windowName = "creativeSuite";
      if (creativeWinRef.current && !creativeWinRef.current.closed) {
        creativeWinRef.current.focus();
      } else {
        creativeWinRef.current = window.open(url, windowName);
      }
    }
  };

  const handleRedeploy = async () => {
    const result = await sweetAlert.confirm("Confirmar Redeploy", "¿Estás seguro de que deseas iniciar un nuevo despliegue en Vercel? Esto puede tomar varios minutos.", "Redeploy");
    if (!result.isConfirmed) return;
    setIsDeploying(true);
    const response = await triggerVercelRedeploy();
    setIsDeploying(false);
    if (response.success) {
      await sweetAlert.success("Redeploy Iniciado", response.message);
    } else {
      await sweetAlert.error("Error", response.message);
    }
  };

  const loadDeployMeta = async () => {
    if (deployMeta || deployMetaLoading) return;
    try {
      setDeployMetaLoading(true);
      setDeployMetaError(null);
      const { data } = await axios.get("/vercel/last-deploy");
      setDeployMeta(data);
    } catch (e: any) {
      setDeployMetaError("No se pudo leer el último deploy");
    } finally {
      setDeployMetaLoading(false);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  const RoleChips: React.FC<{ className?: string }> = ({ className = "text-[9px]" }) =>
    userRoleNames.length ? (
      <div className="flex flex-wrap gap-1">
        {userRoleNames.map((label) => (
          <div key={label} className={`flex text-transform: capitalize font-semibold items-center justify-center px-3 py-1 rounded-full ${className} text-xs bg-primary-100 text-primary-800 dark:bg-blue-900/30 dark:text-primary-300`}>
            <FontAwesomeIcon icon={faUserShield} className="h-3 w-3 mr-1.5" />
            {label}
          </div>
        ))}
      </div>
    ) : (
      <div className="mt-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full ${className} font-medium bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-300 uppercase`}>{user?.primaryRole ?? "user"}</span>
      </div>
    );

  const UserCard: React.FC = () => {
    const displayName = user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.firstName || user?.lastName || user?.email || "Usuario";
    return (
      <div>
        {user?.tenantSlug && (
          <div className="flex flex-col lg:flex-row gap-2 w-full lg:justify-between items-start lg:px-2 ">
            <div className="flex gap-2 items-center">
              <div>
                <span className="flex text-transform: capitalize font-semibold items-center justify-center px-3 py-1 rounded-full text-xs bg-primary-100 text-primary-800 dark:bg-blue-900/30 dark:text-primary-300" title={user.tenantSlug}>
                  <FontAwesomeIcon icon={faBuilding} className="h-3 w-3 mr-1.5" />
                  {user.tenantSlug}
                </span>
              </div>
              <div>
                <p className="flex text-transform: capitalize font-semibold items-center justify-center px-3 py-1 rounded-full text-xs bg-primary-100 text-primary-800 dark:bg-blue-900/30 dark:text-primary-300" title={displayName}>
                  <FontAwesomeIcon icon={faUser} className="h-3 w-3 mr-1.5" /> {displayName}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              <RoleChips />
            </div>
          </div>
        )}
      </div>
    );
  };

  const NavMenu: React.FC<{ onItemClick?: () => void }> = ({ onItemClick }) => {
    const adminItems = menuItems.filter((item) => !item.isCreativeSuite);
    const creativeSuiteItem = menuItems.find((item) => item.isCreativeSuite);

    const renderMenuItem = (item: any) => {
      if (item.external) {
        return (
          <a
            key={item.path}
            href={item.path}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              handleMenuClick(e, item);
              onItemClick?.();
            }}
            className="group flex items-center justify-between px-2 py-2 transition-colors text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <div className="flex items-center space-x-3">
              <FontAwesomeIcon icon={item.icon} className="h-5 w-5" />
              <span className="font-medium">{item.label}</span>
            </div>
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
          </a>
        );
      }

      if (item.path === "#") {
        return (
          <button
            key={item.label}
            onClick={() => {
              setIsSettingsOpen(true);
              onItemClick?.();
            }}
            className="group relative flex items-center justify-between px-2 py-2 rounded-lg transition-all w-full text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-blue-900/50"
          >
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <FontAwesomeIcon icon={item.icon} className="h-5 w-5 flex-shrink-0" />
              <span className="font-medium truncate">{item.label}</span>
            </div>
            {SHOW_MENU_COUNTS && item.count !== undefined && <span className={`ml-2 flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${item.count > 0 ? "bg-slate-500/20 text-slate-500 dark:bg-white/20 dark:text-white" : "bg-red-500/20 text-red-700 dark:bg-red-500/20 dark:text-red-400"}`}>{item.count}</span>}
          </button>
        );
      }

      return (
        <Link key={item.path} to={item.path} onClick={onItemClick} aria-current={isActive(item.path) ? "page" : undefined} className={`group relative flex items-center justify-between px-2 py-2 rounded-lg transition-all ${isActive(item.path) ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-blue-300 dark:border-blue-800" : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-blue-900/50"}`}>
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <div className={`h-8 w-8 flex items-center justify-center rounded-md transition-colors ${isActive(item.path) ? "bg-primary-600 text-white dark:bg-primary-700/30" : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 group-hover:bg-gray-300 dark:group-hover:bg-blue-800"}`}>
              <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
            </div>
            <span className="font-medium truncate">{item.label}</span>
          </div>

          {SHOW_MENU_COUNTS && item.count !== undefined && <span className={`ml-2 flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${item.count > 0 ? "bg-slate-500/20 text-slate-500 dark:bg-white/20 dark:text-white" : "bg-red-500/20 text-red-700 dark:bg-red-500/20 dark:text-red-400"}`}>{item.count}</span>}
        </Link>
      );
    };

    // --- Panel de Personal (jerarquía exacta) ---

    return (
      <div>
        {/* Panel de Personal */}
        {/*   <div className="px-2">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 pb-2 pt-2">Panel de Personal</div>
          <nav className="space-y-4">
            {personnelGroups.map((group, idx) => (
              <div key={idx}>
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{group.title}</div>
                <div className="space-y-1">{group.items.map((item) => renderMenuItem(item))}</div>
              </div>
            ))}
            {adminPersonnelGroup && (
              <div>
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{adminPersonnelGroup.title}</div>
                <div className="space-y-1">
                  {adminPersonnelGroup.items.map((item, idx) => {
                    if (item.isSubheader) {
                      return (
                        <div key={idx} className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-3 mb-2 pl-2">
                          {item.title}
                        </div>
                      );
                    }
                    return renderMenuItem(item);
                  })}
                </div>
              </div>
            )}
          </nav>
        </div> */}

        {/* Administración (global / plataforma, como ya tenías) */}
        {adminItems.length > 0 && (
          <div className="px-2">
            <button onClick={() => setAdminAccordionOpen(!adminAccordionOpen)} aria-expanded={adminAccordionOpen} className="w-full flex items-center justify-between text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-300 transition-colors mb-3 pb-2 pt-2">
              <span>{user?.tenantSlug === "superadmin" ? "Administración global" : "Administración"}</span>
              <FontAwesomeIcon icon={faChevronDown} className={`h-3 w-3 transform transition-transform duration-200 ease-in-out ${adminAccordionOpen ? "rotate-180" : "rotate-0"}`} />
            </button>
            {adminAccordionOpen && <nav className="lg:space-y-1 pb-2">{adminItems.map((item) => renderMenuItem(item))}</nav>}
          </div>
        )}
      </div>
    );
  };

  const showClientContext = useMemo(() => {
    const isSuperAdminTenant = user?.tenantSlug === "superadmin";
    const hasClientsPermission = hasPermission("clients:view");
    return !isSuperAdminTenant && hasClientsPermission;
  }, [user?.tenantSlug, hasPermission]);

  const LogoutButton: React.FC<{ onClick?: () => void; className?: string }> = ({ onClick, className = "" }) => (
    <button
      onClick={() => {
        logout();
        onClick?.();
      }}
      className={`flex items-center space-x-3 w-full  py-3 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-red-50 dark:hover:bg-blue-900/20 transition-colors ${className}`}
    >
      <FontAwesomeIcon icon={faRightFromBracket} className="h-5 w-5" />
      <span className="font-medium lg:hidden"></span>
    </button>
  );

  return (
    <>
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="px-4 sm:px-6">
          <div className="flex justify-between items-center h-16">
            <div className="lg:hidden">
              <button onClick={() => setOpen((v) => !v)} className="p-2 rounded-lg hover:bg-gray-1 flex-1 overflow-y-auto space-y-4 mb-4000 dark:hover:bg-gray-700 transition-colors">
                {open ? <FontAwesomeIcon icon={faXmark} className="h-6 w-6 text-gray-600 dark:text-gray-300" /> : <FontAwesomeIcon icon={faBars} className="h-6 w-6 text-gray-600 dark:text-gray-300" />}
              </button>
            </div>
            <div>
              <Logo sizeClass="text-3xl" wrapperClassName="flex items-center cursor-pointer hover:opacity-80 transition-opacity" />
            </div>
            <div className="flex items-center justify-center space-x-2">
              <div className="hidden lg:block">
                <UserCard />
              </div>

              {/* 🤖 Robot (por ahora oculto) */}
              {/*               <button onClick={() => openAssistant?.()} className="p-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors" title="Asistente IA">
                <FontAwesomeIcon icon={faRobot} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </button> */}

              <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                {theme === "light" ? <FontAwesomeIcon icon={faMoon} className="h-5 w-5 text-gray-600" /> : <FontAwesomeIcon icon={faSun} className="h-5 w-5 text-gray-300" />}
              </button>
              <div className="sticky bottom-0 left-0 right-0 bg-white dark:bg-gray-800 py-2 border-t border-gray-200 lg:border-hidden dark:border-gray-700 px-4 hidden lg:block">
                <LogoutButton onClick={() => setOpen(false)} />
              </div>
            </div>
          </div>
        </div>

        {open && <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />}
        <div className={`fixed top-0 left-0 z-50 h-full w-80 bg-white dark:bg-gray-800 transform transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "-translate-x-full"}`} aria-hidden={!open}>
          <div className="p-4 pb-0">
            <div className="flex items-start justify-between border-b border-gray-700 mb-2">
              <div>
                <Logo sizeClass="text-2xl" />
              </div>
              <button onClick={() => setOpen(false)} className="p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <FontAwesomeIcon icon={faXmark} className="h-5 w-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
          </div>

          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-4 pt-1 space-y-3 mb-40 ">
              {showClientContext && (
                <div className="bg-white dark:bg-gray-800">
                  <div>
                    <div className="text-sm font-medium text-gray-500 dark:text-gray-40 uppercase tracking-wider mb-2">Cliente</div>
                    <ClientSelector />
                  </div>
                  <div>
                    <ClientContextMenu />
                  </div>
                </div>
              )}
              <div>
                <NavMenu onItemClick={() => setOpen(false)} />
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 flex justify-between items-end">
            <div className="block lg:hidden">
              <UserCard />
            </div>
            <div>
              <LogoutButton onClick={() => setOpen(false)} />
            </div>
          </div>
        </div>
      </nav>

      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:bg-white lg:dark:bg-gray-800 lg:border-r lg:border-gray-200 lg:dark:border-gray-700">
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto mt-12">
            <div className="px-3 mb-4">
              <div className={`bg-white dark:bg-gray-800 py-2`}>
                <NavMenu onItemClick={() => setOpen(false)} />
              </div>
            </div>
          </div>

          <div className="px-3 pb-4 lg:hidden">
            <LogoutButton />
          </div>
        </div>
      </aside>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
};
