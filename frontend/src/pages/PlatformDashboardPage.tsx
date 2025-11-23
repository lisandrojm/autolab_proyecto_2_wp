import React, { useEffect, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { platformApi, PlatformMetrics } from "../api/platform";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChartLine, faBuilding, faUsers, faServer, faExclamationTriangle, faCrown, faCheck, faPause, faArrowUp, faDatabase } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";
import { getHelp, hasHelp } from "../data/help/helpContent";

const HELP_KEY = "platform_dashboard" as const;

export const PlatformDashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [openInfo, setOpenInfo] = useState(false);

  const helpEntry = hasHelp(HELP_KEY)
    ? getHelp(HELP_KEY)
    : {
        title: "Ayuda",
        size: "md" as const,
        content: <div>Información de ayuda no disponible</div>,
      };

  useEffect(() => {
    console.log("🎯 PlatformDashboardPage MOUNTED - This is the SUPERADMIN dashboard");
    console.log("👤 User in Platform Dashboard:", user);
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const data = await platformApi.getMetrics();
      setMetrics(data);
    } catch (error) {
      console.error("Error fetching platform metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Cargando métricas de plataforma..." />;
  }

  if (!metrics) {
    return (
      <PageLayout
        title="Dashboard de Plataforma"
        subtitle={`Bienvenido, ${user?.firstName || user?.email}`}
        faIcon={{ icon: faChartLine }}
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
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">No se pudieron cargar las métricas</p>
        </div>
      </PageLayout>
    );
  }

  const statCards = [
    {
      title: "Total Tenants",
      value: metrics.tenants.total,
      subtitle: `${metrics.tenants.active} activos`,
      icon: faBuilding,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
      trend: metrics.tenants.new > 0 ? `+${metrics.tenants.new} este mes` : null,
    },
    {
      title: "Usuarios Totales",
      value: metrics.resources.totalUsers,
      subtitle: `En ${metrics.tenants.active} tenants`,
      icon: faUsers,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      title: "Clientes Totales",
      value: metrics.resources.totalClients,
      subtitle: "En toda la plataforma",
      icon: faUsers,
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-50 dark:bg-purple-900/20",
    },
    {
      title: "Almacenamiento",
      value: `${metrics.resources.storagePercent}%`,
      subtitle: `${metrics.resources.storageUsedMB} MB de ${metrics.resources.storageLimitMB} MB`,
      icon: faDatabase,
      color: metrics.resources.storagePercent > 80 ? "text-red-600 dark:text-red-400" : "text-cyan-600 dark:text-cyan-400",
      bgColor: metrics.resources.storagePercent > 80 ? "bg-red-50 dark:bg-red-900/20" : "bg-cyan-50 dark:bg-cyan-900/20",
    },
  ];

  const planColors: Record<string, string> = {
    free: "bg-gray-500",
    basic: "bg-blue-500",
    pro: "bg-purple-500",
    enterprise: "bg-blue-500",
  };

  return (
    <PageLayout
      title="Dashboard de Plataforma"
      subtitle={`Bienvenido, ${user?.firstName || user?.email}`}
      faIcon={{ icon: faChartLine }}
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
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {statCards.map((card, idx) => (
            <div key={idx} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className={`${card.bgColor} p-3 rounded-lg`}>
                  <FontAwesomeIcon icon={card.icon} className={`h-6 w-6 ${card.color}`} />
                </div>
              </div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">{card.title}</h3>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">{card.value}</p>
              <p className="text-sm text-gray-500 dark:text-gray-500">{card.subtitle}</p>
              {card.trend && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 flex items-center gap-1">
                  <FontAwesomeIcon icon={faArrowUp} className="h-3 w-3" />
                  {card.trend}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Alertas */}
        {metrics.alerts.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <FontAwesomeIcon icon={faExclamationTriangle} className="h-5 w-5 text-blue-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Alertas del Sistema</h2>
              <span className="ml-auto bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-medium px-2.5 py-0.5 rounded-full">{metrics.alerts.length}</span>
            </div>
            <div className="space-y-3">
              {metrics.alerts.slice(0, 5).map((alert, idx) => (
                <div key={idx} className={`p-4 rounded-lg border ${alert.severity === "high" ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800" : "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800"}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{alert.tenant}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{alert.message}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${alert.severity === "high" ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"}`}>{alert.type}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Distribución de Planes */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <FontAwesomeIcon icon={faCrown} className="h-5 w-5 text-blue-500" />
              Distribución de Planes
            </h2>
            <div className="space-y-4">
              {Object.entries(metrics.plans.distribution).map(([plan, count]) => {
                const total = metrics.tenants.total;
                const percent = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
                return (
                  <div key={plan}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">{plan}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {count} ({percent}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                      <div className={`${planColors[plan] || "bg-gray-500"} h-2.5 rounded-full transition-all`} style={{ width: `${percent}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status de Tenants */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <FontAwesomeIcon icon={faServer} className="h-5 w-5 text-blue-500" />
              Estado de Tenants
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <FontAwesomeIcon icon={faCheck} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <span className="font-medium text-gray-900 dark:text-white">Activos</span>
                </div>
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{metrics.tenants.active}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <FontAwesomeIcon icon={faPause} className="h-5 w-5 text-red-600 dark:text-red-400" />
                  <span className="font-medium text-gray-900 dark:text-white">Suspendidos</span>
                </div>
                <span className="text-2xl font-bold text-red-600 dark:text-red-400">{metrics.tenants.suspended}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <FontAwesomeIcon icon={faArrowUp} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <span className="font-medium text-gray-900 dark:text-white">Nuevos (30 días)</span>
                </div>
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{metrics.tenants.new}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Top Consumers */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Top 5 Tenants por Consumo de Almacenamiento</h2>
          <div className=" rounded border dark:border-slate-800">
            <table className="w-full dark:bg-slate-800/80">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">Tenant</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">Plan</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">Almacenamiento</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">Usuarios</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">Estado</th>
                </tr>
              </thead>
              <tbody>
                {metrics.topConsumers.slice(0, 5).map((tenant) => {
                  const storagePercent = tenant.storageLimitMB > 0 ? ((tenant.storageUsedMB / tenant.storageLimitMB) * 100).toFixed(0) : 0;
                  return (
                    <tr key={tenant._id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => navigate(`/tenants`)}>
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{tenant.name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{tenant.slug}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 capitalize">{tenant.plan}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{tenant.storageUsedMB} MB</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{storagePercent}% usado</div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{tenant.users}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tenant.isActive ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"}`}>{tenant.isActive ? "Activo" : "Inactivo"}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};
