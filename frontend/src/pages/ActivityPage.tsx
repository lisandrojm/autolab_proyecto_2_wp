import React, { useEffect, useState } from "react";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { mockActivityService } from "../services";
import type { ActivityRecordAPI as ActivityRecord } from "../mocks";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHistory, faList } from "@fortawesome/free-solid-svg-icons";

export const ActivityPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetchActivity();
  }, [showAll]);

  const fetchActivity = async () => {
    try {
      setLoading(true);
      const data = showAll ? await mockActivityService.getAllActivity() : await mockActivityService.getRecentActivity();
      setActivity(data);
    } catch (error) {
      console.error("Error fetching activity:", error);
      sweetAlert.error("Error", "No se pudo cargar la actividad");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Cargando actividad..." />;
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "vacation":
        return "bg-blue-500";
      case "document":
        return "bg-blue-500";
      case "notification":
        return "bg-blue-500";
      case "profile":
        return "bg-blue-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <PageLayout
      title="Actividad Reciente"
      subtitle="Historial de acciones y eventos"
      faIcon={{ icon: faHistory }}
      headerActions={
        <button onClick={() => setShowAll(!showAll)} className="btn-ghost text-sm">
          <FontAwesomeIcon icon={faList} className="mr-2" />
          {showAll ? "Ver Recientes" : "Ver Todas"}
        </button>
      }
    >
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="space-y-4">
            {activity.map((record, index) => {
              const isToday = new Date(record.createdAt).toDateString() === new Date().toDateString();
              const date = new Date(record.createdAt);

              return (
                <div key={record._id} className="flex items-start gap-4">
                  <div className="relative flex flex-col items-center">
                    <div className={`w-3 h-3 rounded ${getTypeColor(record.type)} flex-shrink-0`}></div>
                    {index < activity.length - 1 && <div className="w-0.5 h-full bg-gray-200 dark:bg-gray-700 mt-2"></div>}
                  </div>
                  <div className="flex-1 pb-8">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{record.action}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{record.description}</p>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-500 whitespace-nowrap ml-4">{isToday ? date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {activity.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl">
            <FontAwesomeIcon icon={faHistory} className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">No hay actividad registrada</p>
          </div>
        )}
      </div>
    </PageLayout>
  );
};
