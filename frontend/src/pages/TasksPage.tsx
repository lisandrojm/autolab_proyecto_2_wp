import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../stores/authStore";
import { PageLayout } from "../components/ui/PageLayout";
import { Plus, Search, Filter, CheckSquare, Clock, AlertCircle, Calendar } from "lucide-react";
import { faPalette, faPenNib, faCircleCheck, faBullhorn, faChartBar, faClipboard } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { getHelp, hasHelp } from "../data/help/helpContent";

interface Task {
  _id: string;
  title: string;
  description?: string;
  type: "design" | "copy" | "approval" | "publish" | "analysis" | "other";
  priority: "low" | "medium" | "high" | "urgent";
  status: "todo" | "in_progress" | "review" | "done";
  assignedTo: string[];
  dueDate?: string;
  estimatedHours?: number;
  actualHours?: number;
  createdAt: string;
}

const taskColumns = [
  { id: "todo", title: "Por Hacer", color: "bg-gray-100 dark:bg-gray-700" },
  { id: "in_progress", title: "En Progreso", color: "bg-gray-100 dark:bg-gray-700" },
  { id: "review", title: "Revisión", color: "bg-gray-100 dark:bg-gray-700" },
  { id: "done", title: "Completado", color: "bg-gray-100 dark:bg-gray-700" },
];

const HELP_KEY = "tasks" as const;

export const TasksPage: React.FC = () => {
  const { t } = useTranslation();
  const { token, tenantId } = useAuthStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [openInfo, setOpenInfo] = useState(false);

  const helpEntry = getHelp(HELP_KEY);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/tasks`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTasks(data);
      }
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) || task.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === "all" || task.type === filterType;
    return matchesSearch && matchesFilter;
  });

  const getTasksByStatus = (status: string) => {
    return filteredTasks.filter((task) => task.status === status);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "text-red-600 dark:text-red-400";
      case "high":
        return "text-blue-600 dark:text-blue-400";
      case "medium":
        return "text-blue-600 dark:text-blue-400";
      case "low":
        return "text-blue-600 dark:text-blue-400";
      default:
        return "text-gray-600 dark:text-gray-400";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "design":
        return <FontAwesomeIcon icon={faPalette} className="h-4 w-4 text-purple-500" />;
      case "copy":
        return <FontAwesomeIcon icon={faPenNib} className="h-4 w-4 text-blue-500" />;
      case "approval":
        return <FontAwesomeIcon icon={faCircleCheck} className="h-4 w-4 text-blue-500" />;
      case "publish":
        return <FontAwesomeIcon icon={faBullhorn} className="h-4 w-4 text-blue-500" />;
      case "analysis":
        return <FontAwesomeIcon icon={faChartBar} className="h-4 w-4 text-indigo-500" />;
      default:
        return <FontAwesomeIcon icon={faClipboard} className="h-4 w-4 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <PageLayout
        title="Tareas"
        subtitle="Tablero Kanban para gestión de flujo de trabajo"
        icon={CheckSquare}
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
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">{t("common.loading")}</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Tareas"
      subtitle="Tablero Kanban para gestión de flujo de trabajo"
      icon={CheckSquare}
      headerActions={
        <button className="btn-primary flex items-center space-x-2 w-full sm:w-auto justify-center">
          <Plus className="h-5 w-5" />
          <span>Nueva Tarea</span>
        </button>
      }
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
      {/* Search and Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input type="text" placeholder="Buscar tareas..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white" />
          </div>
          <div className="flex items-center space-x-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white">
              <option value="all">Todos los tipos</option>
              <option value="design">Diseño</option>
              <option value="copy">Copy</option>
              <option value="approval">Aprobación</option>
              <option value="publish">Publicación</option>
              <option value="analysis">Análisis</option>
              <option value="other">Otro</option>
            </select>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {taskColumns.map((column) => (
          <div key={column.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <div className={`${column.color} px-4 py-3 rounded-t-xl`}>
              <h3 className="font-semibold text-gray-900 dark:text-white">{column.title}</h3>
              <span className="text-sm text-gray-600 dark:text-gray-400">{getTasksByStatus(column.id).length} tareas</span>
            </div>

            <div className="p-4 space-y-3 min-h-[400px]">
              {getTasksByStatus(column.id).map((task) => (
                <div key={task._id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 hover:shadow-sm transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-gray-900 dark:text-white text-sm">{task.title}</h4>
                    {getTypeIcon(task.type)}
                  </div>

                  {task.description && <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">{task.description}</p>}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className={`h-3 w-3 ${getPriorityColor(task.priority)}`} />
                      <span className={`text-xs font-medium ${getPriorityColor(task.priority)}`}>{task.priority}</span>
                    </div>

                    {task.dueDate && (
                      <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-500">
                        <Calendar className="h-3 w-3" />
                        <span>{new Date(task.dueDate).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>

                  {task.estimatedHours && (
                    <div className="flex items-center space-x-1 mt-2 text-xs text-gray-500 dark:text-gray-500">
                      <Clock className="h-3 w-3" />
                      <span>{task.estimatedHours}h estimadas</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {filteredTasks.length === 0 && (
        <div className="text-center py-12">
          <CheckSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No hay tareas</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">Crea tu primera tarea para comenzar a organizar el flujo de trabajo.</p>
          <button className="btn-primary flex items-center justify-center">
            <Plus className="h-5 w-5 mr-2" />
            Nueva Tarea
          </button>
        </div>
      )}
    </PageLayout>
  );
};
