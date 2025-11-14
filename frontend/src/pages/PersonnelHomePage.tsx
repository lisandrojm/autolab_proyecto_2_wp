import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Card } from "../components/ui/Card";
import { personnelAPI } from "../api/personnel";
import { mockProfileService, mockVacationsService, mockNotificationsService, mockActivityService, mockOrdersService } from "../services";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarDays, faFileLines, faBell, faClipboardList, faCalendar, faChartLine, faShoppingCart } from "@fortawesome/free-solid-svg-icons";

export const PersonnelHomePage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [vacationBalance, setVacationBalance] = useState<any>(null);
  const [vacationStats, setVacationStats] = useState<any>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [orderStats, setOrderStats] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [profileData, profileStats, vacBalance, vacStats, notifCount, activity, ordersStats] = await Promise.all([mockProfileService.getProfile().catch(() => personnelAPI.getProfile()), mockProfileService.getProfileStats().catch(() => personnelAPI.getProfileStats()), mockVacationsService.getVacationAvailable().catch(() => personnelAPI.getVacationAvailable()), mockVacationsService.getVacationStats().catch(() => personnelAPI.getVacationStats()), mockNotificationsService.getNotificationCount().catch(() => personnelAPI.getNotificationCount()), mockActivityService.getRecentActivity().catch(() => personnelAPI.getRecentActivity()), mockOrdersService.getOrderStats().catch(() => personnelAPI.getOrderStats())]);

      setProfile(profileData);
      setStats(profileStats);
      setVacationBalance(vacBalance);
      setVacationStats(vacStats);
      setNotificationCount(notifCount.count);
      setRecentActivity(activity.slice(0, 5));
      setOrderStats(ordersStats);
    } catch (error) {
      console.error("Error fetching personnel home data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Cargando información personal..." />;
  }

  const summaryCards = [
    {
      title: "Vacaciones Disponibles",
      value: vacationBalance?.available || 0,
      subtitle: `${vacationBalance?.used || 0} días usados`,
      icon: faCalendar,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
      onClick: () => navigate("/admin/pedidos/vacaciones"),
    },
    {
      title: "Pedidos",
      value: orderStats?.pending || 0,
      subtitle: `${orderStats?.approved || 0} aprobados`,
      icon: faShoppingCart,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-50 dark:bg-green-900/20",
      onClick: () => navigate("/admin/pedidos/pedidos"),
      badge: "Nuevo",
    },
    {
      title: "Notificaciones",
      value: notificationCount,
      subtitle: "No leídas",
      icon: faBell,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
      onClick: () => navigate("/admin/personal/notificaciones"),
    },
    {
      title: "Días Trabajados",
      value: stats?.daysWorked || 0,
      subtitle: "Este año",
      icon: faCalendarDays,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
      onClick: () => navigate("/admin/personal/perfil"),
    },
  ];

  const quickLinks = [
    { title: "Mi Perfil", icon: faChartLine, path: "/admin/personal/perfil" },
    { title: "Vacaciones", icon: faCalendar, path: "/admin/pedidos/vacaciones" },
    { title: "Pedidos", icon: faShoppingCart, path: "/admin/pedidos/pedidos", badge: "Nuevo" },
    { title: "Documentos", icon: faFileLines, path: "/admin/personal/documentos" },
    { title: "Calendario", icon: faCalendarDays, path: "/admin/personal/calendario" },
  ];

  return (
    <PageLayout title="Panel de Personal" subtitle={`Bienvenido, ${profile?.firstName || profile?.email}`} faIcon={{ icon: faChartLine }}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {summaryCards.map((card, index) => (
            <div key={index} onClick={card.onClick} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 p-6 cursor-pointer relative">
              {(card as any).badge && <span className="absolute top-2 right-2 px-2 py-1 rounded-full text-[10px] font-bold bg-green-500 text-white uppercase">{(card as any).badge}</span>}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{card.title}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{card.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{card.subtitle}</p>
                </div>
                <div className={`p-4 rounded-xl ${card.bgColor}`}>
                  <FontAwesomeIcon icon={card.icon} className={`h-8 w-8 ${card.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Accesos Rápidos</h3>
            <div className="grid grid-cols-2 gap-4">
              {quickLinks.map((link, index) => (
                <button key={index} onClick={() => navigate(link.path)} className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative">
                  {(link as any).badge && <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-green-500 text-white uppercase">{(link as any).badge}</span>}
                  <FontAwesomeIcon icon={link.icon} className="h-6 w-6 text-blue-600 dark:text-blue-400 mb-2" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white text-center">{link.title}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Actividad Reciente</h3>
            {recentActivity.length > 0 ? (
              <div className="space-y-3">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-blue-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-white">{activity.description}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{new Date(activity.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No hay actividad reciente</p>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
};
