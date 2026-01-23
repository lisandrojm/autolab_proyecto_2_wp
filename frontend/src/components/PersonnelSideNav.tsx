import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faIdCard, faUser, faUsers, faFileLines, faCalendar, faBell, faClockRotateLeft, faCalendarCheck, faClipboardList, faListCheck, faUserGear, faCheckCircle, faChevronDown, faChevronRight, faFileContract } from "@fortawesome/free-solid-svg-icons";

interface MenuItem {
  path?: string;
  label: string;
  icon: any;
  children?: MenuItem[];
  badge?: string;
  badgeColor?: string;
}

interface MenuSectionProps {
  title: string;
  items: MenuItem[];
  isAdmin?: boolean;
}

const MenuSection: React.FC<MenuSectionProps> = ({ title, items, isAdmin = false }) => {
  const location = useLocation();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set([title]));

  const isActive = (path?: string) => {
    if (!path) return false;
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  const hasActiveChild = (item: MenuItem): boolean => {
    if (item.children) {
      return item.children.some((child) => isActive(child.path) || hasActiveChild(child));
    }
    return false;
  };

  const toggleExpanded = (label: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(label)) {
      newExpanded.delete(label);
    } else {
      newExpanded.add(label);
    }
    setExpandedItems(newExpanded);
  };

  const renderMenuItem = (item: MenuItem, depth: number = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.has(item.label);
    const itemActive = isActive(item.path);
    const childActive = hasActiveChild(item);

    const paddingLeft = `${(depth + 1) * 0.75}rem`;

    if (hasChildren) {
      return (
        <div key={item.label}>
          <button onClick={() => toggleExpanded(item.label)} className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium transition-colors ${childActive ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20" : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"}`} style={{ paddingLeft }}>
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
              <span>{item.label}</span>
            </div>
            <FontAwesomeIcon icon={isExpanded ? faChevronDown : faChevronRight} className="h-3 w-3" />
          </button>
          {isExpanded && item.children && <div>{item.children.map((child) => renderMenuItem(child, depth + 1))}</div>}
        </div>
      );
    }

    if (item.path) {
      return (
        <Link key={item.path} to={item.path} className={`flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors ${itemActive ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 font-medium border-r-2 border-blue-600" : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"}`} style={{ paddingLeft }}>
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
            <span>{item.label}</span>
          </div>
          {item.badge && <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.badgeColor || "bg-green-500"} text-white uppercase`}>{item.badge}</span>}
        </Link>
      );
    }

    return null;
  };

  return (
    <div className="mb-6">
      <h3 className="px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{title}</h3>
      <div className="space-y-1">{items.map((item) => renderMenuItem(item))}</div>
    </div>
  );
};

export const PersonnelSideNav: React.FC<{ isAdmin?: boolean }> = ({ isAdmin = false }) => {
  const myAreaItems: MenuItem[] = [
    { path: "/admin/personal/perfil", label: "Mi Perfil", icon: faUser },
    { path: "/admin/personal/equipo", label: "Mi Equipo", icon: faUsers },
    { path: "/admin/personal/documentos", label: "Documentos", icon: faFileLines },
    { path: "/admin/personal/calendario", label: "Calendario", icon: faCalendar },
    { path: "/admin/personal/actividad", label: "Actividad Reciente", icon: faClockRotateLeft },
    { path: "/admin/personal/notificaciones", label: "Notificaciones", icon: faBell },
  ];

  const newsItems: MenuItem[] = [{ path: "/admin/novedades/reporte-diario", label: "Reporte Diario", icon: faCalendarCheck }];

  const requestsItems: MenuItem[] = [
    { path: "/admin/pedidos/vacaciones", label: "Vacaciones", icon: faCalendar },
    { path: "/admin/pedidos/pedidos", label: "Pedidos", icon: faClipboardList, badge: "Nuevo", badgeColor: "bg-green-500" },
  ];

  const tasksItems: MenuItem[] = [{ path: "/admin/personal/tareas", label: "Mis Tareas", icon: faListCheck }];

  const adminItems: MenuItem[] = [
    { path: "/admin/administracion/empleados", label: "Gestión de Empleados", icon: faUserGear },
    { path: "/admin/contracts", label: "Historial de Contratos", icon: faFileContract },
    {
      label: "Aprobaciones",
      icon: faCheckCircle,
      children: [
        { path: "/admin/administracion/aprobaciones/vacaciones-pendientes", label: "Vacaciones Pendientes", icon: faCalendar },
        { path: "/admin/administracion/aprobaciones/pedidos-pendientes", label: "Pedidos Pendientes", icon: faClipboardList },
      ],
    },
  ];

  return (
    <div className="h-full overflow-y-auto py-4 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
      <div className="px-3 mb-6">
        <Link to="/admin" className="flex items-center gap-2 px-3 py-3 text-base font-semibold text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors">
          <FontAwesomeIcon icon={faIdCard} className="h-5 w-5" />
          <span>Panel de Personal</span>
        </Link>
      </div>

      <MenuSection title="Mi Área" items={myAreaItems} />
      <MenuSection title="Novedades" items={newsItems} />
      <MenuSection title="Pedidos del Personal" items={requestsItems} />
      <MenuSection title="Tareas" items={tasksItems} />
      {isAdmin && <MenuSection title="Administración" items={adminItems} isAdmin />}
    </div>
  );
};
