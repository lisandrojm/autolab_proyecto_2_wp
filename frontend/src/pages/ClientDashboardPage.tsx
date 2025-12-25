import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useClientContextStore } from "../stores/clientContextStore";

import { PageLayout } from "../components/ui/PageLayout";
import { Card } from "../components/ui/Card";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChartLine, faBullhorn, faClipboardCheck, faCalendarDays, faEye, faFileText, faImage, faClock } from "@fortawesome/free-solid-svg-icons";
import { getHelp, hasHelp } from "../data/help/helpContent";

const HELP_KEY = "clientDashboard" as const;

interface DashboardStats {
  activeProjects: number;
  pendingApprovals: number;
  scheduledPosts: number;
}

interface Activity {
  _id: string;
  type: "post" | "project";
  title: string;
  status?: string;
  updatedAt: string;
}

export const ClientDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { token, tenantId, user } = useAuthStore();
  const { selectedClient } = useClientContextStore();

  const [stats, setStats] = useState<DashboardStats>({
    activeProjects: 0,
    pendingApprovals: 0,
    scheduledPosts: 0,
  });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  // info modal (ⓘ)
  const [openInfo, setOpenInfo] = useState(false);

  const helpEntry = getHelp(HELP_KEY);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch projects
      const projectsResponse = await fetch(`${import.meta.env.VITE_API_URL}/projects`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
      });

      // Fetch posts
      const postsResponse = await fetch(`${import.meta.env.VITE_API_URL}/posts`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
      });

      if (projectsResponse.ok && postsResponse.ok) {
        const projects = await projectsResponse.json();
        const posts = await postsResponse.json();

        // Calculate stats
        const activeProjects = projects.filter((p: any) => p.status === "active").length;
        const pendingApprovals = posts.filter((p: any) => p.status === "pending_approval" || p.status === "in_review").length;
        const scheduledPosts = posts.filter((p: any) => p.scheduling?.isScheduled && new Date(p.scheduling.publishAt) > new Date()).length;

        setStats({
          activeProjects,
          pendingApprovals,
          scheduledPosts,
        });

        // Create activities list (last 5 items)
        const allActivities: Activity[] = [
          ...posts.map((p: any) => ({
            _id: p._id,
            type: "post" as const,
            title: p.title,
            status: p.status,
            updatedAt: p.updatedAt,
          })),
          ...projects.map((p: any) => ({
            _id: p._id,
            type: "project" as const,
            title: p.name,
            status: p.status,
            updatedAt: p.updatedAt,
          })),
        ];

        // Sort by updatedAt and take last 5
        const sortedActivities = allActivities.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5);

        setActivities(sortedActivities);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "post":
        return faImage;
      case "project":
        return faBullhorn;

      default:
        return faFileText;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case "post":
        return "text-blue-600 dark:text-blue-400";
      case "project":
        return "text-blue-600 dark:text-blue-400";

      default:
        return "text-gray-600 dark:text-gray-400";
    }
  };

  if (loading) return <LoadingSpinner message="Cargando dashboard..." />;

  return (
    <PageLayout
      title="Dashboard"
      subtitle={`Bienvenido, ${user?.email}`}
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
      clientMiniAvatar={
        selectedClient
          ? {
              alt: `${selectedClient.name} logo`,
              fallback: selectedClient.name?.charAt(0)?.toUpperCase() || "?",
              label: selectedClient.name,
            }
          : undefined
      }
    >
      <div className="space-y-6">
        {/* KPIs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card
            header={{
              title: "Proyectos Activos",
              icon: faBullhorn,
              badges: [],
            }}
            onClick={() => navigate("/client/proyectos")}
          >
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.activeProjects}</p>
              <p className="text-sm text-gray-500 dark:text-gray-500">En ejecución</p>
            </div>
          </Card>

          <Card
            header={{
              title: "Aprobaciones Pendientes",
              icon: faClipboardCheck,
              badges: [],
            }}
            onClick={() => navigate("/client/aprobaciones")}
          >
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pendingApprovals}</p>
              <p className="text-sm text-gray-500 dark:text-gray-500">Publicaciones por revisar</p>
            </div>
          </Card>

          <Card
            header={{
              title: "Próximas Publicaciones",
              icon: faCalendarDays,
              badges: [],
            }}
            onClick={() => navigate("/client/aprobaciones")}
          >
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.scheduledPosts}</p>
              <p className="text-sm text-gray-500 dark:text-gray-500">Programadas</p>
            </div>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Acciones Rápidas</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button onClick={() => navigate("/client/aprobaciones")} className="flex items-center justify-center space-x-2 p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
              <FontAwesomeIcon icon={faEye} className="h-5 w-5" />
              <span className="font-medium">Ver Aprobaciones</span>
            </button>

            <button onClick={() => navigate("/client/proyectos")} className="flex items-center justify-center space-x-2 p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100/20 dark:hover:bg-blue-900/30 transition-colors">
              <FontAwesomeIcon icon={faBullhorn} className="h-5 w-5" />
              <span className="font-medium">Ver Proyectos</span>
            </button>
          </div>
        </div>

        {/* Recent Activities */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Actividad Reciente</h3>
          {activities.length === 0 ? (
            <div className="text-center py-8">
              <FontAwesomeIcon icon={faClock} className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No hay actividad reciente</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map((activity) => (
                <div key={activity._id} className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <FontAwesomeIcon icon={getActivityIcon(activity.type)} className={`h-5 w-5 ${getActivityColor(activity.type)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{activity.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      {activity.type} • {activity.status} • {new Date(activity.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
};
