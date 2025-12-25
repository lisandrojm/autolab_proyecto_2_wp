import React, { useEffect, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useClientContextStore } from "../stores/clientContextStore";
import { dashboardAPI, DashboardStats } from "../api/dashboard";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBullseye, faUsers, faFileAlt, faChartLine, faFire, faChartPie } from "@fortawesome/free-solid-svg-icons";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { PlatformDashboardPage } from "./PlatformDashboardPage";

const HELP_KEY = "dashboard" as const;

export const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const { clearSelectedClient } = useClientContextStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [openInfo, setOpenInfo] = useState(false);

  const isSuperAdminTenant = user?.tenantSlug === "superadmin";

  const helpEntry = hasHelp(HELP_KEY)
    ? getHelp(HELP_KEY)
    : {
        title: "Ayuda",
        size: "md" as const,
        content: <div>Información de ayuda no disponible</div>,
      };

  useEffect(() => {
    console.log("🔍 DashboardPage - Debug Info:");
    console.log("  - user:", user);
    console.log("  - tenantSlug:", user?.tenantSlug);
    console.log("  - isSuperAdminTenant:", isSuperAdminTenant);
    console.log("  - Comparison:", user?.tenantSlug, "===", "superadmin", "->", user?.tenantSlug === "superadmin");

    if (isSuperAdminTenant) {
      console.log("✅ Detected superadmin tenant - Loading PlatformDashboard");
      clearSelectedClient();
      setLoading(false);
    } else {
      console.log("❌ Not superadmin tenant - Loading regular dashboard");
      fetchStats();
    }
  }, [isSuperAdminTenant, clearSelectedClient, user]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await dashboardAPI.getStats();
      setStats(data);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Cargando dashboard..." />;
  }

  if (isSuperAdminTenant) {
    console.log("🎯 Rendering PlatformDashboardPage");
    return <PlatformDashboardPage />;
  }

  console.log("📊 Rendering regular dashboard with stats:", stats);

  const statCards = [
    {
      title: "Proyectos",
      value: stats?.projects.total || 0,
      subtitle: `${stats?.projects.active || 0} activos`,
      change: stats?.projects.change || 0,
      icon: faBullseye,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      title: "Clientes",
      value: stats?.clients.total || 0,
      subtitle: `${stats?.clients.active || 0} activos`,
      change: stats?.clients.change || 0,
      icon: faUsers,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      title: "Publicaciones",
      value: stats?.posts.total || 0,
      subtitle: `${stats?.posts.published || 0} publicados`,
      change: stats?.posts.change || 0,
      icon: faFileAlt,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      title: "Usuarios",
      value: stats?.users.total || 0,
      subtitle: `${stats?.users.active || 0} activos`,
      change: stats?.users.change || 0,
      icon: faUsers,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
    },
  ];

  return (
    <PageLayout
      title="Dashboard"
      subtitle={`Bienvenido de nuevo, ${user?.firstName || user?.email}`}
      faIcon={{ icon: faChartPie }}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat) => (
            <div key={stat.title} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{stat.title}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{stat.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{stat.subtitle}</p>
                  {stat.change !== 0 && (
                    <p className={`text-xs mt-2 flex items-center gap-1 ${stat.change > 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"}`}>
                      <span>{stat.change > 0 ? "↗" : "↘"}</span>
                      <span>{Math.abs(stat.change)}% este mes</span>
                    </p>
                  )}
                </div>
                <div className={`p-4 rounded-xl ${stat.bgColor}`}>
                  <FontAwesomeIcon icon={stat.icon} className={`h-8 w-8 ${stat.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <FontAwesomeIcon icon={faUsers} className="h-5 w-5 text-blue-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Clientes</h3>
            </div>
            {stats?.topClients && stats.topClients.length > 0 ? (
              <div className="space-y-3">
                {stats.topClients.map((client, index) => (
                  <div key={client._id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 font-semibold text-sm">{index + 1}</div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{client.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{client.projectCount} proyectos</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No hay clientes todavía</p>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Actividad Reciente</h3>
            {stats?.recentActivity && stats.recentActivity.length > 0 ? (
              <div className="space-y-3">
                {stats.recentActivity.map((activity, index) => {
                  const date = new Date(activity.timestamp);
                  const isToday = date.toDateString() === new Date().toDateString();
                  const timeStr = date.toLocaleTimeString("es-ES", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const dateStr = date.toLocaleDateString("es-ES", {
                    day: "2-digit",
                    month: "short",
                  });

                  return (
                    <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <div className={`flex-shrink-0 w-2 h-2 mt-2 rounded-full ${activity.type === "project" ? "bg-blue-500" : activity.type === "client" ? "bg-blue-500" : activity.type === "post" ? "bg-blue-500" : "bg-blue-500"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 dark:text-white">{activity.description}</p>
                        {activity.user && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">por {activity.user}</p>}
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{isToday ? timeStr : dateStr}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No hay actividad reciente</p>
            )}
          </div>
          {/*           <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <FontAwesomeIcon icon={faChartLine} className="h-5 w-5 text-blue-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Plataformas Más Usadas</h3>
            </div>
            {stats?.platformDistribution && stats.platformDistribution.length > 0 ? (
              <div className="space-y-3">
                {stats.platformDistribution.map((platform) => {
                  const total = stats.platformDistribution.reduce((sum, p) => sum + p.count, 0) || 1;
                  const percentage = Math.round((platform.count / total) * 100);

                  return (
                    <div key={platform.platform}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">{platform.platform}</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {platform.count} ({percentage}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${percentage}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No hay datos de plataformas</p>
            )}
          </div> */}
        </div>

        {/*         <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Actividad Reciente</h3>
          {stats?.recentActivity && stats.recentActivity.length > 0 ? (
            <div className="space-y-3">
              {stats.recentActivity.map((activity, index) => {
                const date = new Date(activity.timestamp);
                const isToday = date.toDateString() === new Date().toDateString();
                const timeStr = date.toLocaleTimeString("es-ES", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const dateStr = date.toLocaleDateString("es-ES", {
                  day: "2-digit",
                  month: "short",
                });

                return (
                  <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className={`flex-shrink-0 w-2 h-2 mt-2 rounded-full ${activity.type === "campaign" ? "bg-blue-500" : activity.type === "client" ? "bg-blue-500" : activity.type === "post" ? "bg-blue-500" : "bg-blue-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-white">{activity.description}</p>
                      {activity.user && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">por {activity.user}</p>}
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{isToday ? timeStr : dateStr}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No hay actividad reciente</p>
          )}
        </div>
 */}
        {/*   <div className="bg-gradient-to-br from-primary-50 to-blue-50 dark:from-gray-800 dark:to-gray-900 rounded-xl shadow-sm p-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Gestión de Redes Sociales</h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">Administra campañas, contenido y clientes desde un solo lugar. Optimiza tu flujo de trabajo con herramientas profesionales para community managers.</p>
          </div>
        </div> */}
      </div>
    </PageLayout>
  );
};
