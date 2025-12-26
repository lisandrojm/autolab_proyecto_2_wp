import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../stores/authStore";
import { useThemeStore } from "../stores/themeStore";
import { useAssistantStore } from "../stores/assistantStore";
import { ClientSelector } from "./ClientSelector";
import { ClientContextMenu } from "./ClientContextMenu";
import { Link, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faBars, faMoon, faSun, faRightFromBracket, faHouse, faUsers, faSquareCheck, faShield, faUserGear, faBuilding, faPalette, faArrowUpRightFromSquare, faCalendar, faRobot, faRocket, faChartLine, faCog, faUser, faUserShield, faChevronDown, faChevronRight, faFileLines, faBell, faClipboardList, faCalendarCheck, faListCheck, faIdCard, faFileText, faBox, faList, faUmbrellaBeach, faBriefcase, faUserGraduate, faUserTie, faShoppingCart, faFilePdf, faUsersGear, faLayerGroup } from "@fortawesome/free-solid-svg-icons";
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
  tenants: number;
  roles: number;
  users: number;
  areas: number;
  positions: number;
  levels: number;
  projects: number;
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
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [adminAccordionOpen, setAdminAccordionOpen] = useState(true);

  // No renderizar el Navbar en rutas públicas
  const publicRoutes = ["/login", "/register", "/register-client"];
  if (publicRoutes.includes(location.pathname)) {
    return null;
  }

  // Estado del acordeón persistente: "users" | "general" | null
  const [openAdminSection, setOpenAdminSection] = useState<string | null>(() => {
    return localStorage.getItem("adminOpenSection") || "general";
  });

  const toggleAdminSection = (section: "users" | "general" | "config" | "management") => {
    const newVal = openAdminSection === section ? null : section;
    setOpenAdminSection(newVal);
    if (newVal) localStorage.setItem("adminOpenSection", newVal);
    else localStorage.removeItem("adminOpenSection");
  };
  const [adminCounts, setAdminCounts] = useState<AdminCounts>({ clients: 0, tenants: 0, roles: 0, users: 0, areas: 0, positions: 0, levels: 0, projects: 0 });
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

        if (hasPermission("tenants:view")) promises.push(axios.get("/tenants/count").catch(() => ({ data: { count: 0 } })));
        else promises.push(Promise.resolve({ data: { count: 0 } }));

        if (hasPermission("roles:view")) promises.push(axios.get("/roles/count").catch(() => ({ data: { count: 0 } })));
        else promises.push(Promise.resolve({ data: { count: 0 } }));

        if (hasPermission("users:view")) promises.push(axios.get("/areas/count").catch(() => ({ data: { count: 0 } })));
        else promises.push(Promise.resolve({ data: { count: 0 } }));

        if (hasPermission("users:view")) promises.push(axios.get("/positions/count").catch(() => ({ data: { count: 0 } })));
        else promises.push(Promise.resolve({ data: { count: 0 } }));

        if (hasPermission("users:view")) promises.push(axios.get("/levels/count").catch(() => ({ data: { count: 0 } })));
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

        const [clientsRes, tenantsRes, rolesRes, areasRes, positionsRes, levelsRes, projectsRes, usersRes] = await Promise.all(promises);

        setAdminCounts({
          clients: clientsRes?.data?.count || 0,
          tenants: tenantsRes?.data?.count || 0,
          roles: rolesRes?.data?.count || 0,
          areas: areasRes?.data?.count || 0,
          positions: positionsRes?.data?.count || 0,
          levels: levelsRes?.data?.count || 0,
          projects: projectsRes?.data?.count || 0,
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

  useEffect(() => {
    const path = location.pathname;
    if (["/hr/order-categories", "/hr/pdf-templates", "/hr/vacations-rules"].includes(path)) {
      setOpenAdminSection("config");
    }
  }, [location.pathname]);

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
      badge?: string;
      badgeColor?: string;
      disabled?: boolean; // 👈 AGREGAR ESTO
    }> = [];

    if (isSuperAdminTenant) {
      base.push({ path: "/dashboard", icon: faHouse, label: "Dashboard", scope: "global" }, { path: "/tenants", icon: faBuilding, label: "Tenants", scope: "global", count: adminCounts.tenants }, { path: "/platform/usage", icon: faChartLine, label: "Planes y Uso", scope: "global" }, { path: "/platform/settings", icon: faCog, label: "Configuración Global", scope: "global" });
    } else {
      if (hasPermission("roles:view")) base.push({ path: "/roles", icon: faUserShield, label: "Roles", scope: "global", count: adminCounts.roles });
      if (hasPermission("users:view")) base.push({ path: "/areas", icon: faLayerGroup, label: "Áreas", scope: "global", count: adminCounts.areas });
      if (hasPermission("users:view")) base.push({ path: "/positions", icon: faUserTie, label: "Cargos", scope: "global", count: adminCounts.positions });
      if (hasPermission("users:view")) base.push({ path: "/levels", icon: faUserGraduate, label: "Niveles", scope: "global", count: adminCounts.levels });
      if (hasPermission("users:view")) base.push({ path: "/users", icon: faUserGear, label: "Usuarios", scope: "global", count: adminCounts.users });

      // New Management Group Items
      if (hasPermission("clients:view")) base.push({ path: "/clients", icon: faUsers, label: "Clientes", scope: "global", count: adminCounts.clients });

      if (hasPermission("orders:view")) base.push({ path: "/hr/orders", icon: faShoppingCart, label: "Pedidos", scope: "global" });
      if (hasPermission("vacationRequests:view")) base.push({ path: "/hr/vacations", disabled: false, icon: faUmbrellaBeach, label: "Vacaciones", scope: "global" });
      if (hasPermission("activityLogs:view")) base.push({ path: "/hr/activity-logs", disabled: false, icon: faFileText, label: "Registro de novedades", scope: "global", dividerTop: true });
      if (hasPermission("calendarEvents:view")) base.push({ path: "/hr/calendar-events", disabled: true, icon: faCalendar, label: "Calendario", scope: "global" });
      if (hasPermission("employeeProfiles:view")) base.push({ path: "/hr/employee-profiles", disabled: true, icon: faUsers, label: "Perfiles de Empleados", scope: "global" });
      if (hasPermission("hrDocuments:view")) base.push({ path: "/hr/documents", disabled: true, icon: faFileText, label: "Documentos RRHH", scope: "global" });

      if (hasPermission("orders:view")) base.push({ path: "/hr/order-categories", icon: faShoppingCart, label: "Pedidos", scope: "global" });
      if (hasPermission("orders:view")) base.push({ path: "/hr/vacations-rules", icon: faUmbrellaBeach, label: "Vacaciones", scope: "global" });
      if (hasPermission("orders:view")) base.push({ path: "/hr/pdf-templates", icon: faFilePdf, label: "Plantillas PDF", scope: "global" });

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
          <div className="flex flex-col lg:flex-row gap-2 w-full lg:justify-between items-center lg:items-start lg:px-2">
            <div className="hidden lg:flex text-transform: capitalize font-semibold items-center justify-center px-3 py-1 rounded-full text-xs bg-primary-100 text-primary-800 dark:bg-blue-900/30 dark:text-primary-300" title={user.tenantSlug}>
              <FontAwesomeIcon icon={faBuilding} className="h-3 w-3 mr-1.5" />
              {user.tenantSlug}
            </div>
            <div className="flex text-transform: capitalize font-semibold items-center justify-center px-3 py-1 rounded-full text-xs bg-primary-100 text-primary-800 dark:bg-blue-900/30 dark:text-primary-300" title={displayName}>
              <FontAwesomeIcon icon={faUser} className="h-3 w-3 mr-1.5" /> {displayName}
            </div>
            <div className="hidden lg:block">
              <RoleChips />
            </div>
          </div>
        )}
      </div>
    );
  };

  const NavMenu: React.FC<{ onItemClick?: () => void }> = ({ onItemClick }) => {
    const adminItems = menuItems.filter((item) => !item.isCreativeSuite);

    // Partición de items: Admin Usuarios, Admin General, Configuración y GESTIÓN
    const userAdminItems = adminItems.filter((item) => ["/roles", "/areas", "/positions", "/levels", "/users"].includes(item.path));

    const managementItems = adminItems.filter((item) => ["/projects"].includes(item.path));

    const generalAdminItems = adminItems.filter((item) => ["/clients", "/hr/orders", "/hr/vacations", "/hr/activity-logs", "/hr/calendar-events", "/hr/employee-profiles", "/hr/documents"].includes(item.path));

    const configItems = adminItems.filter((item) => ["/hr/order-categories", "/hr/pdf-templates", "/hr/vacations-rules"].includes(item.path));

    const otherAdminItems = adminItems.filter((item) => !userAdminItems.includes(item) && !generalAdminItems.includes(item) && !configItems.includes(item) && !managementItems.includes(item));

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

      // Disabled state
      if (item.disabled) {
        return (
          <div key={item.path} className="group relative flex items-center justify-between px-2 py-2 rounded-lg transition-all cursor-not-allowed opacity-40 bg-gray-100 dark:bg-gray-700 select-none">
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <div className="h-8 w-8 flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-600">
                <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
              </div>
              <span className="font-medium truncate">{item.label}</span>
            </div>
          </div>
        );
      }
      return (
        <Link key={item.path} to={item.path} onClick={onItemClick} aria-current={isActive(item.path) ? "page" : undefined} className={`group relative flex items-center justify-between px-2 py-2 rounded-lg transition-all ${isActive(item.path) ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-blue-300 dark:border-blue-800" : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-blue-900/50"}`}>
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <div className={`h-8 w-8 flex items-center justify-center rounded-md transition-colors ${isActive(item.path) ? "bg-primary-600 text-white dark:bg-primary-700/30" : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 group-hover:bg-gray-300 dark:group-hover:bg-blue-800"}`}>
              <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
            </div>
            <span className="font-medium truncate">{item.label}</span>
            {item.badge && <span className={`ml-1 px-2 py-0.5 rounded-full text-[8px] font-bold ${item.badgeColor || "bg-green-500"} text-white uppercase`}>{item.badge}</span>}
          </div>

          {SHOW_MENU_COUNTS && item.count !== undefined && <span className={`ml-2 flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${item.count > 0 ? "bg-slate-500/20 text-slate-500 dark:bg-white/20 dark:text-white" : "bg-red-500/20 text-red-700 dark:bg-red-500/20 dark:text-red-400"}`}>{item.count}</span>}
        </Link>
      );
    };

    return (
      <div>
        {/* ADMIN GENERAL (RRHH) */}
        {generalAdminItems.length > 0 && (
          <div className="px-2 mb-2">
            <button onClick={() => toggleAdminSection("general")} className="w-full flex items-center justify-between text-sm font-medium text-gray-500 dark:text-gray-400 tracking-wider hover:text-gray-700 dark:hover:text-gray-300 transition-colors pb-2 pt-2">
              <span>
                <FontAwesomeIcon icon={faUsersGear} className="mr-2 h-4 w-4" />
                Admin <span className="uppercase">General</span>
              </span>
              <FontAwesomeIcon icon={openAdminSection === "general" ? faChevronDown : faChevronRight} className="h-3 w-3" />
            </button>

            {openAdminSection === "general" && <nav className="space-y-1 pb-2">{generalAdminItems.map((item) => renderMenuItem(item))}</nav>}
          </div>
        )}

        {/* ADMIN USUARIOS */}
        {userAdminItems.length > 0 && (
          <div className="px-2 mb-2">
            <button onClick={() => toggleAdminSection("users")} className="w-full flex items-center justify-between text-sm font-medium text-gray-500 dark:text-gray-400 tracking-wider hover:text-gray-700 dark:hover:text-gray-300 transition-colors pb-2 pt-2">
              <span>
                <FontAwesomeIcon icon={faUsersGear} className="mr-2 h-4 w-4" />
                Admin <span className="uppercase">Usuarios</span>
              </span>
              <FontAwesomeIcon icon={openAdminSection === "users" ? faChevronDown : faChevronRight} className="h-3 w-3" />
            </button>

            {openAdminSection === "users" && <nav className="space-y-1 pb-2">{userAdminItems.map((item) => renderMenuItem(item))}</nav>}
          </div>
        )}

        {/* CONFIGURACIÓN */}
        {configItems.length > 0 && (
          <div className="px-2 mb-2">
            <button onClick={() => toggleAdminSection("config")} className="w-full flex items-center justify-between text-sm font-medium text-gray-500 dark:text-gray-400 tracking-wider hover:text-gray-700 dark:hover:text-gray-300 transition-colors pb-2 pt-2">
              <span>
                <FontAwesomeIcon icon={faCog} className="mr-2 h-4 w-4" />
                Configuración
              </span>
              <FontAwesomeIcon icon={openAdminSection === "config" ? faChevronDown : faChevronRight} className="h-3 w-3" />
            </button>

            {openAdminSection === "config" && <nav className="space-y-1 pb-2">{configItems.map((item) => renderMenuItem(item))}</nav>}
          </div>
        )}

        {/* OTROS ITEMS (si existen) */}
        {otherAdminItems.length > 0 && (
          <div className="px-2 mb-2">
            <div className="text-gray-500 dark:text-gray-400 text-xs uppercase mb-1">Otros</div>
            <nav className="space-y-1 pb-2">{otherAdminItems.map((item) => renderMenuItem(item))}</nav>
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
      className={`flex items-center space-x-3 w-full  py-3 rounded-lg text-red-500 dark:text-red-500 hover:text-red-500/70 dark:hover:text-red-500/80 transition-colors ${className}`}
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
              {isDeployButtonVisible() && (
                <button onClick={handleRedeploy} onMouseEnter={loadDeployMeta} disabled={isDeploying} className="relative p-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group">
                  <FontAwesomeIcon icon={faRocket} className={`h-5 w-5 text-blue-600 dark:text-blue-400}`} />
                  <div className="absolute top-full left-1/2 mt-2 -translate-x-1/2 flex flex-col items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
                    <div className="w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-800 dark:border-b-gray-700"></div>
                    <span className="rounded-md bg-gray-800 dark:bg-gray-700 text-white text-xs px-2 py-1 shadow-md whitespace-nowrap">
                      <div className="font-semibold flex flex-col">Vercel Deploy</div>
                      {deployMetaLoading ? (
                        <span className="ml-2 opacity-80">cargando…</span>
                      ) : deployMetaError ? (
                        <span className="ml-2 opacity-80">sin datos</span>
                      ) : deployMeta?.shortSha ? (
                        <>
                          <span className="ml-2">•</span>
                          {deployMeta.url ? (
                            <a href={`https://${deployMeta.url}`} target="_blank" rel="noopener noreferrer" className="ml-2 underline underline-offset-2" title={deployMeta.commitMessage || deployMeta.sha}>
                              {deployMeta.shortSha}
                            </a>
                          ) : (
                            <span className="ml-2" title={deployMeta.commitMessage || deployMeta.sha}>
                              {deployMeta.shortSha}
                            </span>
                          )}
                          {deployMeta.branch ? <span className="ml-2 opacity-80">({deployMeta.branch})</span> : null}
                          {deployMeta.createdAt ? (
                            <>
                              <span className="ml-2">•</span>
                              <span className="ml-2 opacity-80">{formatDateTime(deployMeta.createdAt)}</span>
                            </>
                          ) : null}
                        </>
                      ) : (
                        <span className="ml-2 opacity-80">sin datos</span>
                      )}
                    </span>
                  </div>
                </button>
              )}

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
        <div className={`fixed top-0 left-0 z-50 h-svh w-80 bg-white dark:bg-gray-800 transform transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "-translate-x-full"}`} aria-hidden={!open}>
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
            <div className="flex-1 overflow-y-auto p-4 pt-1 space-y-3">
              {showClientContext && (
                <div className="bg-white dark:bg-gray-800 mb-4">
                  <div>
                    <div className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Cliente</div>
                    <ClientSelector />
                  </div>
                  <div>{selectedClient && <ClientContextMenu />}</div>
                </div>
              )}
              <div>
                <NavMenu onItemClick={() => setOpen(false)} />
              </div>
            </div>
          </div>

          <div className="lg:hidden sticky bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 flex justify-between items-end items-center">
            <div>
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
          <div className="flex flex-col pt-5 pb-4 overflow-y-auto mt-12">
            {showClientContext && (
              <div className="px-3">
                <div className="bg-white dark:bg-gray-800 dark:border-gray-700 pt-4">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2 pb-2">Cliente</div>
                  <ClientSelector />
                  {selectedClient && <ClientContextMenu />}
                </div>
              </div>
            )}
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
