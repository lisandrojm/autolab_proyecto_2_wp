import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { hrDashboardAPI, VacationAvailable, VacationStats, OrderStats, Activity } from '../api/hr';
import { PageLayout } from '../components/ui/PageLayout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHome,
  faUser,
  faCalendarDays,
  faBoxArchive,
  faBell,
  faChartLine,
} from '@fortawesome/free-solid-svg-icons';

export const AdminDashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [vacations, setVacations] = useState<VacationAvailable | null>(null);
  const [vacationStats, setVacationStats] = useState<VacationStats | null>(null);
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [recentActivity, setRecentActivity] = useState<Activity[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const { data } = await hrDashboardAPI.getStats();
      setVacations(data.vacations);
      setVacationStats(data.vacationStats);
      setOrderStats(data.orderStats);
      setNotificationCount(data.notificationCount);
      setRecentActivity(data.recentActivity);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Cargando dashboard..." />;
  }

  const displayName =
    user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : user?.firstName || user?.lastName || user?.email || 'Usuario';

  const statCards = [
    {
      title: 'Mi Perfil',
      value: displayName,
      subtitle: user?.position || 'Empleado',
      icon: faUser,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      onClick: () => navigate('/admin/personal/perfil'),
    },
    {
      title: 'Vacaciones Disponibles',
      value: vacations?.available || 0,
      subtitle: `${vacations?.used || 0} usados de ${vacations?.total || 0}`,
      icon: faCalendarDays,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      onClick: () => navigate('/admin/personal/novedades/vacaciones'),
    },
    {
      title: 'Solicitudes de Vacaciones',
      value: vacationStats?.pending || 0,
      subtitle: `${vacationStats?.total || 0} total`,
      icon: faCalendarDays,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      onClick: () => navigate('/admin/personal/novedades/vacaciones'),
    },
    {
      title: 'Pedidos Pendientes',
      value: orderStats?.pending || 0,
      subtitle: `${orderStats?.total || 0} total`,
      icon: faBoxArchive,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      onClick: () => navigate('/admin/personal/pedidos'),
    },
    {
      title: 'Notificaciones',
      value: notificationCount,
      subtitle: 'Sin leer',
      icon: faBell,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      onClick: () => navigate('/admin/personal/notificaciones'),
    },
  ];

  return (
    <PageLayout
      title="Inicio"
      subtitle={`Bienvenido, ${displayName}`}
      faIcon={{ icon: faHome }}
    >
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {statCards.map((stat) => (
            <div
              key={stat.title}
              onClick={stat.onClick}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 p-6 cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {stat.title}
                  </p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                    {stat.value}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    {stat.subtitle}
                  </p>
                </div>
                <div className={`p-4 rounded-xl ${stat.bgColor}`}>
                  <FontAwesomeIcon icon={stat.icon} className={`h-8 w-8 ${stat.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Access Links */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Vacation Stats */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <FontAwesomeIcon
                icon={faCalendarDays}
                className="h-5 w-5 text-blue-500"
              />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Estadísticas de Vacaciones
              </h3>
            </div>
            {vacationStats ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Pendientes</span>
                  <span className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                    {vacationStats.pending}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Aprobadas</span>
                  <span className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                    {vacationStats.approved}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Rechazadas</span>
                  <span className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                    {vacationStats.rejected}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No hay datos de vacaciones
              </p>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <FontAwesomeIcon icon={faChartLine} className="h-5 w-5 text-blue-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Actividad Reciente
              </h3>
            </div>
            {recentActivity && recentActivity.length > 0 ? (
              <div className="space-y-3">
                {recentActivity.slice(0, 5).map((activity, index) => {
                  const date = new Date(activity.timestamp);
                  const isToday = date.toDateString() === new Date().toDateString();
                  const timeStr = date.toLocaleTimeString('es-ES', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const dateStr = date.toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: 'short',
                  });

                  return (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                    >
                      <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-blue-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 dark:text-white">
                          {activity.description}
                        </p>
                        {activity.userName && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            por {activity.userName}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {isToday ? timeStr : dateStr}
                      </span>
                    </div>
                  );
                })}
                <button
                  onClick={() => navigate('/admin/personal/actividad')}
                  className="w-full text-center text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2"
                >
                  Ver toda la actividad
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No hay actividad reciente
              </p>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-gradient-to-br from-primary-50 to-blue-50 dark:from-gray-800 dark:to-gray-900 rounded-xl shadow-sm p-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Sistema de Gestión de Personal
            </h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-6">
              Gestiona tus solicitudes, vacaciones, documentos y más desde un solo lugar.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <button
                onClick={() => navigate('/admin/personal/novedades/vacaciones')}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Solicitar Vacaciones
              </button>
              <button
                onClick={() => navigate('/admin/personal/pedidos')}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Hacer Pedido
              </button>
              <button
                onClick={() => navigate('/admin/personal/documentos')}
                className="px-6 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors border border-gray-300 dark:border-gray-600"
              >
                Ver Documentos
              </button>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};
