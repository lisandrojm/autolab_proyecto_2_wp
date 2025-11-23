import React, { useEffect, useState } from "react";
import { platformApi, PlatformMetrics } from "../api/platform";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChartLine, faCrown, faDatabase, faUsers, faBullhorn } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";

export const PlatformUsagePage: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    return <LoadingSpinner message="Cargando datos de uso..." />;
  }

  if (!metrics) {
    return (
      <PageLayout title="Planes y Uso">
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">No se pudieron cargar los datos</p>
        </div>
      </PageLayout>
    );
  }

  const planColors: Record<string, { bg: string; text: string; border: string }> = {
    free: { bg: "bg-gray-50 dark:bg-gray-900/20", text: "text-gray-700 dark:text-gray-300", border: "border-gray-300 dark:border-gray-700" },
    basic: { bg: "bg-blue-50 dark:bg-blue-900/20", text: "text-blue-700 dark:text-blue-300", border: "border-blue-300 dark:border-blue-700" },
    pro: { bg: "bg-purple-50 dark:bg-purple-900/20", text: "text-purple-700 dark:text-purple-300", border: "border-purple-300 dark:border-purple-700" },
    enterprise: { bg: "bg-blue-50 dark:bg-blue-900/20", text: "text-blue-700 dark:text-blue-300", border: "border-blue-300 dark:border-blue-700" },
  };

  return (
    <PageLayout title="Planes y Uso" subtitle="Análisis detallado de consumo por tenant y plan" faIcon={{ icon: faChartLine }}>
      <div className="space-y-6">
        {/* Resumen de Planes */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Object.entries(metrics.plans.distribution).map(([plan, count]) => {
            const colors = planColors[plan] || planColors.free;
            return (
              <div key={plan} className={`${colors.bg} border-2 ${colors.border} rounded-xl p-6 transition-all hover:scale-105 cursor-pointer`} onClick={() => navigate("/tenants")}>
                <div className="flex items-center justify-between mb-4">
                  <FontAwesomeIcon icon={faCrown} className={`h-6 w-6 ${colors.text}`} />
                  <span className="text-3xl font-bold ${colors.text}">{count}</span>
                </div>
                <h3 className={`text-lg font-semibold ${colors.text} capitalize`}>{plan}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{((count / metrics.tenants.total) * 100).toFixed(1)}% del total</p>
              </div>
            );
          })}
        </div>

        {/* Tabla Detallada de Tenants */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Detalle de Uso por Tenant</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Todos los tenants ordenados por consumo de almacenamiento</p>
          </div>
          <div className="overflow-x-auto rounded border dark:border-slate-800">
            <table className="w-full dark:bg-slate-800/80">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="text-left py-3 px-6 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">Tenant</th>
                  <th className="text-center py-3 px-6 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">Plan</th>
                  <th className="text-right py-3 px-6 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                    <div className="flex items-center justify-end gap-1">
                      <FontAwesomeIcon icon={faDatabase} className="h-3 w-3" />
                      <span>Almacenamiento</span>
                    </div>
                  </th>
                  <th className="text-right py-3 px-6 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                    <div className="flex items-center justify-end gap-1">
                      <FontAwesomeIcon icon={faUsers} className="h-3 w-3" />
                      <span>Usuarios</span>
                    </div>
                  </th>
                  <th className="text-right py-3 px-6 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                    <div className="flex items-center justify-end gap-1">
                      <FontAwesomeIcon icon={faUsers} className="h-3 w-3" />
                      <span>Clientes</span>
                    </div>
                  </th>
                  <th className="text-center py-3 px-6 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {metrics.topConsumers.map((tenant) => {
                  const storagePercent = tenant.storageLimitMB > 0 ? (tenant.storageUsedMB / tenant.storageLimitMB) * 100 : 0;
                  const planColor = planColors[tenant.plan] || planColors.free;

                  return (
                    <tr key={tenant._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors" onClick={() => navigate("/tenants")}>
                      <td className="py-4 px-6">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{tenant.name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{tenant.slug}</p>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${planColor.bg} ${planColor.text} border ${planColor.border} capitalize`}>{tenant.plan}</span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {tenant.storageUsedMB} / {tenant.storageLimitMB} MB
                          </div>
                          <div className="flex items-center justify-end gap-2 mt-1">
                            <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                              <div className={`h-1.5 rounded-full ${storagePercent > 90 ? "bg-red-500" : storagePercent > 70 ? "bg-blue-500" : "bg-blue-500"}`} style={{ width: `${Math.min(storagePercent, 100)}%` }}></div>
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{storagePercent.toFixed(0)}%</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{tenant.users}</span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{tenant.clients}</span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tenant.isActive ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"}`}>{tenant.isActive ? "Activo" : "Inactivo"}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Resumen de Recursos */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Resumen de Recursos Globales</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <FontAwesomeIcon icon={faUsers} className="h-8 w-8 text-blue-600 dark:text-blue-400 mb-3" />
              <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">{metrics.resources.totalUsers}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Usuarios Totales</p>
            </div>
            <div className="text-center p-6 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <FontAwesomeIcon icon={faUsers} className="h-8 w-8 text-purple-600 dark:text-purple-400 mb-3" />
              <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">{metrics.resources.totalClients}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Clientes Totales</p>
            </div>
            <div className="text-center p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <FontAwesomeIcon icon={faBullhorn} className="h-8 w-8 text-blue-600 dark:text-blue-400 mb-3" />
              <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">{metrics.resources.totalCampaigns}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Campañas Totales</p>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};
